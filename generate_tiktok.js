// generate_tiktok.js
// Renders a mascot video for TikTok/Shorts using fal.ai (Kling for animation,
// ElevenLabs for voice), then assembles it with ffmpeg (captions + audio + concat).
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

async function generateScene(line, sceneIndex, tmpDir) {
  console.log(`Scene ${sceneIndex}: generating voice...`);
  const audioResult = await fal.subscribe("fal-ai/elevenlabs/tts/turbo-v2.5", {
    input: { text: line }
  });
  const audioUrl = audioResult.data.audio.url;
  const audioPath = `${tmpDir}/scene${sceneIndex}_audio.mp3`;
  await downloadFile(audioUrl, audioPath);

  console.log(`Scene ${sceneIndex}: animating mascot...`);
  const videoResult = await fal.subscribe("fal-ai/kling-video/v2.6/pro/image-to-video", {
    input: {
      prompt:
        "Confident cartoon presenter speaking directly to camera, animated mouth as if explaining " +
        "something, engaging hand gestures, warm energetic educational presenter energy, subtle " +
        "natural body movement, flat 2D cartoon style",
      start_image_url: mascotImageUrl(),
      duration: "5"
    }
  });
  const videoUrl = videoResult.data.video.url;
  const videoPath = `${tmpDir}/scene${sceneIndex}_video.mp4`;
  await downloadFile(videoUrl, videoPath);

  return { videoPath, audioPath, text: line };
}

// Burn captions onto a scene, replace its audio track with the generated voice,
// and normalize to 1080x1920 so both scenes concat cleanly.
function renderScene(scene, sceneIndex, tmpDir) {
  const outPath = `${tmpDir}/scene${sceneIndex}_final.mp4`;
  const safeText = scene.text.replace(/'/g, "\u2019").replace(/:/g, "\\:");
  const drawtext =
    `drawtext=text='${safeText}':fontcolor=white:fontsize=52:box=1:boxcolor=black@0.55:` +
    `boxborderw=20:x=(w-text_w)/2:y=h-320:line_spacing=8`;

  const cmd = [
    "ffmpeg -y",
    `-i ${scene.videoPath}`,
    `-i ${scene.audioPath}`,
    `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${drawtext}"`,
    "-map 0:v:0 -map 1:a:0",
    "-c:v libx264 -preset fast -crf 23 -c:a aac -shortest",
    outPath
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

  console.log("Rendering scenes with captions...");
  const final1 = renderScene(scene1, 1, tmpDir);
  const final2 = renderScene(scene2, 2, tmpDir);

  console.log("Concatenating scenes...");
  const concatFile = `${tmpDir}/concat.txt`;
  fs.writeFileSync(concatFile, `file '${final1}'\nfile '${final2}'\n`);

  execSync(
    `ffmpeg -y -f concat -safe 0 -i ${concatFile} -c copy today_tiktok.mp4`,
    { stdio: "inherit" }
  );

  console.log("Wrote today_tiktok.mp4");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
