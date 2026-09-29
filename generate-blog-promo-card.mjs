// generate-blog-promo-card.mjs
// Receives blog post data via env vars, renders the blog promo image and
// saves it as blog_promo_image.png for posting to social platforms.
// Called by the blog-promo workflow after sha-blog publishes a new post.
//
// UPDATED (Sep 28 2026): PRIMARY design is now a full borderless Kie.ai
// image — the mascot holding a sign with the post headline, SHA logo top
// right, blog URL on the sign — matching the daily social image design.
// No card frame, no green header/footer bars. The old bordered card
// (green header, mascot panel, gold URL bar, footer icons) is kept ONLY
// as an automatic fallback if Kie.ai fails or KIE_API_KEY isn't set.
// The excerpt sanitizer was also hardened so JSON-LD / page-title junk
// (e.g. `— Smarter Hustle Academy™ { "@context": "https://schema.org",`)
// can never reach the fallback card. NOTE: as of this same date,
// auto_publish.py in sha-blog now sources the excerpt from the real
// article/feed description instead of raw page text, so junk excerpts
// should no longer be generated at the source either — this sanitizer is
// a second line of defense, not the only fix.

import fs from "fs";
import https from "https";
import sharp from "sharp";

const GREEN      = "#2D6A4F";
const GREEN_DARK = "#1a3d2e";
const GREEN_MID  = "#235c42";
const GOLD       = "#D4A017";
const GOLD_LIGHT = "#e8b82a";
const CREAM      = "#FAFAF5";
const GREY       = "#444444";

const MASCOT_PATH = "assets/mascot.png";
const KIE_API = "https://api.kie.ai";

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

const W = 1080, H = 1350;
const HEADER_H = 420;
const FOOTER_H = 120;
const PAD = 64;

const PANEL_X = PAD;
const PANEL_Y = HEADER_H + 40;
const PANEL_W = 420;
const PANEL_H = 520;

const COL_X = PANEL_X + PANEL_W + 40;
const COL_W = W - COL_X - PAD;

// Pick the largest headline size whose wrapped lines fit inside the header.
function fitTitle(title) {
  const TOP = 110, BOTTOM = HEADER_H - 34;       // usable band inside the header
  const MAX_W = W - PAD * 2;
  for (let font = 68; font >= 34; font -= 2) {
    const perLine = Math.max(10, Math.floor(MAX_W / (font * 0.56)));
    const lines = wrap(title, perLine);
    const lh = Math.round(font * 1.16);
    if (lines.length * lh <= BOTTOM - TOP) {
      const start = TOP + (BOTTOM - TOP - lines.length * lh) / 2 + font * 0.9;
      return { lines, font, lh, start };
    }
  }
  const font = 34, lh = 40;
  const lines = wrap(title, Math.floor(MAX_W / (font * 0.56))).slice(0, 6);
  lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*\S*$/, "") + "…";
  return { lines, font, lh, start: TOP + font * 0.9 };
}

