// generate_image.js
// Reads today_posts.json and renders a branded 1080x1350 offer card -> today_image.png
// Pure code, no paid API. Uses SHA brand colors.

const fs = require("fs");
const sharp = require("sharp");

const GREEN = "#2D6A4F", GOLD = "#D4A017", CREAM = "#FAFAF5", INK = "#1b1b1b";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// naive word-wrap for SVG <text> lines
function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) { if (line) lines.push(line); line = w; }
    else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}

function tspans(lines, x, startY, lh) {
  return lines.map((l, i) => `<tspan x="${x}" y="${startY + i * lh}">${esc(l)}</tspan>`).join("");
}

function svg(p) {
  const headline = p.graphic_headline || p._meta.product;
  const subline  = p.graphic_subline  || "A smarter, low-cost way to build income.";
  const price    = p._meta.price === "$0" ? "FREE" : p._meta.price;

  const hLines = wrap(headline, 20);
  const sLines = wrap(subline, 38);
  const hStart = 560 - (hLines.length - 1) * 36;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="${CREAM}"/>
  <rect x="0" y="0" width="1080" height="150" fill="${GREEN}"/>
  <text x="60" y="95" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="${CREAM}" letter-spacing="2">SMARTER HUSTLE ACADEMY</text>
  <rect x="60" y="150" width="120" height="8" fill="${GOLD}"/>

  <text x="60" y="300" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="${GOLD}" letter-spacing="3">MAKING MONEY IN A HIGH-COST ECONOMY</text>

  <text font-family="Arial, sans-serif" font-size="84" font-weight="800" fill="${INK}">${tspans(hLines, 60, hStart, 92)}</text>

  <text font-family="Arial, sans-serif" font-size="36" font-weight="400" fill="#444">${tspans(sLines, 60, 760, 50)}</text>

  <rect x="60" y="900" rx="14" ry="14" width="${price.length > 4 ? 360 : 300}" height="110" fill="${GOLD}"/>
  <text x="${60 + (price.length > 4 ? 180 : 150)}" y="975" text-anchor="middle" font-family="Arial, sans-serif" font-size="64" font-weight="800" fill="${INK}">${esc(price)}</text>

  <rect x="0" y="1230" width="1080" height="120" fill="${GREEN}"/>
  <text x="540" y="1305" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="700" fill="${CREAM}">smarterhustleacademy.com/start</text>
</svg>`;
}

async function main() {
  const p = JSON.parse(fs.readFileSync("today_posts.json", "utf8"));
  const buf = Buffer.from(svg(p));
  await sharp(buf).png().toFile("today_image.png");
  console.log("Wrote today_image.png");
}

main().catch(e => { console.error(e); process.exit(1); });
