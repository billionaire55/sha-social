// generate_image.js
// Renders the daily social image -> today_image.png
//
// REDESIGNED (Sep 2026): the entire image is now generated directly by
// Kie.ai — no more green header/footer bars, no separate price badge or
// URL strip composited on top. Kie.ai is prompted to render the headline,
// price, and brand elements as part of the artwork itself (mascot presenting
// a poster/cover design), matching the "Your Hook Is the Whole Game" example
// that worked well in testing.
//
// FALLBACK (updated Oct 6 2026): if Kie.ai fails, the script now retries
// 3 times, then falls back to a BORDERLESS full-bleed image (static mascot
// + headline/price on a soft gradient — no frames, bars, panels or icon
// strips). The old bordered card is gone for good, so a Kie failure can no
// longer silently put bordered pictures back on social. Every Kie failure
// is also written to kie_image_error.json and surfaced as a red ::error::
// annotation, and the workflow fails loudly AFTER posting is done.
//
// NOTE: AI image models are inherently less reliable than the old
// SVG-rendered text at getting exact price/headline text correct every
// time. The fallback exists specifically because of that — this isn't a
// hypothetical risk, it's the tradeoff of this redesign.

const fs = require("fs");
const https = require("https");
const sharp = require("sharp");

const GREEN      = "#2D6A4F";
const GREEN_DARK = "#1a3d2e";
const GREEN_MID  = "#235c42";
const GOLD       = "#D4A017";
const GOLD_LIGHT = "#e8b82a";
const CREAM      = "#FAFAF5";
const GREY       = "#444444";

const MASCOT_PATH = "assets/mascot.png";
const KIE_API = "https://api.kie.ai";
const W = 1080, H = 1350;

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const candidate = (line + " " + w).trim();
    if (candidate.length > max && line) { lines.push(line); line = w; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function dotGrid(x, y, w, h, spacing, r, color, opacity) {
  const dots = [];
  for (let cx = x + spacing; cx < x + w; cx += spacing)
    for (let cy = y + spacing; cy < y + h; cy += spacing)
      dots.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}"/>`);
  return dots.join("");
}


