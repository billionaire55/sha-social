// generate_tiktok.js
// Renders a Higgsfield mascot video for TikTok/Shorts: two scenes, each with the
// SHA mascot animated + narrated, captions burned in, stitched into one MP4.
// Replaces the old 4-frame static SVG slideshow.
//
// Output: today_tiktok.mp4
// Requires: mascot-config.json (run setup_mascot.js once first)
// Requires env: HF_CREDENTIALS="KEY_ID:KEY_SECRET"

const fs = require("fs");
const https = require("https");
const { HiggsfieldClient } = require("@higgsfield/client");

const VOICE_ID = "b0f766b7-8703-4bd1-b973-f857c36837b6"; // "Maya" preset, tested in review

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

// Build two narration lines from today's generated post copy.
// Scene 1: the hook/problem. Scene 2: product + price + CTA.
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

async function generateScene(client, soulId, line, sceneIndex) {
  console.log(`Scene ${sceneIndex}: generating voice...`);
  const audioJob = await client.generate("/v1/audio/text2speech_v2", {
    prompt: line,
    variant: "elevenlabs",
    voice_type: "preset",
    voice_id: VOICE_ID
  });
  const audioUrl = audioJob.jobs[0].results.raw.url;

  console.log(`Scene ${sceneIndex}: generating mascot image...`);
  const imageJob = await client.generate("/v1/text2image/soul", {
    prompt:
      "Confident cartoon woman presenter, full color, warm expression, gesturing toward a tablet, " +
      "flat 2D cartoon illustration style, plain flat solid background filling the entire canvas edge to edge, " +
      "no border, no frame, no vignette, no rounded corners, no picture-within-picture effect",
    custom_reference_id: soulId,
    width_and_height: "PORTRAIT_1536x2048"
  });
  const imageUrl = imageJob.jobs[0].results.raw.url;

  console.log(`Scene ${sceneIndex}: animating...`);
  const videoJob = await client.generate("/v1/image2video/dop", {
    model: "dop-turbo",
    prompt:
      "Confident cartoon presenter speaking directly to camera, animated mouth as if explaining something, " +
      "engaging hand gestures, warm energetic educational presenter energy, subtle natural body movement",
    input_images: [{ type: "image_url", image_url: imageUrl }],
    duration: 8
  });
  const videoUrl = videoJob.jobs[0].results.raw.url;

  return { video: videoUrl, audio: audioUrl };
}

async function main() {
  const posts = JSON.parse(fs.readFileSync("today_posts.json", "utf8"));

  if (!fs.existsSync("mascot-config.json")) {
    throw new Error(
      "mascot-config.json not found. Run `node setup_mascot.js` once, locally, and commit the resulting file first."
    );
  }
  const { soul_id: soulId } = JSON.parse(fs.readFileSync("mascot-config.json", "utf8"));

  const client = new HiggsfieldClient(); // reads HF_CREDENTIALS from env

  const [line1, line2] = buildScript(posts);

  const scene1 = await generateScene(client, soulId, line1, 1);
  const scene2 = await generateScene(client, soulId, line2, 2);

  console.log("Assembling final video with captions...");
  // NOTE: verify this endpoint path against your Higgsfield dashboard/docs before
  // trusting it in the daily cron — this matches the model name tested interactively
  // but the exact REST path was not independently confirmed in official SDK docs.
  const finalJob = await client.generate("/v1/video/explainer_video", {
    items: [
      { video: scene1.video, audio: scene1.audio },
      { video: scene2.video, audio: scene2.audio }
    ],
    width: 1080,
    height: 1920,
    subtitles: { font: "patrick" }
  });
  const finalUrl = finalJob.jobs[0].results.raw.url;

  await downloadFile(finalUrl, "today_tiktok.mp4");
  console.log("Wrote today_tiktok.mp4");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
