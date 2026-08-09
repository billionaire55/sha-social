// generate_posts.js
// Reads today's offer from offers.json, calls Claude (Agent 1) and writes today_posts.json
// Requires env: ANTHROPIC_API_KEY

const fs = require("fs");

const SYSTEM_PROMPT = `
You are the Daily Offer Publisher for Smarter Hustle Academy (SHA), a digital entrepreneurship brand run by one solo operator. Produce one day's social posts promoting a single SHA product, framed around making money in a high-cost economy.

VOICE: street-smart digital mentor. Direct, motivational, plain English. Lead with outcomes.

HARD RULES:
- NEVER promise specific income or guarantees. Systems and realistic possibilities only.
- NEVER invent product contents, features, page counts, or specifics that were not given to you in the "What's actually inside" line below. If that line is missing or says "FILL IN", write an honest, general statement about the format (e.g. "a step-by-step guide you work through at your own pace") instead of making up specifics.
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
  "tiktok_scenes": [
    "HOOK — 8-12 words, stop-the-scroll, ties to today's economic angle — speakable in under 5 seconds",
    "WHAT'S INSIDE — 10-14 words, tells the viewer specifically what they get/what's covered, built directly from the 'What's actually inside' line provided to you — do not invent details beyond what was given",
    "OUTCOME — 10-14 words, what the person will actually be able to DO or know after going through it — concrete, not vague hype",
    "OFFER — 10-14 words, price stated naturally plus why it's low-risk (one-time, no subscription, etc.)",
    "CTA — 8-10 words, urgency plus 'link in bio'"
  ],
  "graphic_headline": "punchy hook for the post image, under 40 chars, title case, do NOT include the price",
  "graphic_subline": "supporting line for the image, under 60 chars"
}
tiktok_scenes drives an automated voiced video (fal.ai/Higgsfield + ElevenLabs + ffmpeg) — every line is spoken aloud by a TTS voice, so keep each one natural to say out loud: no markdown, no hashtags, no emoji, no abbreviations that don't sound right read aloud. Always exactly 5 array entries, in this exact order: hook, what's inside, outcome, offer, CTA. The goal of this video is for a viewer to walk away knowing concretely what they'd be getting, not just that something is for sale.
Escape characters correctly for JSON.
`.trim();

function todayOffer() {
  const offers = JSON.parse(fs.readFileSync("offers.json", "utf8"));
  const dow = new Date().getUTCDay().toString();
  return offers[dow];
}

async function callClaude(userMsg) {
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
  return data.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
}

// Best case: the response is clean JSON (optionally fenced). If Claude adds
// any stray preamble/explanation despite the instruction not to, fall back
// to pulling out the first balanced {...} block instead of failing the
// entire day's run over a formatting slip.
function parsePostsJson(rawText) {
  let text = rawText.replace(/^```json\s*/i, "").replace(/```$/g, "").trim();
  try {
    return JSON.parse(text);
  } catch (e) {
    const start = text.indexOf("{");
    if (start === -1) throw e;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          return JSON.parse(text.slice(start, i + 1));
        }
      }
    }
    throw e; // no balanced closing brace found — genuinely malformed, give up
  }
}

async function main() {
  const offer = todayOffer();
  const whatsInside =
    offer.whats_inside && !/^FILL IN/i.test(offer.whats_inside.trim())
      ? offer.whats_inside
      : "Not provided — do not invent specifics, write an honest general statement about the format only.";

  const userMsg =
    `Date: ${new Date().toISOString().slice(0, 10)}\n` +
    `Product: ${offer.product}\nPrice: ${offer.price}\nProduct URL: ${offer.url}\n` +
    `Offer hook for today: ${offer.hook}\n` +
    `What's actually inside: ${whatsInside}\n` +
    `Priority platforms: ${offer.platforms.join(", ")}`;

  let posts;
  try {
    posts = parsePostsJson(await callClaude(userMsg));
  } catch (firstError) {
    // One retry — covers a transient 5xx/network blip or a one-off bad
    // parse, without silently masking a genuinely broken prompt (if the
    // retry also fails, this still throws and the run still fails loudly).
    console.warn(`First attempt failed (${firstError.message}) — retrying once...`);
    posts = parsePostsJson(await callClaude(userMsg));
  }

  posts._meta = { product: offer.product, price: offer.price, url: offer.url, platforms: offer.platforms };
  fs.writeFileSync("today_posts.json", JSON.stringify(posts, null, 2));
  console.log("Generated posts for:", offer.product);
}

main().catch(e => { console.error(e); process.exit(1); });
