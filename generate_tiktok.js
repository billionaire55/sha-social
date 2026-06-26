// generate_tiktok.js
// Renders 4 branded PNG frames and stitches them into a 1080x1920 TikTok
// slideshow MP4 using ffmpeg (pre-installed on ubuntu-latest).
// Output: today_tiktok.mp4
// Requires: sharp (already installed), ffmpeg (pre-installed on GitHub Actions)

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import sharp from "sharp";

const GREEN      = "#2D6A4F";
const GREEN_DARK = "#1a3d2e";
const GREEN_MID  = "#235c42";
const GOLD       = "#D4A017";
const GOLD_LIGHT = "#e8b82a";
const CREAM      = "#FAFAF5";
const GREY       = "#444444";
const WHITE      = "#FFFFFF";

const W = 1080;
const H = 1920;
const PAD = 80;

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

function brandHeader(subtitle) {
  return `
  <rect x="0" y="0" width="${W}" height="200" fill="${GREEN_DARK}"/>
  <rect x="0" y="0" width="${W}" height="6" fill="url(#goldGrad)"/>
  <text x="${W/2}" y="80" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="700"
    fill="${CREAM}" letter-spacing="5">SMARTER HUSTLE ACADEMY™</text>
  <rect x="${W/2-180}" y="95" width="360" height="2" fill="url(#goldGrad)" opacity="0.8"/>
  <text x="${W/2}" y="155" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="400"
    fill="${GOLD}">${esc(subtitle)}</text>`;
}

function defs() {
  return `<defs>
    <linearGradient id="hdrGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${GREEN_DARK}"/>
      <stop offset="100%" stop-color="${GREEN_MID}"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${GOLD}"/>
      <stop offset="50%"  stop-color="${GOLD_LIGHT}"/>
      <stop offset="100%" stop-color="${GOLD}"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000" flood-opacity="0.25"/>
    </filter>
    <filter id="goldGlow">
      <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="${GOLD}" flood-opacity="0.5"/>
    </filter>
  </defs>`;
}

// Frame 1 — Hook card
function frame1(hook) {
  const lines = wrap(hook, 22);
  const FONT = lines.length > 3 ? 72 : lines.length === 3 ? 82 : lines.length === 2 ? 96 : 108;
  const LH = FONT + 16;
  const startY = H/2 - (lines.length * LH)/2 + FONT;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${defs()}
  <rect width="${W}" height="${H}" fill="url(#hdrGrad)"/>
  ${dotGrid(0, 0, W, H, 40, 3, "#ffffff", 0.05)}
  <rect x="0" y="0" width="${W}" height="6" fill="url(#goldGrad)"/>
  <rect x="0" y="${H-6}" width="${W}" height="6" fill="url(#goldGrad)"/>

  <text x="${W/2}" y="100" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="700"
    fill="${CREAM}" letter-spacing="5" opacity="0.85">SMARTER HUSTLE ACADEMY™</text>

  <rect x="${PAD}" y="${startY - FONT - 40}" width="${W - PAD*2}" height="4"
    fill="url(#goldGrad)" opacity="0.6"/>

  <text x="${W/2}" y="${startY}" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="${FONT}" font-weight="900"
    fill="${WHITE}">
    ${lines.map((l,i)=>`<tspan x="${W/2}" dy="${i===0?0:LH}">${esc(l)}</tspan>`).join("")}
  </text>

  <rect x="${PAD}" y="${startY + lines.length * LH - LH + 40}" width="${W - PAD*2}" height="4"
    fill="url(#goldGrad)" opacity="0.6"/>

  <text x="${W/2}" y="${H - 80}" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="400"
    fill="${GOLD}" opacity="0.9">swipe →</text>
</svg>`;
}

// Frame 2 — Problem/Solution card
function frame2(product, problem) {
  const pLines = wrap(problem, 32);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${defs()}
  <rect width="${W}" height="${H}" fill="${CREAM}"/>
  <rect x="10" y="10" width="${W-20}" height="${H-20}"
    rx="20" fill="none" stroke="${GOLD}" stroke-width="3" opacity="0.5"/>

  ${brandHeader("Here's the reality")}

  <rect x="${PAD}" y="240" width="${W - PAD*2}" height="4"
    fill="url(#goldGrad)" opacity="0.8"/>

  <text x="${W/2}" y="360" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="900"
    fill="${GREEN_DARK}">The problem:</text>

  <text x="${W/2}" y="480" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="48" font-weight="400"
    fill="${GREY}">
    ${pLines.map((l,i)=>`<tspan x="${W/2}" dy="${i===0?0:68}">${esc(l)}</tspan>`).join("")}
  </text>

  <rect x="${PAD}" y="900" width="${W - PAD*2}" height="4"
    fill="url(#goldGrad)" opacity="0.8"/>

  <text x="${W/2}" y="1020" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="900"
    fill="${GREEN_DARK}">The fix:</text>

  <text x="${W/2}" y="1130" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="700"
    fill="${GREEN}">
    ${wrap(product, 28).map((l,i)=>`<tspan x="${W/2}" dy="${i===0?0:72}">${esc(l)}</tspan>`).join("")}
  </text>

  <text x="${W/2}" y="${H - 80}" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="400"
    fill="${GOLD}" opacity="0.9">swipe →</text>
</svg>`;
}

