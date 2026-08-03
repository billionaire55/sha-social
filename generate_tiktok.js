// generate_tiktok.js
// Renders a mascot video for TikTok/Shorts using fal.ai (Kling for animation,
// ElevenLabs for voice), then assembles it with ffmpeg (captions + audio + concat).
//
// Output: today_tiktok.mp4
// Requires: assets/mascot.png committed to the repo.
// Requires env: FAL_KEY, GITHUB_REPOSITORY
//
// CACHING: generated voice + video for each scene are cached in .cache/tiktok/.
// Re-running with the SAME script text reuses cached fal.ai output — free.
// Set FORCE_REGEN=1 to force fresh (billed) generation.
// This cache only survives across sessions once committed and PUSHED to
// GitHub (via the Git panel, not raw `git push` — that has no credentials
// in this environment). It is also excluded by a .gitignore rule somewhere
// in this environment, so adding it always requires `git add -f`.
//
// CTA NOTE: TikTok requires 1,000+ followers before a personal account's bio
// link is clickable, so scene 2 points to the brand name instead of "link
// in bio." Kept short deliberately — see DURATION note below.
//
// CAPTIONS: self-computed proportional split (small word groups timed across
// the scene's real audio duration), each caption line drawn separately with
// its "enable" window's commas escaped (unescaped commas were previously
// read by ffmpeg's filter-graph parser as chain separators, causing captions
// to freeze instead of changing).
//
// DURATION: Kling only generates 5s or 10s clips. If the voiceover runs
// longer than the clip (e.g. a long product name pushes scene 2 past 10s),
// the clip is SEAMLESSLY LOOPED (ffmpeg -stream_loop) to cover the gap,
// instead of freezing on the last frame — freezing stopped the mouth/gesture
// motion entirely for the remainder, which read as "her lips stopped
// moving." Looping keeps the animation continuously in motion, at the cost
// of being visibly repetitive if the gap is large. Keeping scene 2's CTA
// short also reduces how often looping is needed at all.
//
// KNOWN LIMITATION: Kling's mouth animation is prompt-driven, not
// audio-driven — an accepted trade-off, not a bug.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { execSync } = require("child_process");
const { fal } = require("@fal-ai/client");

const CACHE_DIR = path.join(process.cwd(), ".cache", "tiktok");
const FORCE_REGEN = process.env.FORCE_REGEN === "1";
const VOICE_SPEED = 0.85;

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

function mascotImageUrl() {
  const repo = process.env.GITHUB_REPOSITORY || "billionaire55/sha-social";
  return `https://raw.githubusercontent.com/${repo}/main/assets/mascot.png`;
}

function buildScript(posts) {
  const meta = posts._meta;
  const price = meta.price === "$0" ? "free" : meta.price;

  const scene1 = posts.graphic_headline
    ? `${posts.graphic_headline}. ${posts.graphic_subline || ""}`.trim()
    : "Here's something most people overlook.";

  const scene2 =
    `Check out ${meta.product}, just ${price}. ` +
    `One-time payment, yours forever — visit Smarter Hustle Academy.`;

  return [scene1, scene2];
}

// --- Caption helpers -------------------------------------------------

const FRAME_W = 1080;
const FRAME_H = 1920;
const FONT_SIZE = 42;
const LINE_HEIGHT = FONT_SIZE + 14;
const MAX_CHARS_PER_LINE = 22;
const CAPTION_BOTTOM_MARGIN = 360;
const WORDS_PER_CAPTION = 3;

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

function escForDrawtext(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

function drawtextForLines(lines, start, end) {
  const totalHeight = lines.length * LINE_HEIGHT;
  const firstLineY = FRAME_H - CAPTION_BOTTOM_MARGIN - totalHeight;

  return lines.map((line, i) => {
    const safe = escForDrawtext(line);
    const y = firstLineY + i * LINE_HEIGHT;
    return (
      `drawtext=text='${safe}':fontcolor=white:fontsize=${FONT_SIZE}:box=1:boxcolor=black@0.55:` +
      `boxborderw=14:x=(w-text_w)/2:y=${y}:` +
      `enable='between(t\\,${start}\\,${end})'`
    );
  });
}

function captionsFromProportionalSplit(text, totalDuration) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const groups = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CAPTION) {
    groups.push(words.slice(i, i + WORDS_PER_CAPTION).join(" "));
  }
  const each = totalDuration / groups.length;
  return groups.map((text, i) => ({
    text,
    start: i * each,
    end: (i + 1) * each
  }));
}

function buildCaptionFilters(scene, sceneIndex) {
  const groups = captionsFromProportionalSplit(scene.text, scene.audioDuration);

  console.log(`Scene ${sceneIndex}: caption windows`);
  groups.forEach((g, i) =>
    console.log(`  [${i}] ${g.start.toFixed(2)}s - ${g.end.toFixed(2)}s : "${g.text}"`)
  );

  return groups
    .flatMap(g => {
      const lines = wrapLines(g.text, MAX_CHARS_PER_LINE);
      return drawtextForLines(lines, g.start.toFixed(2), g.end.toFixed(2));
    })
    .join(",");
}