// --- FALLBACK: borderless full-bleed image (no frames, bars or panels) ----
function fallbackOverlaySvg(p) {
  const headline = p.graphic_headline || p._meta.product;
  const priceText = p._meta.price === "$0" ? "FREE" : p._meta.price;
  const lines = wrap(headline, 22).slice(0, 3);
  const lineH = 92;
  const blockH = lines.length * lineH;
  const startY = H - 250 - blockH + lineH - 20;
  const text = lines.map((l, i) =>
    `<text x="${W/2}" y="${startY + i * lineH}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
      font-size="78" font-weight="800" fill="${CREAM}">${esc(l)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${GREEN_DARK}" stop-opacity="0"/>
        <stop offset="0.4" stop-color="${GREEN_DARK}" stop-opacity="0.78"/>
        <stop offset="1" stop-color="${GREEN_DARK}" stop-opacity="0.96"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${H - 820}" width="${W}" height="820" fill="url(#fade)"/>
    ${text}
    <text x="${W/2}" y="${H - 135}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
      font-size="84" font-weight="800" fill="${GOLD_LIGHT}">${esc(priceText)}</text>
    <text x="${W/2}" y="${H - 60}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
      font-size="40" font-weight="600" fill="${CREAM}">smarterhustleacademy.com</text>
  </svg>`;
}

async function renderFallbackImage(p) {
  console.log("Rendering BORDERLESS fallback image (static mascot, no frames)...");
  const base = await sharp(MASCOT_PATH)
    .resize(W, H, { fit: "cover", position: "top" })
    .toBuffer();
  await sharp(base)
    .composite([{ input: Buffer.from(fallbackOverlaySvg(p)), top: 0, left: 0 }])
    .png()
    .toFile("today_image.png");
  console.log("Wrote today_image.png — borderless fallback");
}

function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

function recordKieFailure(reason) {
  fs.writeFileSync("kie_image_error.json", JSON.stringify({
    time: new Date().toISOString(), reason
  }, null, 2));
  console.log(`::error::Kie.ai borderless image failed — borderless fallback used instead. Reason: ${reason}`);
  setOutput("image_status", "fallback");
}

// --- PRIMARY: full-bleed Kie.ai image -----------------------------------

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
          try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
          catch (e) { reject(new Error(`Kie.ai returned non-JSON (HTTP ${res.statusCode}): ${data.slice(0, 500)}`)); }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function uploadMascotToKie() {
  const base64Data = `data:image/png;base64,${fs.readFileSync(MASCOT_PATH).toString("base64")}`;
  const { status, json } = await new Promise((resolve, reject) => {
    const payload = JSON.stringify({ base64Data, uploadPath: "images", fileName: "mascot.png" });
    const req = https.request(
      "https://kieai.redpandaai.co/api/file-base64-upload",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.KIE_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      res => {
        let data = "";
        res.on("data", c => (data += c));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
          catch (e) { reject(new Error(`Kie.ai upload returned non-JSON (HTTP ${res.statusCode}): ${data.slice(0, 500)}`)); }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
  const uploadedUrl = json?.data?.downloadUrl || json?.data?.fileUrl || json?.downloadUrl || json?.fileUrl;
  if (!uploadedUrl) throw new Error(`Kie.ai upload failed (HTTP ${status}): ${JSON.stringify(json)}`);
  return uploadedUrl;
}

async function createImageTask(prompt, referenceImageUrl) {
  const { status, json } = await kieRequest("POST", "/api/v1/gpt4o-image/generate", {
    prompt,
    filesUrl: [referenceImageUrl],
    size: "2:3"
  });
  if (json?.code !== 200) throw new Error(`Kie.ai generate failed (HTTP ${status}): ${json?.msg || JSON.stringify(json)}`);
  return json.data.taskId;
}

async function waitForImage(taskId, { timeoutMs = 8 * 60 * 1000, intervalMs = 5000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { json } = await kieRequest("GET", `/api/v1/gpt4o-image/record-info?taskId=${encodeURIComponent(taskId)}`);
    const data = json?.data;
    if (!data) throw new Error(`Kie.ai record-info returned no data: ${JSON.stringify(json)}`);
    if (data.status === "SUCCESS") {
      const urls = data.response?.resultUrls || [];
      if (!urls.length) throw new Error("Kie.ai task succeeded but returned no resultUrls.");
      return urls[0];
    }
    if (data.status === "CREATE_TASK_FAILED" || data.status === "GENERATE_FAILED") {
      throw new Error(`Kie.ai image task failed (${data.status}): ${data.errorMessage || "no reason given"}`);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for Kie.ai image task ${taskId} after ${timeoutMs / 1000}s`);
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`Download failed: ${res.statusCode}`));
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

async function renderFullKieImage(p) {
  const headline = p.graphic_headline || p._meta.product;
  const subline  = p.graphic_subline || "";
  const priceText = p._meta.price === "$0" ? "FREE" : p._meta.price;

  console.log("Generating full Kie.ai image (no card overlay)...");
  const referenceUrl = await uploadMascotToKie();

  const prompt =
    `A polished, professional social media promo image for a digital education brand called ` +
    `"Smarter Hustle Academy." Forest green (#2D6A4F) and gold (#D4A017) color scheme, cream ` +
    `background, no other colors. The mascot character is presenting or holding up a stylized ` +
    `poster/cover design. The poster/cover must clearly and legibly display this exact headline ` +
    `text: "${headline}"${subline ? ` with the smaller supporting line "${subline}"` : ""}, and ` +
    `a clean price badge showing exactly "${priceText}". Small "smarterhustleacademy.com" text ` +
    `should also appear somewhere in the design. Clean flat illustration style, confident and ` +
    `trustworthy feel, portrait orientation, all text spelled correctly and legible.`;

  const taskId = await createImageTask(prompt, referenceUrl);
  const imageUrl = await waitForImage(taskId);
  console.log("Kie.ai full image ready — downloading and fitting to 1080x1350...");
  const buffer = await downloadBuffer(imageUrl);

  await sharp(buffer)
    .resize(W, H, { fit: "cover", position: "attention" })
    .png()
    .toFile("today_image.png");

  console.log("Wrote today_image.png — full Kie.ai image, no border/overlay");
}

async function main() {
  const p = JSON.parse(fs.readFileSync("today_posts.json", "utf8"));

  if (!fs.existsSync(MASCOT_PATH)) {
    throw new Error(`${MASCOT_PATH} not found — the mascot image must be committed to the repo.`);
  }

  if (!process.env.KIE_API_KEY) {
    recordKieFailure("KIE_API_KEY secret is not set");
    return renderFallbackImage(p);
  }

  const ATTEMPTS = 3;
  let lastErr = "unknown";
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      console.log(`Kie.ai image attempt ${i}/${ATTEMPTS}...`);
      await renderFullKieImage(p);
      setOutput("image_status", "kie_success");
      return;
    } catch (e) {
      lastErr = e.message;
      console.warn(`Attempt ${i} failed: ${lastErr}`);
      if (i < ATTEMPTS) await new Promise(r => setTimeout(r, 20000 * i));
    }
  }
  recordKieFailure(lastErr);
  await renderFallbackImage(p);
}

main().catch(e => { console.error(e); process.exit(1); });