// Frame 3 — Product card
function frame3(product, price, benefits) {
  const bLines = benefits.slice(0, 4);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${defs()}
  <rect width="${W}" height="${H}" fill="url(#hdrGrad)"/>
  ${dotGrid(0, 0, W, H, 40, 3, "#ffffff", 0.04)}
  <rect x="0" y="0" width="${W}" height="6" fill="url(#goldGrad)"/>

  <text x="${W/2}" y="100" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="700"
    fill="${CREAM}" letter-spacing="5" opacity="0.85">SMARTER HUSTLE ACADEMY™</text>

  <text x="${W/2}" y="260" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="36" font-weight="600"
    fill="${GOLD}">Introducing:</text>

  <text x="${W/2}" y="380" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="70" font-weight="900"
    fill="${WHITE}">
    ${wrap(product, 20).map((l,i)=>`<tspan x="${W/2}" dy="${i===0?0:84}">${esc(l)}</tspan>`).join("")}
  </text>

  <rect x="${PAD}" y="600" width="${W - PAD*2}" height="3"
    fill="url(#goldGrad)" opacity="0.7"/>

  ${bLines.map((b, i) => `
  <text x="${PAD + 60}" y="${700 + i * 120}"
    font-family="Arial,Helvetica,sans-serif" font-size="46" font-weight="400"
    fill="${CREAM}">✓ ${esc(b)}</text>`).join("")}

  <rect x="${PAD}" y="1220" width="360" height="130"
    rx="16" fill="${GOLD}" filter="url(#shadow)"/>
  <text x="${PAD + 180}" y="1302"
    text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="72" font-weight="900"
    fill="${GREEN_DARK}">${esc(price)}</text>

  <text x="${W/2}" y="${H - 80}" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="400"
    fill="${GOLD}" opacity="0.9">swipe →</text>
</svg>`;
}

// Frame 4 — CTA card
function frame4(url) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  ${defs()}
  <rect width="${W}" height="${H}" fill="${CREAM}"/>
  <rect x="10" y="10" width="${W-20}" height="${H-20}"
    rx="20" fill="none" stroke="${GOLD}" stroke-width="3" opacity="0.5"/>
  ${dotGrid(PAD, 200, W - PAD*2, H - 400, 50, 3, GREEN, 0.08)}

  ${brandHeader("Ready to start?")}

  <text x="${W/2}" y="500" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="900"
    fill="${GREEN_DARK}">Get instant access</text>

  <text x="${W/2}" y="600" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="48" font-weight="400"
    fill="${GREY}">No subscription. Yours forever.</text>

  <rect x="${PAD}" y="720" width="${W - PAD*2}" height="4"
    fill="url(#goldGrad)" opacity="0.8"/>

  <text x="${W/2}" y="860" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="44" font-weight="600"
    fill="${GREY}">Link in bio 👇</text>

  <rect x="${PAD}" y="950" width="${W - PAD*2}" height="140"
    rx="20" fill="${GREEN}" filter="url(#shadow)"/>
  <rect x="${PAD+4}" y="954" width="${W - PAD*2 - 8}" height="132"
    rx="18" fill="none" stroke="${GOLD}" stroke-width="3"/>
  <text x="${W/2}" y="1042"
    text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="46" font-weight="700"
    fill="${CREAM}">${esc(url)}</text>

  <text x="${W/2}" y="1280" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="44" font-weight="700"
    fill="${GREEN_DARK}">#sidehustle #passiveincome</text>
  <text x="${W/2}" y="1360" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="44" font-weight="700"
    fill="${GREEN_DARK}">#digitalproducts #makemoneyonline</text>
</svg>`;
}

