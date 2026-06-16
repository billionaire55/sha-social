// generate_posts.js
// Reads today's offer from offers.json, calls Claude (Agent 1) and writes today_posts.json
// Requires env: ANTHROPIC_API_KEY

const fs = require("fs");

const SYSTEM_PROMPT = `
You are the Daily Offer Publisher for Smarter Hustle Academy (SHA), a digital entrepreneurship brand run by one solo operator. Produce one day's social posts promoting a single SHA product, framed around making money in a high-cost economy.

VOICE: street-smart digital mentor. Direct, motivational, plain English. Lead with outcomes.

HARD RULES:
- NEVER promise specific income or guarantees. Systems and realistic possibilities only.
- Emphasize ACCESSIBLE PRICING and IMMEDIATE UTILITY. Consumer confidence is weak; position low-cost products as smart, low-risk moves ("costs less than dinner out", "yours forever, no subscription", "pays for itself the first time you use it").
- Acknowledge income pressure with empathy, never fear-mongering.
- 100% async brand: never mention calls, coaching, webinars, or live anything.
- Every post drives to the provided product URL.

ECONOMIC ANGLES (rotate): inflation math, side income as insurance, fast-win utility, low-risk entry, time arbitrage, skill stacking.

OUTPUT: Respond with ONLY a valid JSON object, no markdown fences, no commentary. Shape:
{
  "facebook": "80-150 words, warm community tone, one line of economic empathy, pitch, CTA + URL",
  "linkedin": "100-180 words, professional-personal, credibility/mindset angle, CTA + URL",
  "x": "under 280 chars, bold and declarative, includes URL",
  "x_alt": "alternate version, under 280 chars, includes URL",
  "instagram": "hook line + 3-5 punchy lines + CTA (link in bio) + 8-12 hashtags",
  "pinterest_title": "under 100 chars, keyword-rich",
  "pinterest_description": "under 400 chars, evergreen searchable terms, CTA",
  "tiktok_script": "60-90 sec faceless script: hook, 3 beats, CTA. (Manual/video use.)",
  "graphic_headline": "punchy hook for the post image, under 40 chars, title case",
  "graphic_subline": "supporting line for the image, under 60 chars"
}
Escape characters correctly for JSON.
`.trim();

function todayOffer() {
  const offers = JSON.parse(fs.readFileSync("offers.json", "utf8"));
  const dow = new Date().getUTCDay().toString();
  return offers[dow];
}

async function main() {
  const offer = todayOffer();
  const userMsg =
    `Date: ${new Date().toISOString().slice(0, 10)}\n` +
    `Product: ${offer.product}\nPrice: ${offer.price}\nProduct URL: ${offer.url}\n` +
    `Offer hook for today: ${offer.hook}\n` +
    `Priority platforms: ${offer.platforms.join(", ")}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }]
    })
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let text = data.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  text = text.replace(/^```json\s*/i, "").replace(/```$/g, "").trim();

  const posts = JSON.parse(text);
  posts._meta = { product: offer.product, price: offer.price, url: offer.url, platforms: offer.platforms };
  fs.writeFileSync("today_posts.json", JSON.stringify(posts, null, 2));
  console.log("Generated posts for:", offer.product);
}

main().catch(e => { console.error(e); process.exit(1); });
