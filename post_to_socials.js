// post_to_socials.js
// Reads today_posts.json + today_image.png (already committed to the repo) and
// publishes via the Postproxy unified API. No server to host — pure API calls.
//
// Requires env: POSTPROXY_API_KEY, and (in GitHub Actions) GITHUB_REPOSITORY.

const fs = require("fs");

const BASE_URL = "https://api.postproxy.dev/api/posts";
const FACEBOOK_PAGE_ID = "136127503142783"; // Paramount Business Online Multiplex

// Map our internal platform keys -> Postproxy platform IDs
const PLATFORM_ID = {
  facebook:  "facebook",
  linkedin:  "linkedin",
  x:         "twitter",   // Postproxy's platform id for X is "twitter"
  instagram: "instagram",
  pinterest: "pinterest"
  // tiktok intentionally omitted: needs video + a completed TikTok audit.
};

// Platforms that REQUIRE an image — post is skipped if the image is missing
const IMAGE_REQUIRED = new Set(["instagram", "pinterest"]);
// Platforms that work fine with or without an image
const IMAGE_OPTIONAL = new Set(["facebook", "x"]);

function imageUrl() {
  const repo = process.env.GITHUB_REPOSITORY; // e.g. billionaire55/sha-social
  if (!repo) return null;
  return `https://raw.githubusercontent.com/${repo}/main/today_image.png`;
}

function contentFor(platform, p) {
  switch (platform) {
    case "facebook":  return p.facebook;
    case "linkedin":  return p.linkedin;
    case "x":         return p.x;
    case "instagram": return p.instagram;
    case "pinterest": return `${p.pinterest_title}\n\n${p.pinterest_description}`;
    default:          return null;
  }
}

async function postOne(platform, text, img) {
  const platformId = PLATFORM_ID[platform];
  if (!platformId) { console.log(`SKIP ${platform}: unsupported platform`); return; }

  const needsImg = IMAGE_REQUIRED.has(platform);
  if (needsImg && !img) { console.log(`SKIP ${platform}: image required but missing`); return; }

  const body = { post: { body: text }, profiles: [platformId] };
  if (img && (needsImg || IMAGE_OPTIONAL.has(platform))) {
    body.media = [img];
  }
  if (platform === "facebook") {
    body.platforms = { facebook: { page_id: FACEBOOK_PAGE_ID } };
  }

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.POSTPROXY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    console.error(`FAIL ${platform}: ${res.status} ${await res.text()}`);
  } else {
    const data = await res.json();
    console.log(`POSTED ${platform}${body.media ? " (with image)" : ""} -> id ${data.id || "?"}`);
  }
}

async function main() {
  const p = JSON.parse(fs.readFileSync("today_posts.json", "utf8"));
  const platforms = (p._meta && p._meta.platforms) || [];
  const img = fs.existsSync("today_image.png") ? imageUrl() : null;

  for (const platform of platforms) {
    const text = contentFor(platform, p);
    if (!text) { console.log(`SKIP ${platform}: no content`); continue; }
    await postOne(platform, text, img);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
