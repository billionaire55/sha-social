// generate_tiktok.js
// Renders a mascot video for TikTok/Shorts using fal.ai (Kling for animation,
// ElevenLabs for voice), then assembles it with ffmpeg (wrapped captions + audio + concat).
//
// Output: today_tiktok.mp4
// Requires: assets/mascot.png committed to the repo (publicly reachable via raw.githubusercontent.com)
// Requires env: FAL_KEY, GITHUB_REPOSITORY (already available in Actions)

const fs = require("fs");
const https = require("https");
const { execSync } = require("child_process");
const { fal } = require("@fal-ai/client");

function downloadFile(url, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`Download failed: ${res.statusCode} for ${url}`));
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", reject);
  });
}

// Public URL to the mascot still image, hosted directly from this repo.
function mascotImageUrl() {
  const repo = process.env.GITHUB_REPOSITORY || "billionaire55/sha-social";
  return `https://raw.githubusercontent.com/${repo}/main/assets/mascot.png`;
}

// Build two narration lines from today's generated post copy.
function buildScript(posts) {
  const meta = posts._meta;
  const price = meta.price === "$0" ? "free" : meta.price;

  const scene1 = posts.graphic_headline
    ? `${posts.graphic_headline}. ${posts.graphic_subline || ""}`.trim()
    : "Here's something most people overlook.";

  const scene2 =
    `Check out ${meta.product}, just ${price}. ` +
    `One-time payment, yours forever. Link in bio to get started.`;

  return [scene1, scene2];
}

// --- Caption helpers -------------------------------------------------

// Word-wrap plain text to a max character width per line.
function wrapLines(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const candidate = (line + " " + w).trim();
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Split a scene's narration into 2 shorter caption chunks so the caption
// changes partway through the clip instead of sitting frozen the whole time.
function splitIntoChunks(text) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length <= 6) return [text];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

function escForDrawtext(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

// Build a drawtext filter for one caption chunk, wrapped to fit the 1080px
// frame, shown only during [start, end] seconds of the scene.
function captionFilter(text, start, end) {
  const lines = wrapLines(text, 26).map(escForDrawtext);
  const joined = lines.join("\n");
  return (
    `drawtext=text='${joined}':fontcolor=white:fontsize=46:box=1:boxcolor=black@0.55:` +
    `boxborderw=18:x=(w-text_w)/2:y=h-360:line_spacing=10:` +
    `enable='between(t,${start},${end})'`
  );
}

function ffprobeDuration(path) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${path}"`
  ).toString().trim();
  return parseFloat(out) || 5;
}

// --- Scene generation --------------------------------------------------

async function generateScene(line, sceneIndex, tmpDir) {
  console.log(`Scene ${sceneIndex}: generating voice...`);
  const audioResult = await fal.subscribe("fal-ai/elevenlabs/tts/turbo-v2.5", {
    input: { text: line }
  });
  const audioUrl = audioResult.data.audio.url;
  const audioPath = `${tmpDir}/scene${sceneIndex}_audio.mp3`;
  await downloadFile(audioUrl, audioPath);

  const audioDuration = ffprobeDuration(audioPath);
  // Kling supports fixed durations; round up to the nearest supported value.
  const klingDuration = audioDuration <= 5 ? "5" : "10";

  console.log(`Scene ${sceneIndex}: animating mascot (audio ${audioDuration.toFixed(1)}s, video ${klingDuration}s)...`);
  const videoResult = await fal.subscribe("fal-ai/kling-video/v2.6/pro/image-to-video", {
    input: {
      prompt:
        "Confident cartoon presenter speaking directly to camera, animated mouth as if explaining " +
        "something, engaging hand gestures, warm energetic educational presenter energy, subtle " +
        "natural body movement, flat 2D cartoon style",
      start_image_url: mascotImageUrl(),
      duration: klingDuration
    }
  });
  const videoUrl = videoResult.data.video.url;
  const videoPath = `${tmpDir}/scene${sceneIndex}_video.mp4`;
  await downloadFile(videoUrl, videoPath);

  return { videoPath, audioPath, audioDuration, text: line };
}

// Burn wrapped, sequential captions onto a scene, replace its audio track
// with the generated voice, trim video to match audio length exactly,
// and normalize to 1080x1920 so scenes concat cleanly.
function renderScene(scene, sceneIndex, tmpDir) {
  const outPath = `${tmpDir}/scene${sceneIndex}_final.mp4`;
  const chunks = splitIntoChunks(scene.text);
  const chunkLen = scene.audioDuration / chunks.length;

  const drawtextFilters = chunks
    .map((chunk, i) => captionFilter(chunk, (i * chunkLen).toFixed(2), ((i + 1) * chunkLen).toFixed(2)))
    .join(",");

  const cmd = [
    "ffmpeg -y",
    `-i "${scene.videoPath}"`,
    `-i "${scene.audioPath}"`,
    `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${drawtextFilters}"`,
    "-map 0:v:0 -map 1:a:0",
    `-t ${scene.audioDuration.toFixed(2)}`,
    "-c:v libx264 -preset fast -crf 23 -c:a aac",
    `"${outPath}"`
  ].join(" ");

  execSync(cmd, { stdio: "inherit" });
  return outPath;
}

async function main() {
  const posts = JSON.parse(fs.readFileSync("today_posts.json", "utf8"));

  if (!process.env.FAL_KEY) {
    throw new Error("FAL_KEY environment variable not set.");
  }

  const tmpDir = "/tmp/tiktok_frames";
  fs.mkdirSync(tmpDir, { recursive: true });

  const [line1, line2] = buildScript(posts);

  const scene1 = await generateScene(line1, 1, tmpDir);
  const scene2 = await generateScene(line2, 2, tmpDir);

  console.log("Rendering scenes with wrapped captions...");
  const final1 = renderScene(scene1, 1, tmpDir);
  const final2 = renderScene(scene2, 2, tmpDir);

  console.log("Concatenating scenes (re-encoding for clean sync)...");
  const concatFile = `${tmpDir}/concat.txt`;
  fs.writeFileSync(concatFile, `file '${final1}'\nfile '${final2}'\n`);

  // Re-encode on concat (not -c copy) so mismatched internal timestamps
  // between the two independently-encoded scenes don't cause audio
  // skipping/repeating on playback.
  execSync(
    [
      "ffmpeg -y",
      `-f concat -safe 0 -i "${concatFile}"`,
      "-c:v libx264 -preset fast -crf 23 -c:a aac",
      "-movflags +faststart",
      "today_tiktok.mp4"
    ].join(" "),
    { stdio: "inherit" }
  );

  console.log("Wrote today_tiktok.mp4");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
