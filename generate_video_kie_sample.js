// generate_video_kie_sample.js
// TEST-ONLY SCRIPT — produces one sample video (kie_sample.mp4) using Kie.ai's
// Kling 3.0 image-to-video model, so you can compare quality against your
// current Higgsfield/fal.ai output before deciding whether Kie.ai replaces
// either one in the real daily pipeline.
//
// This is NOT wired into daily-offer.yml. It doesn't touch today_posts.json,
// doesn't post anywhere, and doesn't affect production. Run it manually via
// the "Kie.ai Video Sample (Test Only)" GitHub Actions workflow.
//
// Everything except the mascot-animation call is copied unchanged from
// generate_video_higgsfield.js (same voice model, same caption/watermark/
// music pipeline) so the only variable in this comparison is the animation
// engine itself.
//
// Requires env: FAL_KEY (voice, same as production), KIE_API_KEY (new)
// Requires: assets/mascot.png committed to the repo (same as production)

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");
const { fal } = require("@fal-ai/client");

const VOICE_SPEED = 0.85;
const KIE_API = "https://api.kie.ai";

const WATERMARK_FILTER =
  "drawtext=text='SMARTERHUSTLEACADEMY.COM':fontcolor=0xD4A017:fontsize=30:" +
  "borderw=2:bordercolor=0x16241D:x=(w-text_w)/2:y=64";

// Default test line — the actual hook line from your Aug 10 fal.ai run, so
// this sample is directly comparable to a video you already watched.
// Override by setting the TEST_LINE env var (the workflow exposes this as
// a manual input) if you want to test different script content instead.
const TEST_LINE =
  process.env.TEST_LINE ||
  "Your TikTok content is not the problem, your opening line is.";

// --- Shared helpers (copied from generate_video_higgsfield.js) -----------

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

function ffprobeDuration(p) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${p}"`
  ).toString().trim();
  return parseFloat(out);
}

const FRAME_W = 1080;
const FRAME_H = 1920;
const FONT_SIZE = 42;
const LINE_HEIGHT = FONT_SIZE + 14;
const CAPTION_BOTTOM_MARGIN = 360;
const WORDS_PER_CAPTION = 3;

function escForDrawtext(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
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
      `enable='between(t,${start},${end})'`
    );
  });
}

function wrapLines(text, maxChars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const candidate = (line + " " + w).trim();
    if (candidate.length > maxChars && line) { lines.push(line); line = w; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function captionsFromTimestamps(rawTimestamps) {
  if (!Array.isArray(rawTimestamps) || rawTimestamps.length === 0) return null;
  const words = rawTimestamps.map(t => ({
    word: t.word ?? t.text ?? t.char ?? "",
    start: t.start ?? t.start_time ?? t.timestamp_start ?? null,
    end: t.end ?? t.end_time ?? t.timestamp_end ?? null
  }));
  if (words.some(w => !w.word || w.start === null || w.end === null)) return null;
  const groups = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CAPTION) {
    const slice = words.slice(i, i + WORDS_PER_CAPTION);
    groups.push({
      text: slice.map(w => w.word).join(" ").trim(),
      start: slice[0].start,
      end: slice[slice.length - 1].end
    });
  }
  return groups;
}

function captionsFromProportionalSplit(text, totalDuration) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const groups = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CAPTION) {
    groups.push(words.slice(i, i + WORDS_PER_CAPTION).join(" "));
  }
  const each = totalDuration / groups.length;
  return groups.map((text, i) => ({ text, start: i * each, end: (i + 1) * each }));
}

function buildCaptionFilters(scene) {
  const groups =
    captionsFromTimestamps(scene.wordTimestamps) ||
    captionsFromProportionalSplit(scene.text, scene.audioDuration);
  return groups
    .flatMap(g => drawtextForLines(wrapLines(g.text, 22), g.start, g.end))
    .join(",");
}

// --- Kie.ai-specific calls -------------------------------------------------

function kieRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      `${KIE_API}${urlPath}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${process.env.KIE_API_KEY}`,
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
        }
      },
      res => {
        let data = "";
        res.on("data", c => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve({ status: res.statusCode, json });
          } catch (e) {
            reject(new Error(`Kie.ai returned non-JSON (HTTP ${res.statusCode}): ${data.slice(0, 500)}`));
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function createKieVideoTask(imageUrl, prompt, durationStr) {
  const { status, json } = await kieRequest("POST", "/api/v1/jobs/createTask", {
    model: "kling-3.0/video",
    input: {
      prompt,
      image_urls: [imageUrl],
      duration: durationStr,
      aspect_ratio: "9:16",
      mode: "std",
      sound: false, // we supply our own voice track via ffmpeg mux below
      multi_shots: false
    }
  });
  if (json?.code !== 200) {
    throw new Error(`Kie.ai createTask failed (HTTP ${status}): ${json?.msg || JSON.stringify(json)}`);
  }
  return json.data.taskId;
}

async function waitForKieVideo(taskId, { timeoutMs = 10 * 60 * 1000, intervalMs = 5000 } = {}) {
  const start = Date.now();
  let delay = intervalMs;
  while (Date.now() - start < timeoutMs) {
    const { json } = await kieRequest("GET", `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
    const data = json?.data;
    if (!data) throw new Error(`Kie.ai recordInfo returned no data: ${JSON.stringify(json)}`);
    if (data.state === "success") {
      const parsed = JSON.parse(data.resultJson || "{}");
      const urls = parsed.resultUrls || [];
      if (!urls.length) throw new Error("Kie.ai task succeeded but returned no resultUrls.");
      console.log(`Kie.ai task complete — ${data.creditsConsumed ?? "?"} credits consumed.`);
      return urls[0];
    }
    if (data.state === "fail") {
      throw new Error(`Kie.ai task failed: ${data.failMsg || "no reason given"}`);
    }
    console.log(`  Kie.ai: ${data.state} (progress ${data.progress ?? "?"}%)...`);
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 1.25, 15000);
  }
  throw new Error(`Timed out waiting for Kie.ai task ${taskId} after ${timeoutMs / 1000}s`);
}

// --- Main -------------------------------------------------------------

async function main() {
  if (!process.env.FAL_KEY) throw new Error("FAL_KEY environment variable not set.");
  if (!process.env.KIE_API_KEY) throw new Error("KIE_API_KEY environment variable not set — add it as a repo secret first.");

  const tmpDir = "/tmp/kie_sample";
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log(`Test line: "${TEST_LINE}"`);

  // Step 1: voice — identical call to production (fal.ai's ElevenLabs wrapper)
  console.log("Generating voice (fal.ai — billed, same as production)...");
  const audioResult = await fal.subscribe("fal-ai/elevenlabs/tts/turbo-v2.5", {
    input: { text: TEST_LINE, speed: VOICE_SPEED, timestamps: true }
  });
  const audioUrl = audioResult.data.audio.url;
  const audioPath = `${tmpDir}/audio.mp3`;
  await downloadFile(audioUrl, audioPath);
  const wordTimestamps = audioResult.data.timestamps || null;
  const audioDuration = ffprobeDuration(audioPath);
  console.log(`Voice ready — ${audioDuration.toFixed(2)}s`);

  // Kling accepts discrete duration values; round up to cover the audio,
  // same rounding behavior as your existing fal.ai Kling pipeline.
  const durationStr = audioDuration <= 5 ? "5" : "10";

  // Step 2: animate the mascot via Kie.ai instead of Higgsfield
  console.log(`Requesting Kie.ai video (Kling 3.0, ${durationStr}s)...`);
  const prompt =
    "Warm illustrated presenter speaking directly to camera, gentle natural gestures, " +
    "engaging educational energy, clean flat illustration style, subtle camera movement";
  const taskId = await createKieVideoTask(mascotImageUrl(), prompt, durationStr);
  console.log(`Kie.ai taskId: ${taskId}`);
  const videoUrl = await waitForKieVideo(taskId);

  const videoPath = `${tmpDir}/video.mp4`;
  console.log("Downloading Kie.ai result (URLs expire fast — downloading immediately)...");
  await downloadFile(videoUrl, videoPath);

  // Step 3: render captions + watermark, same as production
  const scene = { videoPath, audioPath, audioDuration, text: TEST_LINE, wordTimestamps };
  const videoDuration = ffprobeDuration(videoPath);
  const captionFilters = buildCaptionFilters(scene);
  const needsExtend = audioDuration > videoDuration + 0.05;
  const tpad = needsExtend
    ? `,tpad=stop_mode=clone:stop_duration=${(audioDuration - videoDuration).toFixed(2)}`
    : "";

  console.log("Rendering final sample with captions + watermark...");
  execSync(
    [
      "ffmpeg -y",
      `-i "${scene.videoPath}"`,
      `-i "${scene.audioPath}"`,
      `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920${tpad},${WATERMARK_FILTER},${captionFilters}"`,
      "-map 0:v:0 -map 1:a:0",
      `-t ${audioDuration.toFixed(2)}`,
      "-c:v libx264 -preset fast -crf 23 -c:a aac",
      "-movflags +faststart",
      "kie_sample.mp4"
    ].join(" "),
    { stdio: "inherit" }
  );

  console.log("Wrote kie_sample.mp4 — download it from this run's artifacts to view.");
}

main().catch(e => {
  console.error("Sample generation failed:", e.message);
  process.exit(1);
});
