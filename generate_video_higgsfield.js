// generate_video_higgsfield.js
// Alternate to generate_tiktok.js — same voice/caption/assembly pipeline
// (proven, unchanged), but animates the mascot via Higgsfield's official
// API instead of fal.ai's Kling. This is the illustrated/captioned style
// requested as a second visual option for TikTok/Shorts + YouTube.
//
// Output: today_tiktok.mp4 (same filename/contract as generate_tiktok.js —
// swap which script daily-offer.yml calls to switch styles; don't run both
// in the same day unless you rename outputs)
// Requires: assets/mascot.png committed to the repo
// Requires env: FAL_KEY (voice, unchanged), HIGGSFIELD_KEY_ID, HIGGSFIELD_KEY_SECRET
//
// IMPORTANT — UNTESTED AGAINST THE REAL API: this was written from
// Higgsfield's official SDK docs (github.com/higgsfield-ai/higgsfield-js)
// without the ability to test against the live API from this environment
// (network-restricted sandbox). The model id/endpoint below
// ('/v1/image2video/dop', model 'dop-turbo') is taken directly from the
// SDK's own documented example, but may need adjustment on the first real
// run — if it fails, check the Actions log and fix the input shape below;
// this is a normal part of integrating a new API, not a sign of a deeper
// problem with the approach.
//
// Everything else (voice generation, per-word captions, watermark, final
// hold, concat, optional music bed) is copied unchanged from
// generate_tiktok.js — see that file's comments for how those work.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { execSync } = require("child_process");
const { fal } = require("@fal-ai/client");
const { higgsfield, config } = require("@higgsfield/client/v2");

const CACHE_DIR = path.join(process.cwd(), ".cache", "tiktok_hf");
const FORCE_REGEN = process.env.FORCE_REGEN === "1";
const VOICE_SPEED = 0.85;

const WATERMARK_FILTER =
  "drawtext=text='SMARTERHUSTLEACADEMY.COM':fontcolor=0xD4A017:fontsize=30:" +
  "borderw=2:bordercolor=0x16241D:x=(w-text_w)/2:y=64";

const FINAL_SCENE_HOLD_SECONDS = 1.2;
const MUSIC_PATH = path.join(process.cwd(), "assets", "bgmusic.mp3");
const MUSIC_VOLUME = 0.08;

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
  if (Array.isArray(posts.tiktok_scenes) && posts.tiktok_scenes.length > 0) {
    return posts.tiktok_scenes.map(s => String(s).trim()).filter(Boolean);
  }
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

// --- Caption helpers (unchanged from generate_tiktok.js) --------------

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

// --- Caching ------------------------------------------------------------

function sceneCacheKey(line) {
  return crypto
    .createHash("sha256")
    .update(line + "|" + VOICE_SPEED + "|" + mascotImageUrl() + "|higgsfield")
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
    return {
      videoPath, audioPath,
      audioDuration: meta.audioDuration,
      text: meta.text,
      wordTimestamps: meta.wordTimestamps || null
    };
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
    JSON.stringify({ text: scene.text, audioDuration: scene.audioDuration, wordTimestamps: scene.wordTimestamps || null }, null, 2)
  );
}

// --- Scene generation -----------------------------------------------------