function ffprobeDuration(p) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${p}"`
  ).toString().trim();
  return parseFloat(out) || 5;
}

// --- Caching -----------------------------------------------------------

function sceneCacheKey(line) {
  return crypto
    .createHash("sha256")
    .update(line + "|" + VOICE_SPEED + "|" + mascotImageUrl())
    .digest("hex")
    .slice(0, 16);
}

function cachedScenePaths(key) {
  const dir = path.join(CACHE_DIR, key);
  return {
    dir,
    videoPath: path.join(dir, "video.mp4"),
    audioPath: path.join(dir, "audio.mp3"),
    metaPath: path.join(dir, "meta.json")
  };
}

function loadFromCache(key) {
  const { videoPath, audioPath, metaPath } = cachedScenePaths(key);
  if (fs.existsSync(videoPath) && fs.existsSync(audioPath) && fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    return { videoPath, audioPath, audioDuration: meta.audioDuration, text: meta.text };
  }
  return null;
}

function saveToCache(key, scene) {
  const { dir, videoPath, audioPath, metaPath } = cachedScenePaths(key);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(scene.videoPath, videoPath);
  fs.copyFileSync(scene.audioPath, audioPath);
  fs.writeFileSync(
    metaPath,
    JSON.stringify({ text: scene.text, audioDuration: scene.audioDuration }, null, 2)
  );
}

// --- Scene generation --------------------------------------------------

async function generateSceneFresh(line, sceneIndex, tmpDir) {
  console.log(`Scene ${sceneIndex}: generating voice (fal.ai — billed)...`);
  const audioResult = await fal.subscribe("fal-ai/elevenlabs/tts/turbo-v2.5", {
    input: { text: line, speed: VOICE_SPEED }
  });
  const audioUrl = audioResult.data.audio.url;
  const audioPath = `${tmpDir}/scene${sceneIndex}_audio.mp3`;
  await downloadFile(audioUrl, audioPath);

  const audioDuration = ffprobeDuration(audioPath);
  const klingDuration = audioDuration <= 5 ? "5" : "10";

  console.log(`Scene ${sceneIndex}: animating mascot (fal.ai — billed; audio ${audioDuration.toFixed(2)}s, requesting video ${klingDuration}s)...`);
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

async function getScene(line, sceneIndex, tmpDir) {
  const key = sceneCacheKey(line);

  if (!FORCE_REGEN) {
    const cached = loadFromCache(key);
    if (cached) {
      console.log(`Scene ${sceneIndex}: using cached voice+video (no charge) — key ${key}`);
      return cached;
    }
  }

  const fresh = await generateSceneFresh(line, sceneIndex, tmpDir);
  saveToCache(key, fresh);
  return fresh;
}

// --- Assembly (always runs fresh — this is the free, iterable part) ----

function renderScene(scene, sceneIndex, tmpDir) {
  const outPath = `${tmpDir}/scene${sceneIndex}_final.mp4`;
  const videoDuration = ffprobeDuration(scene.videoPath);
  const captionFilters = buildCaptionFilters(scene, sceneIndex);

  const needsLoop = scene.audioDuration > videoDuration + 0.05;

  console.log(
    `Scene ${sceneIndex}: audio=${scene.audioDuration.toFixed(2)}s video=${videoDuration.toFixed(2)}s ` +
    `${needsLoop ? "looping clip to cover full audio length (no freeze)" : "no loop needed"}`
  );

  // -stream_loop -1 on the video INPUT loops it indefinitely; -t on the
  // output trims the combined result to exactly the audio length. This
  // keeps the mascot continuously animated instead of freezing on a still
  // frame when the voiceover runs longer than one Kling clip.
  const videoInputFlags = needsLoop ? "-stream_loop -1" : "";

  const cmd = [
    "ffmpeg -y",
    `${videoInputFlags} -i "${scene.videoPath}"`,
    `-i "${scene.audioPath}"`,
    `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${captionFilters}"`,
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

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmpDir = "/tmp/tiktok_frames";
  fs.mkdirSync(tmpDir, { recursive: true });

  const [line1, line2] = buildScript(posts);

  const scene1 = await getScene(line1, 1, tmpDir);
  const scene2 = await getScene(line2, 2, tmpDir);

  console.log("Rendering scenes with captions (free — local ffmpeg only)...");
  const final1 = renderScene(scene1, 1, tmpDir);
  const final2 = renderScene(scene2, 2, tmpDir);

  console.log("Concatenating scenes (re-encoding for clean sync)...");
  const concatFile = `${tmpDir}/concat.txt`;
  fs.writeFileSync(concatFile, `file '${final1}'\nfile '${final2}'\n`);

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
