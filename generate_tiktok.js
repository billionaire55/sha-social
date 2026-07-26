// generate_tiktok.js
// Renders a mascot video for TikTok/Shorts using fal.ai (Kling for animation,
// ElevenLabs for voice), then assembles it with ffmpeg (captions + audio + concat).
//
// Output: today_tiktok.mp4
// Requires: assets/mascot.png committed to the repo (publicly reachable via raw.githubusercontent.com)
// Requires env: FAL_KEY, GITHUB_REPOSITORY (already available in Actions)
//
// CACHING: generated voice + video for each scene are cached in .cache/tiktok/
// keyed by the exact narration text (+voice speed). Re-running with the SAME
// script text reuses the cached fal.ai output instead of paying again — so you
// can iterate on captions/timing/ffmpeg logic for free. Set FORCE_REGEN=1 to
// force fresh generation.
//
// CAPTIONS: requests per-word timestamps from ElevenLabs (timestamps: true)
// and uses them to time captions to what's actually being said. fal's exact
// response shape for this field isn't fully documented publicly, so this is
// wrapped defensively — if the timestamp data doesn't parse as expected, it
// automatically falls back to a proportional (word-count-weighted) split
// instead of crashing a paid run.
//
// DURATION: Kling only supports 5s or 10s clips (confirmed via fal docs) —
// there is no native 15s option. If the generated audio runs longer than the
// Kling clip, the last frame is frozen (ffmpeg tpad) to cover the remainder
// so the video never cuts off before the voiceover finishes (e.g. the price
// mention at the end of scene 2).
//
// KNOWN LIMITATION: Kling's mouth animation is prompt-driven, not audio-driven.
// It does not lip-sync to the generated voice track — an accepted trade-off,
// not a bug in this script.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { execSync } = require("child_process");
const { fal } = require("@fal-ai/client");

const CACHE_DIR = path.join(process.cwd(), ".cache", "tiktok");
const FORCE_REGEN = process.env.FORCE_REGEN === "1";
const VOICE_SPEED = 0.85; // valid range 0.7-1.2, default 1

// Persistent brand watermark, burned into every frame — small and unobtrusive,
// top-center, brand gold on dark ink outline so it reads on any background.
const WATERMARK_FILTER =
  "drawtext=text='SMARTERHUSTLEACADEMY.COM':fontcolor=0xD4A017:fontsize=30:" +
  "borderw=2:bordercolor=0x16241D:x=(w-text_w)/2:y=64";

// Extra silent hold (freeze frame + caption stay on screen, no narration)
// added only to the final scene, so the CTA/price line has a beat to land
// on instead of cutting the instant the voiceover stops.
const FINAL_SCENE_HOLD_SECONDS = 1.2;

// Optional background music bed. Fully optional — if this file isn't in the
// repo, the video renders exactly as before (voice-only). To enable, add a
// royalty-free/licensed MP3 at this path in the repo.
const MUSIC_PATH = path.join(process.cwd(), "assets", "bgmusic.mp3");
const MUSIC_VOLUME = 0.08; // low bed under narration, not competing with the voice

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
  // Preferred path: use the actual 4-beat script Claude wrote for this offer
  // (hook, education, offer, CTA) instead of a generic reused two-liner.
  if (Array.isArray(posts.tiktok_scenes) && posts.tiktok_scenes.length > 0) {
    return posts.tiktok_scenes.map(s => String(s).trim()).filter(Boolean);
  }

  // Fallback only — covers a today_posts.json generated before this field
  // existed (e.g. a stale cache), so a bad run never crashes the pipeline.
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

const FRAME_W = 1080;
const FRAME_H = 1920;
const FONT_SIZE = 42;
const LINE_HEIGHT = FONT_SIZE + 14;
const MAX_CHARS_PER_LINE = 22;
const CAPTION_BOTTOM_MARGIN = 360;
const WORDS_PER_CAPTION = 3; // smaller chunks = more visible movement/sync

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
  // Order matters: backslash first (or later escapes get double-escaped),
  // then the ffmpeg filtergraph metacharacters. A literal comma or semicolon
  // in the caption text (very likely in normal sentences — "hook, education,
  // offer" style copy, or numbers like "1,000") would otherwise terminate
  // the drawtext filter early and corrupt the rest of the -vf chain, crashing
  // a paid run. This was happening silently whenever a script line had a comma.
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

// Try to build caption groups from ElevenLabs word-level timestamps.
// Returns null if the shape doesn't match what we expect, so the caller
// can fall back safely instead of crashing.
function captionsFromTimestamps(rawTimestamps, totalDuration) {
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

// Fallback: split into small groups, timed proportionally by word count
// across the scene's actual audio duration (not real timing data, but far
// closer than a flat 50/50 split).
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

function buildCaptionFilters(scene) {
  const groups =
    captionsFromTimestamps(scene.wordTimestamps, scene.audioDuration) ||
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
    return {
      videoPath,
      audioPath,
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
    JSON.stringify(
      { text: scene.text, audioDuration: scene.audioDuration, wordTimestamps: scene.wordTimestamps || null },
      null,
      2
    )
  );
}

// --- Scene generation --------------------------------------------------

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
  const klingDuration = audioDuration <= 5 ? "5" : "10";

  console.log(`Scene ${sceneIndex}: animating mascot (fal.ai — billed; audio ${audioDuration.toFixed(1)}s, video ${klingDuration}s)...`);
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

// --- Assembly (always runs fresh — this is the free, iterable part) ----

function renderScene(scene, sceneIndex, tmpDir, extraHoldSeconds = 0) {
  const outPath = `${tmpDir}/scene${sceneIndex}_final.mp4`;
  const videoDuration = ffprobeDuration(scene.videoPath);
  const captionFilters = buildCaptionFilters(scene);
  const targetDuration = scene.audioDuration + extraHoldSeconds;

  // If the voiceover (plus any extra hold on the final scene) runs longer
  // than the Kling clip, freeze the last frame to cover the gap instead of
  // letting the video end early.
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

  if (!process.env.FAL_KEY) {
    throw new Error("FAL_KEY environment variable not set.");
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmpDir = "/tmp/tiktok_frames";
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
    [
      "ffmpeg -y",
      `-f concat -safe 0 -i "${concatFile}"`,
      "-c:v libx264 -preset fast -crf 23 -c:a aac",
      "-movflags +faststart",
      `"${concatOut}"`
    ].join(" "),
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

  console.log("Wrote today_tiktok.mp4");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
