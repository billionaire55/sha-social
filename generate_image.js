// generate_image.js
// Renders a premium branded 1080x1350 offer card WITH the SHA mascot -> today_image.png
// Uses SVG rendered via sharp, mascot composited in as a framed panel.

const fs = require("fs");
const sharp = require("sharp");

const GREEN      = "#2D6A4F";
const GREEN_DARK = "#1a3d2e";
const GREEN_MID  = "#235c42";
const GOLD       = "#D4A017";
const GOLD_LIGHT = "#e8b82a";
const CREAM      = "#FAFAF5";
const GREY       = "#444444";

const MASCOT_PATH = "assets/mascot.png";

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

// --- Layout constants shared between the base card and the mascot panel ---
const W = 1080, H = 1350;
const HEADER_H = 460;
const FOOTER_H = 120;
const PAD = 64;

const PANEL_X = PAD;
const PANEL_Y = HEADER_H + 40;
const PANEL_W = 420;
const PANEL_H = 560;

const COL_X = PANEL_X + PANEL_W + 40;
const COL_W = W - COL_X - PAD;

function baseCardSvg(p) {
  const headline = p.graphic_headline || p._meta.product;
  const subline  = p.graphic_subline  || "";
  const price    = p._meta.price === "$0" ? "FREE" : p._meta.price;
  const url      = "smarterhustleacademy.com";

  const hLines = wrap(headline, 22);
  const H_FONT = hLines.length > 2 ? 54 : hLines.length === 2 ? 62 : 72;
  const H_LH   = H_FONT + 12;
  const H_START = 170 + (HEADER_H - 170 - hLines.length * H_LH) / 2 + H_LH;

  const sLines = wrap(subline, 18);
  const S_FONT = 34;
  const S_LH   = 46;

  const SUBLINE_Y = PANEL_Y + 50;
  const PRICE_Y   = SUBLINE_Y + (sLines.length * S_LH) + 36;
  const PRICE_H   = 90;
  const PRICE_W   = Math.min(COL_W, price === "FREE" ? 240 : 200);

  const DESC_Y = PANEL_Y + PANEL_H + 40;
  const URL_Y  = DESC_Y + 46;
  const URL_H  = 64;

  const footerIcons = [
    { label: "GUIDES",     cx: 130 },
    { label: "AI TOOLS",   cx: 370 },
    { label: "BUNDLES",    cx: 610 },
    { label: "FREE NICHE", cx: 870 },
  ].map(ic => `
    <circle cx="${ic.cx}" cy="${H - FOOTER_H/2 - 8}" r="24"
      fill="none" stroke="${GOLD}" stroke-width="2.5"/>
    <text x="${ic.cx}" y="${H - FOOTER_H/2 + 26}"
      text-anchor="middle"
      font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="700"
      fill="${GOLD}" letter-spacing="1">${esc(ic.label)}</text>
  `).join("");

  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
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
    <filter id="goldGlow">
      <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="${GOLD}" flood-opacity="0.5"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="${CREAM}"/>
  <rect x="10" y="10" width="${W-20}" height="${H-20}"
    rx="16" fill="none" stroke="${GOLD}" stroke-width="2.5" opacity="0.55"/>
  <rect x="0" y="0" width="${W}" height="${HEADER_H}" fill="url(#hdrGrad)"/>
  ${dotGrid(0, 0, W, HEADER_H, 28, 2.2, "#ffffff", 0.065)}
  <rect x="0" y="0" width="${W}" height="5" fill="url(#goldGrad)"/>

  <text x="${W/2}" y="60" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700"
    fill="${CREAM}" letter-spacing="5" opacity="0.92">SMARTER HUSTLE ACADEMY™</text>
  <rect x="${W/2 - 150}" y="74" width="300" height="2"
    fill="url(#goldGrad)" opacity="0.75"/>

  <text x="${W/2}" y="${H_START}" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${H_FONT}"
    font-weight="900" fill="${CREAM}" letter-spacing="-1">
    ${hLines.map((l,i)=>`<tspan x="${W/2}" dy="${i===0?0:H_LH}">${esc(l)}</tspan>`).join("")}
  </text>

  <path d="M0,${HEADER_H} Q${W/2},${HEADER_H+44} ${W},${HEADER_H}"
    fill="none" stroke="url(#goldGrad)" stroke-width="3"/>

  ${subline ? `<text x="${COL_X}" y="${SUBLINE_Y + S_FONT}"
    font-family="Arial,Helvetica,sans-serif" font-size="${S_FONT}" font-weight="600"
    fill="${GREEN_DARK}">
    ${sLines.map((l,i)=>`<tspan x="${COL_X}" dy="${i===0?0:S_LH}">${esc(l)}</tspan>`).join("")}
  </text>` : ""}

  <rect x="${COL_X}" y="${PRICE_Y}" width="${PRICE_W}" height="${PRICE_H}"
    rx="12" fill="${GREEN}" filter="url(#shadow)"/>
  <rect x="${COL_X+3}" y="${PRICE_Y+3}" width="${PRICE_W-6}" height="${PRICE_H-6}"
    rx="10" fill="none" stroke="${GOLD}" stroke-width="2.5"/>
  <text x="${COL_X + PRICE_W/2}" y="${PRICE_Y + 60}"
    text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="46" font-weight="900"
    fill="${GOLD}" filter="url(#goldGlow)">${esc(price)}</text>

  <text x="${PAD}" y="${DESC_Y}"
    font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="400"
    fill="${GREY}">One-time. Yours forever. No subscription.</text>

  <rect x="${PAD}" y="${URL_Y}" width="${W - PAD*2}" height="${URL_H}"
    rx="12" fill="${GREEN}" filter="url(#shadow)"/>
  <rect x="${PAD+3}" y="${URL_Y+3}" width="${W - PAD*2 - 6}" height="${URL_H-6}"
    rx="10" fill="none" stroke="${GOLD}" stroke-width="2"/>
  <text x="${W/2}" y="${URL_Y + 52}"
    text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="700"
    fill="${CREAM}">${esc(url)}</text>

  <rect x="0" y="${H - FOOTER_H}" width="${W}" height="${FOOTER_H}" fill="${GREEN_DARK}"/>
  <rect x="0" y="${H - FOOTER_H}" width="${W}" height="3" fill="url(#goldGrad)"/>
  ${footerIcons}
</svg>`, urlBottom: URL_Y + URL_H };
}

// Rounded-rect alpha mask + gold border frame for the mascot panel, rendered
// at exactly the panel's size so it composites in one step.
function panelMaskSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_W}" height="${PANEL_H}">
    <rect x="0" y="0" width="${PANEL_W}" height="${PANEL_H}" rx="20" fill="#fff"/>
  </svg>`;
}

function panelBorderSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_W}" height="${PANEL_H}">
    <rect x="2" y="2" width="${PANEL_W-4}" height="${PANEL_H-4}" rx="18"
      fill="none" stroke="${GOLD}" stroke-width="5"/>
  </svg>`;
}

async function main() {
  const p = JSON.parse(fs.readFileSync("today_posts.json", "utf8"));

  if (!fs.existsSync(MASCOT_PATH)) {
    throw new Error(`${MASCOT_PATH} not found — the mascot image must be committed to the repo.`);
  }

  const { svg: cardSvg } = baseCardSvg(p);
  const cardBuf = await sharp(Buffer.from(cardSvg)).png().toBuffer();

  // Crop/resize the mascot to exactly fill the panel, then mask to rounded corners.
  const mascotCropped = await sharp(MASCOT_PATH)
    .resize(PANEL_W, PANEL_H, { fit: "cover", position: "top" })
    .toBuffer();

  const maskBuf = await sharp(Buffer.from(panelMaskSvg())).png().toBuffer();
  const borderBuf = await sharp(Buffer.from(panelBorderSvg())).png().toBuffer();

  const maskedMascot = await sharp(mascotCropped)
    .composite([{ input: maskBuf, blend: "dest-in" }])
    .png()
    .toBuffer();

  await sharp(cardBuf)
    .composite([
      { input: maskedMascot, top: PANEL_Y, left: PANEL_X },
      { input: borderBuf, top: PANEL_Y, left: PANEL_X }
    ])
    .png()
    .toFile("today_image.png");

  console.log("Wrote today_image.png — branded card with mascot panel");
}

main().catch(e => { console.error(e); process.exit(1); });