async function renderFrame(svgStr, outPath) {
  const buf = Buffer.from(svgStr);
  await sharp(buf).png().toFile(outPath);
}

async function main() {
  const p = JSON.parse(fs.readFileSync("today_posts.json", "utf8"));
  const meta = p._meta;

  const hook    = p.graphic_headline || "Your Income Shouldn't Have a Ceiling";
  const product = meta.product;
  const price   = meta.price === "$0" ? "FREE" : meta.price;
  const url     = "smarterhustleacademy.com";

  // Extract 4 benefits from the tiktok_script or fall back to generic ones
  const script  = p.tiktok_script || "";
  const benefits = [
    "Easy to follow system",
    "No tech skills needed",
    "Start in under an hour",
    "One-time payment only"
  ];

  const problem = p.graphic_subline
    ? `${p.graphic_subline}. Most people never have a backup plan.`
    : "Most people have one income stream and zero backup plan.";

  console.log("Rendering TikTok frames...");
  const tmpDir = "/tmp/tiktok_frames";
  fs.mkdirSync(tmpDir, { recursive: true });

  await renderFrame(frame1(hook),                           `${tmpDir}/frame1.png`);
  await renderFrame(frame2(product, problem),               `${tmpDir}/frame2.png`);
  await renderFrame(frame3(product, price, benefits),       `${tmpDir}/frame3.png`);
  await renderFrame(frame4(url),                            `${tmpDir}/frame4.png`);
  console.log("Frames rendered.");

  // Stitch frames into MP4 using ffmpeg
  // Each frame shown for set duration: 3s, 5s, 5s, 4s = 17s total
  const concatFile = `${tmpDir}/concat.txt`;
  const durations  = [3, 5, 5, 4];
  const frameFiles = [1, 2, 3, 4].map(n => `${tmpDir}/frame${n}.png`);

  const concatContent = frameFiles
    .map((f, i) => `file '${f}'\nduration ${durations[i]}`)
    .join("\n") + `\nfile '${frameFiles[frameFiles.length - 1]}'`;

  fs.writeFileSync(concatFile, concatContent);

  const ffmpegCmd = [
    "ffmpeg -y",
    `-f concat -safe 0 -i ${concatFile}`,
    `-vf "scale=${W}:${H},format=yuv420p"`,
    `-r 30`,
    `-c:v libx264 -preset fast -crf 23`,
    `today_tiktok.mp4`
  ].join(" ");

  console.log("Stitching video with ffmpeg...");
  execSync(ffmpegCmd, { stdio: "inherit" });
  console.log("Wrote today_tiktok.mp4");
}

main().catch(e => { console.error(e); process.exit(1); });
