// generate_image.js
// Renders a premium branded 1080x1350 offer card -> today_image.png
// Uses SVG rendered via sharp — no extra dependencies.

const fs = require("fs");
const sharp = require("sharp");

const GREEN      = "#2D6A4F";
const GREEN_DARK = "#1a3d2e";
const GREEN_MID  = "#235c42";
const GOLD       = "#D4A017";
const GOLD_LIGHT = "#e8b82a";
const CREAM      = "#FAFAF5";
const GREY       = "#444444";

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

function svg(p) {
  const headline = p.graphic_headline || p._meta.product;
  const subline  = p.graphic_subline  || "";
  const price    = p._meta.price === "$0" ? "FREE" : p._meta.price;
  const url      = "smarterhustleacademy.com";

  const W = 1080, H = 1350;
  const HEADER_H = 560;
  const FOOTER_H = 120;
  const PAD = 64;
  const BODY_TOP = HEADER_H + 48;

  // Headline
  const hLines = wrap(headline, 20);
  const H_FONT = hLines.length > 2 ? 68 : hLines.length === 2 ? 80 : 92;
  const H_LH   = H_FONT + 14;
  const H_START = 180 + (HEADER_H - 180 - hLines.length * H_LH) / 2 + H_LH;

  // Subline
  const sLines = wrap(subline, 38);
  const S_FONT = 40;
  const S_LH   = 58;

  // Layout — stack elements top to bottom in body
  const DIVIDER_Y  = BODY_TOP;
  const SUBLINE_Y  = DIVIDER_Y + 52;
  const PRICE_Y    = SUBLINE_Y + sLines.length * S_LH + 56;
  const PRICE_H    = 100;
  const PRICE_W    = price === "FREE" ? 260 : 220;
  const DESC_Y     = PRICE_Y + PRICE_H + 48;
  const URL_Y      = H - FOOTER_H - 96;
  const URL_H      = 80;

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
    <filter id="goldGlow">
      <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="${GOLD}" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="${CREAM}"/>

  <!-- Outer gold border -->
  <rect x="10" y="10" width="${W-20}" height="${H-20}"
    rx="16" fill="none" stroke="${GOLD}" stroke-width="2.5" opacity="0.55"/>

  <!-- Header -->
  <rect x="0" y="0" width="${W}" height="${HEADER_H}" fill="url(#hdrGrad)"/>
  ${dotGrid(0, 0, W, HEADER_H, 28, 2.2, "#ffffff", 0.065)}

  <!-- Gold top bar -->
  <rect x="0" y="0" width="${W}" height="5" fill="url(#goldGrad)"/>

  <!-- Brand name -->
  <text x="${W/2}" y="68" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="700"
    fill="${CREAM}" letter-spacing="5" opacity="0.92">SMARTER HUSTLE ACADEMY™</text>

  <!-- Gold underline under brand -->
  <rect x="${W/2 - 160}" y="82" width="320" height="2"
    fill="url(#goldGrad)" opacity="0.75"/>

  <!-- Headline -->
  <text x="${W/2}" y="${H_START}" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${H_FONT}"
    font-weight="900" fill="${CREAM}" letter-spacing="-1">
    ${hLines.map((l,i)=>`<tspan x="${W/2}" dy="${i===0?0:H_LH}">${esc(l)}</tspan>`).join("")}
  </text>

  <!-- Curved gold divider at header bottom -->
  <path d="M0,${HEADER_H} Q${W/2},${HEADER_H+44} ${W},${HEADER_H}"
    fill="none" stroke="url(#goldGrad)" stroke-width="3"/>

  <!-- Gold rule below header -->
  <rect x="${PAD}" y="${DIVIDER_Y}" width="${W - PAD*2}" height="2.5"
    fill="url(#goldGrad)" opacity="0.85"/>

  <!-- Subline -->
  ${subline ? `<text x="${W/2}" y="${SUBLINE_Y + S_FONT}"
    text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${S_FONT}" font-weight="600"
    fill="${GREEN_DARK}">
    ${sLines.map((l,i)=>`<tspan x="${W/2}" dy="${i===0?0:S_LH}">${esc(l)}</tspan>`).join("")}
  </text>` : ""}

  <!-- Price badge -->
  <rect x="${PAD}" y="${PRICE_Y}" width="${PRICE_W}" height="${PRICE_H}"
    rx="12" fill="${GREEN}" filter="url(#shadow)"/>
  <rect x="${PAD+3}" y="${PRICE_Y+3}" width="${PRICE_W-6}" height="${PRICE_H-6}"
    rx="10" fill="none" stroke="${GOLD}" stroke-width="2.5"/>
  <text x="${PAD + PRICE_W/2}" y="${PRICE_Y + 68}"
    text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="54" font-weight="900"
    fill="${GOLD}" filter="url(#goldGlow)">${esc(price)}</text>

  <!-- Description line -->
  <text x="${PAD}" y="${DESC_Y}"
    font-family="Arial,Helvetica,sans-serif" font-size="36" font-weight="400"
    fill="${GREY}">One-time. Yours forever. No subscription.</text>

  <!-- URL button -->
  <rect x="${PAD}" y="${URL_Y}" width="${W - PAD*2}" height="${URL_H}"
    rx="12" fill="${GREEN}" filter="url(#shadow)"/>
  <rect x="${PAD+3}" y="${URL_Y+3}" width="${W - PAD*2 - 6}" height="${URL_H-6}"
    rx="10" fill="none" stroke="${GOLD}" stroke-width="2"/>
  <text x="${W/2}" y="${URL_Y + 52}"
    text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="700"
    fill="${CREAM}">${esc(url)}</text>

  <!-- Footer -->
  <rect x="0" y="${H - FOOTER_H}" width="${W}" height="${FOOTER_H}" fill="${GREEN_DARK}"/>
  <rect x="0" y="${H - FOOTER_H}" width="${W}" height="3" fill="url(#goldGrad)"/>
  ${footerIcons}
</svg>`;
}

async function main() {
  const p = JSON.parse(fs.readFileSync("today_posts.json", "utf8"));
  const svgBuf = Buffer.from(svg(p));
  await sharp(svgBuf).png().toFile("today_image.png");
  console.log("Wrote today_image.png — premium branded card");
}

main().catch(e => { console.error(e); process.exit(1); });