function baseCardSvg(title, excerpt) {
  const fit = fitTitle(title);
  const hLines = fit.lines;
  const H_FONT = fit.font;
  const H_LH   = fit.lh;
  const H_START = fit.start;

  const eLines = wrap(excerpt, 24);
  const E_FONT = 30;
  const E_LH   = 42;

  const LABEL_Y   = PANEL_Y + 40;
  const DIVIDER_Y = LABEL_Y + 24;
  const EXCERPT_Y = DIVIDER_Y + 44;

  const URL_Y = H - FOOTER_H - 100;
  const URL_H = 80;

  const footerIcons = [
    { label: "GUIDES",     cx: 130 },
    { label: "AI TOOLS",   cx: 370 },
    { label: "BUNDLES",    cx: 610 },
    { label: "FREE NICHE", cx: 870 },
  ].map(ic => `
    <text x="${ic.cx}" y="${H - FOOTER_H/2 + 8}"
      text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="700"
      fill="${GOLD}" letter-spacing="1">${esc(ic.label)}</text>
  `).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="hdrGrad" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0%" stop-color="${GREEN_DARK}"/>
      <stop offset="100%" stop-color="${GREEN_MID}"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${GOLD}"/>
      <stop offset="50%"  stop-color="${GOLD_LIGHT}"/>
      <stop offset="100%" stop-color="${GOLD}"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000" flood-opacity="0.22"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="${CREAM}"/>
  <rect x="0" y="0" width="${W}" height="${HEADER_H}" fill="url(#hdrGrad)"/>
  ${dotGrid(0, 0, W, HEADER_H, 28, 2.2, "#ffffff", 0.065)}
  <rect x="0" y="0" width="${W}" height="5" fill="url(#goldGrad)"/>

  <text x="${W/2}" y="56" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700"
    fill="${CREAM}" letter-spacing="5" opacity="0.92">SMARTER HUSTLE ACADEMY™</text>
  <rect x="${W/2-150}" y="70" width="300" height="2"
    fill="url(#goldGrad)" opacity="0.75"/>

  <text x="${W/2}" y="${H_START}" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${H_FONT}"
    font-weight="900" fill="${CREAM}" letter-spacing="-1">
    ${hLines.map((l,i)=>`<tspan x="${W/2}" dy="${i===0?0:H_LH}">${esc(l)}</tspan>`).join("")}
  </text>

  <path d="M0,${HEADER_H} Q${W/2},${HEADER_H+44} ${W},${HEADER_H}"
    fill="none" stroke="url(#goldGrad)" stroke-width="3"/>

  <text x="${COL_X}" y="${LABEL_Y}"
    font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700"
    fill="${GOLD}" letter-spacing="3">NEW ON THE BLOG</text>
  <rect x="${COL_X}" y="${DIVIDER_Y}" width="${COL_W}" height="2.5"
    fill="url(#goldGrad)" opacity="0.85"/>

  <text x="${COL_X}" y="${EXCERPT_Y}"
    font-family="Arial,Helvetica,sans-serif" font-size="${E_FONT}" font-weight="400"
    fill="${GREY}">
    ${eLines.slice(0,7).map((l,i)=>`<tspan x="${COL_X}" dy="${i===0?0:E_LH}">${esc(l)}</tspan>`).join("")}
  </text>

  <rect x="${PAD}" y="${URL_Y}" width="${W - PAD*2}" height="${URL_H}"
    rx="12" fill="${GREEN}" filter="url(#shadow)"/>
  <rect x="${PAD+3}" y="${URL_Y+3}" width="${W-PAD*2-6}" height="${URL_H-6}"
    rx="10" fill="none" stroke="${GOLD}" stroke-width="2"/>
  <text x="${W/2}" y="${URL_Y+52}"
    text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="700"
    fill="${CREAM}">blog.smarterhustleacademy.com</text>

  <rect x="0" y="${H-FOOTER_H}" width="${W}" height="${FOOTER_H}" fill="${GREEN_DARK}"/>
  <rect x="0" y="${H-FOOTER_H}" width="${W}" height="3" fill="url(#goldGrad)"/>
  ${footerIcons}
</svg>`;
}

function panelMaskSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_W}" height="${PANEL_H}">
    <rect x="0" y="0" width="${PANEL_W}" height="${PANEL_H}" rx="20" fill="#fff"/>
  </svg>`;
}

// --- Kie.ai request helpers --------------------------------------------

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

// --- Main ----------------------------------------------------------------

const title = String(process.env.BLOG_TITLE || "New Post").replace(/\s+/g, " ").trim();