async function generateSceneFresh(line, sceneIndex, tmpDir) {
  console.log(`Scene ${sceneIndex}: generating voice (fal.ai — billed)...`);
  const audioResult = await fal.subscribe("fal-ai/elevenlabs/tts/turbo-v2.5", {
    input: { text: line, speed: VOICE_SPEED, timestamps: true }
  });
  const audioUrl = audioResult.data.audio.url;
  const audioPath = `${tmpDir}/scene${sceneIndex}_audio.mp3`;
  await downloadFile(audioUrl, audioPath);
  const wordTimestamps = audioResult.data.timestamps || null;
  const audioDuration = ffprobeDuration(audioPath);

  console.log(`Scene ${sceneIndex}: animating mascot via Higgsfield (billed; audio ${audioDuration.toFixed(1)}s)...`);
  // NOTE: model/endpoint from Higgsfield's official SDK example — see file
  // header comment. If this fails, check the returned error shape and
  // adjust the endpoint/model/input fields, then re-run.
  const jobSet = await higgsfield.subscribe("/v1/image2video/dop", {
    input: {
      model: "dop-turbo",
      prompt:
        "Warm illustrated presenter speaking directly to camera, gentle natural gestures, " +
        "engaging educational energy, clean flat illustration style, subtle camera movement",
      input_images: [{ type: "image_url", image_url: mascotImageUrl() }]
    },
    withPolling: true
  });

  if (!jobSet.isCompleted) {
    throw new Error(`Higgsfield job did not complete for scene ${sceneIndex}: status=${JSON.stringify(jobSet)}`);
  }
  const videoUrl = jobSet.jobs[0].results?.raw?.url;
  if (!videoUrl) {
    throw new Error(`Higgsfield job completed but no video URL found: ${JSON.stringify(jobSet.jobs[0])}`);
  }
  const videoPath = `${tmpDir}/scene${sceneIndex}_video.mp4`;
  await downloadFile(videoUrl, videoPath);

  return { videoPath, audioPath, audioDuration, text: line, wordTimestamps };
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

// --- Assembly (identical to generate_tiktok.js) --------------------------

function renderScene(scene, sceneIndex, tmpDir, extraHoldSeconds = 0) {
  const outPath = `${tmpDir}/scene${sceneIndex}_final.mp4`;
  const videoDuration = ffprobeDuration(scene.videoPath);
  const captionFilters = buildCaptionFilters(scene);
  const targetDuration = scene.audioDuration + extraHoldSeconds;
  const needsExtend = targetDuration > videoDuration + 0.05;
  const tpad = needsExtend
    ? `,tpad=stop_mode=clone:stop_duration=${(targetDuration - videoDuration).toFixed(2)}`
    : "";
  const cmd = [
    "ffmpeg -y",
    `-i "${scene.videoPath}"`,
    `-i "${scene.audioPath}"`,
    `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920${tpad},${WATERMARK_FILTER},${captionFilters}"`,
    "-map 0:v:0 -map 1:a:0",
    `-t ${targetDuration.toFixed(2)}`,
    "-c:v libx264 -preset fast -crf 23 -c:a aac",
    `"${outPath}"`
  ].join(" ");
  execSync(cmd, { stdio: "inherit" });
  return outPath;
}

async function main() {
  const posts = JSON.parse(fs.readFileSync("today_posts.json", "utf8"));

  if (!process.env.FAL_KEY) throw new Error("FAL_KEY environment variable not set.");
  if (!process.env.HIGGSFIELD_KEY_ID || !process.env.HIGGSFIELD_KEY_SECRET) {
    throw new Error("HIGGSFIELD_KEY_ID and HIGGSFIELD_KEY_SECRET environment variables must both be set.");
  }
  config({ credentials: `${process.env.HIGGSFIELD_KEY_ID}:${process.env.HIGGSFIELD_KEY_SECRET}` });

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmpDir = "/tmp/tiktok_hf_frames";
  fs.mkdirSync(tmpDir, { recursive: true });

  const lines = buildScript(posts);
  console.log(`Script: ${lines.length} scene(s) —`, lines);

  const scenes = [];
  for (let i = 0; i < lines.length; i++) {
    scenes.push(await getScene(lines[i], i + 1, tmpDir));
  }

  console.log("Rendering scenes with captions + watermark (free — local ffmpeg only)...");
  const finals = scenes.map((scene, i) => {
    const isLast = i === scenes.length - 1;
    return renderScene(scene, i + 1, tmpDir, isLast ? FINAL_SCENE_HOLD_SECONDS : 0);
  });

  console.log("Concatenating scenes (re-encoding for clean sync)...");
  const concatFile = `${tmpDir}/concat.txt`;
  fs.writeFileSync(concatFile, finals.map(f => `file '${f}'`).join("\n") + "\n");
  const concatOut = `${tmpDir}/concat_out.mp4`;
  execSync(
    ["ffmpeg -y", `-f concat -safe 0 -i "${concatFile}"`, "-c:v libx264 -preset fast -crf 23 -c:a aac", "-movflags +faststart", `"${concatOut}"`].join(" "),
    { stdio: "inherit" }
  );

  if (fs.existsSync(MUSIC_PATH)) {
    console.log("Mixing background music bed under narration...");
    execSync(
      [
        "ffmpeg -y",
        `-i "${concatOut}"`,
        `-stream_loop -1 -i "${MUSIC_PATH}"`,
        `-filter_complex "[1:a]volume=${MUSIC_VOLUME}[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]"`,
        '-map 0:v -map "[aout]"',
        "-c:v copy -c:a aac -shortest",
        "-movflags +faststart",
        "today_tiktok.mp4"
      ].join(" "),
      { stdio: "inherit" }
    );
  } else {
    fs.copyFileSync(concatOut, "today_tiktok.mp4");
    console.log("No assets/bgmusic.mp3 in the repo — skipping music bed (narration-only, as before).");
  }

  console.log("Wrote today_tiktok.mp4 (Higgsfield style)");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
