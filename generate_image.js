// generate_image.js
// Renders a premium branded 1080x1350 offer card -> today_image.png
// Uses SVG (rendered via sharp) — no extra dependencies beyond existing sharp install.
// Design target: forest green gradient header, gold borders, cream body, icon strip footer.

const fs = require("fs");
const sharp = require("sharp");

const GREEN      = "#2D6A4F";
const GREEN_DARK = "#1a3d2e";
const GREEN_MID  = "#235c42";
const GOLD       = "#D4A017";
const GOLD_LIGHT = "#e8b82a";
const CREAM      = "#FAFAF5";
const INK        = "#1a1a1a";
const GREY       = "#555555";

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
    if (candidate.length > max && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function tspans(lines, x, startY, lh, anchor = "start") {
  return lines
    .map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lh}">${esc(l)}</tspan>`)
    .join("");
}

// Dot grid texture for header background
function dotGrid(x, y, w, h, spacing = 28, r = 2, color = "#ffffff", opacity = 0.08) {
  const dots = [];
  for (let cx = x + spacing; cx < x + w; cx += spacing) {
    for (let cy = y + spacing; cy < y + h; cy += spacing) {
      dots.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}"/>`);
    }
  }
  return dots.join("");
}

function svg(p) {
  const headline = p.graphic_headline || p._meta.product;
  const subline  = p.graphic_subline  || "A smarter, low-cost way to build income.";
  const price    = p._meta.price === "$0" ? "FREE" : p._meta.price;
  const url      = "smarterhustleacademy.com";

  const hLines = wrap(headline, 18);
  const sLines = wrap(subline, 42);

  // Layout constants
  const W = 1080;
  const H = 1350;
  const HEADER_H = 520;
  const FOOTER_H = 130;
  const PAD = 60;

  // Headline vertical centering inside header
  const H_FONT = hLines.length > 2 ? 72 : hLines.length === 2 ? 84 : 96;
  const H_LH   = H_FONT + 12;
  const H_BLOCK = hLines.length * H_LH;
  const H_START = 220;

  // Price badge
  const isLong  = price.length > 4;
  const BADGE_W = isLong ? 340 : 280;
  const BADGE_H = 100;
  const BADGE_X = PAD;
  const BADGE_Y = 900;

  // Subline Y — below price badge with breathing room
  const SUB_Y = BADGE_Y + BADGE_H + 60;

  const icons = [
    { label: "GUIDES",        cx: 150 },
    { label: "AI TOOLS",      cx: 390 },
    { label: "BUNDLES",       cx: 630 },
    { label: "FREE NICHE",    cx: 870 },
  ];

  const iconCircles = icons.map(ic => `
    <circle cx="${ic.cx}" cy="${H - FOOTER_H / 2 - 10}" r="28" fill="none" stroke="${GOLD}" stroke-width="2.5"/>
    <text x="${ic.cx}" y="${H - FOOTER_H / 2 + 30}" text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700"
      fill="${GOLD}" letter-spacing="1">${esc(ic.label)}</text>
  `).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Header gradient: dark green top → mid green bottom -->
    <linearGradient id="hdrGrad" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%"   stop-color="${GREEN_DARK}"/>
      <stop offset="100%" stop-color="${GREEN_MID}"/>
    </linearGradient>
    <!-- Gold shimmer for accents -->
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${GOLD}"/>
      <stop offset="50%"  stop-color="${GOLD_LIGHT}"/>
      <stop offset="100%" stop-color="${GOLD}"/>
    </linearGradient>
    <!-- Soft shadow filter -->
    <filter id="softShadow" x="-5%" y="-5%" width="110%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.25"/>
    </filter>
    <!-- Gold glow for headline text -->
    <filter id="goldGlow">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="${GOLD}" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- ── BACKGROUND ── -->
  <rect width="${W}" height="${H}" fill="${CREAM}"/>

  <!-- ── OUTER GOLD BORDER ── -->
  <rect x="12" y="12" width="${W - 24}" height="${H - 24}"
    rx="18" ry="18" fill="none" stroke="${GOLD}" stroke-width="3" opacity="0.6"/>

  <!-- ── HEADER PANEL ── -->
  <rect x="0" y="0" width="${W}" height="${HEADER_H}" fill="url(#hdrGrad)"/>

  <!-- Dot texture overlay on header -->
  ${dotGrid(0, 0, W, HEADER_H, 30, 2.5, "#ffffff", 0.07)}

  <!-- Header inner gold border bottom curve -->
  <path d="M0,${HEADER_H} Q${W / 2},${HEADER_H + 40} ${W},${HEADER_H}"
    fill="none" stroke="url(#goldGrad)" stroke-width="3"/>

  <!-- ── LOGO STRIP (top of header) ── -->
  <!-- Gold top accent line -->
  <rect x="0" y="0" width="${W}" height="6" fill="url(#goldGrad)"/>

  <!-- Brand name -->
  <text x="${W / 2}" y="75" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700"
    fill="${CREAM}" letter-spacing="5" opacity="0.95">SMARTER HUSTLE ACADEMY™</text>

  <!-- Decorative gold line under brand name -->
  <rect x="${W / 2 - 180}" y="90" width="360" height="2" fill="url(#goldGrad)" opacity="0.8"/>

  <!-- ── HEADLINE (in header) ── -->
  <!-- White main text -->
  <text
    x="${W / 2}" y="${H_START}"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${H_FONT}"
    font-weight="900"
    fill="${CREAM}"
    letter-spacing="-1">
    ${hLines.map((l, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : H_LH}">${esc(l)}</tspan>`).join("")}
  </text>

  <!-- ── GOLD DIVIDER LINE ── -->
  <rect x="60" y="${HEADER_H + 30}" width="${W - 120}" height="3" fill="url(#goldGrad)" opacity="0.9"/>

  <!-- ── PRICE BADGE ── -->
  <rect x="${BADGE_X}" y="${BADGE_Y}" width="${BADGE_W}" height="${BADGE_H}"
    rx="12" ry="12" fill="${GREEN}" filter="url(#softShadow)"/>
  <rect x="${BADGE_X + 3}" y="${BADGE_Y + 3}" width="${BADGE_W - 6}" height="${BADGE_H - 6}"
    rx="10" ry="10" fill="none" stroke="${GOLD}" stroke-width="2.5"/>
  <text x="${BADGE_X + BADGE_W / 2}" y="${BADGE_Y + 68}"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="58" font-weight="900"
    fill="${GOLD}" filter="url(#goldGlow)">${esc(price)}</text>

  <!-- ── SUBLINE TEXT ── -->
  <text
    x="${PAD}" y="${SUB_Y}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="38" font-weight="400"
    fill="${GREY}">
    ${sLines.map((l, i) => `<tspan x="${PAD}" dy="${i === 0 ? 0 : 52}">${esc(l)}</tspan>`).join("")}
  </text>

  <!-- ── URL BUTTON ── -->
  <rect x="${PAD}" y="1140" width="${W - PAD * 2}" height="86"
    rx="14" ry="14" fill="${GREEN}" filter="url(#softShadow)"/>
  <rect x="${PAD + 3}" y="1143" width="${W - PAD * 2 - 6}" height="80"
    rx="12" ry="12" fill="none" stroke="${GOLD}" stroke-width="2"/>
  <text x="${W / 2}" y="1199"
    text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-size="36" font-weight="700"
    fill="${CREAM}">${esc(url)}</text>

  <!-- ── FOOTER PANEL ── -->
  <rect x="0" y="${H - FOOTER_H}" width="${W}" height="${FOOTER_H}" fill="${GREEN_DARK}"/>
  <rect x="0" y="${H - FOOTER_H}" width="${W}" height="3" fill="url(#goldGrad)"/>

  <!-- Icon circles + labels -->
  ${iconCircles}
</svg>`;
}

async function main() {
  const p = JSON.parse(fs.readFileSync("today_posts.json", "utf8"));
  const svgBuf = Buffer.from(svg(p));
  await sharp(svgBuf)
    .png()
    .toFile("today_image.png");
  console.log("Wrote today_image.png — premium branded card");
}

main().catch(e => { console.error(e); process.exit(1); });