// Removes anything that is not plain readable text: JSON-LD blocks, HTML
// tags, the page <title> echo ("... — Smarter Hustle Academy™"), and code
// fragments. If nothing usable is left it returns "" (the fallback card
// then shows no excerpt at all instead of junk).
function cleanExcerpt(raw, postTitle) {
  let t = String(raw || "");
  t = t.replace(/<script[\s\S]*?<\/script>/gi, " ");   // whole script blocks
  t = t.replace(/<[^>]+>/g, " ");                      // any HTML tags
  t = t.replace(/\s+/g, " ").trim();
  t = t.split(/\s*[{[]\s*"?@?(?:context|type|graph)/i)[0]; // JSON-LD start
  t = t.split(/\s[{<]/)[0];                             // any other code tail
  t = t.replace(/https?:\/\/schema\.org\S*/gi, " ");
  t = t.replace(/"?@(?:context|type|content|graph)"?\s*:?/gi, " ");
  t = t.replace(/\s*[—|–-]\s*Smarter Hustle Academy\s*(?:™|\(TM\))?\s*/gi, " ");
  t = t.replace(/[{}[\]"]+\s*,?\s*$/g, "").replace(/\s+/g, " ").trim();
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (postTitle && norm(t).startsWith(norm(postTitle))) t = ""; // just the title again
  return t.length >= 30 ? t.slice(0, 220) : "";
}
const excerpt = cleanExcerpt(process.env.BLOG_EXCERPT, title);

// Split "Main Headline — supporting line" so the sign text stays large.
function splitTitle(t) {
  const parts = t.split(/\s+[—–]\s+/);
  const headline = parts[0].trim();
  const rest = parts.slice(1).join(" — ").trim();
  return { headline, subline: rest && rest.length <= 70 ? rest : "" };
}

async function renderFullKieImage() {
  const { headline, subline } = splitTitle(title);
  console.log("Generating full borderless Kie.ai blog promo image...");
  const referenceUrl = await uploadMascotToKie();
  const prompt =
    `A polished, professional social media image for a digital education brand called ` +
    `"Smarter Hustle Academy." Forest green (#2D6A4F) and gold (#D4A017) color scheme on a ` +
    `plain cream background, no other colors. Full-bleed artwork with NO outer border, NO ` +
    `frame and NO colored bars around the image edges. The mascot character (use the ` +
    `reference image) smiles and points at a large sign she is holding. The sign clearly and ` +
    `legibly displays exactly this headline text: "${headline}"` +
    `${subline ? `, with the smaller supporting line: "${subline}"` : ""}, and at the bottom ` +
    `of the sign the small text "blog.smarterhustleacademy.com". Place the Smarter Hustle ` +
    `Academy logo (graduation cap over gold rising bars, with the words "Smarter Hustle" and ` +
    `"ACADEMY") in the top right corner. Gold rising-arrow and bar-chart shapes and soft ` +
    `green leaves in the background. Clean flat illustration style, confident and trustworthy, ` +
    `portrait orientation. Every word spelled exactly as given. Do not add any other text, ` +
    `prices, numbers or code.`;
  const taskId = await createImageTask(prompt, referenceUrl);
  const imageUrl = await waitForImage(taskId);
  const buffer = await downloadBuffer(imageUrl);
  await sharp(buffer).resize(W, H, { fit: "cover", position: "attention" }).png().toFile("blog_promo_image.png");
  console.log("Wrote blog_promo_image.png — full borderless Kie.ai image");
}

// FALLBACK ONLY: the old branded card with the static mascot panel.
async function renderFallbackCard() {
  console.log("Rendering fallback card with static mascot...");
  const cardBuf = await sharp(Buffer.from(baseCardSvg(title, excerpt))).png().toBuffer();
  const panelCropped = await sharp(fs.readFileSync(MASCOT_PATH))
    .resize(PANEL_W, PANEL_H, { fit: "cover", position: sharp.strategy.attention })
    .toBuffer();
  const maskBuf = await sharp(Buffer.from(panelMaskSvg())).png().toBuffer();
  const maskedPanel = await sharp(panelCropped).composite([{ input: maskBuf, blend: "dest-in" }]).png().toBuffer();
  await sharp(cardBuf).composite([{ input: maskedPanel, top: PANEL_Y, left: PANEL_X }]).png().toFile("blog_promo_image.png");
  console.log("Wrote blog_promo_image.png — FALLBACK card");
}

if (!fs.existsSync(MASCOT_PATH)) {
  throw new Error(`${MASCOT_PATH} not found — the mascot image must be committed to the repo.`);
}
if (!process.env.KIE_API_KEY) {
  console.log("KIE_API_KEY not set — using the fallback card.");
  await renderFallbackCard();
} else {
  try {
    await renderFullKieImage();
  } catch (e) {
    console.warn(`Kie.ai full image failed (${e.message}) — using the fallback card.`);
    await renderFallbackCard();
  }
}
