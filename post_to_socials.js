// post_to_socials.js
const fs   = require("fs");
const BASE_URL           = "https://api.postproxy.dev/api/posts";
const FACEBOOK_PAGE_ID   = "136127503142783";
const PINTEREST_BOARD_ID = "1109011545681300939";

const PLATFORM_ID = {
  facebook:  "facebook",
  linkedin:  "linkedin",
  x:         "twitter",
  instagram: "instagram",
  pinterest: "pinterest",
  tiktok:    "tiktok"
};

const IMAGE_REQUIRED = new Set(["instagram", "pinterest"]);
const IMAGE_OPTIONAL = new Set(["facebook", "x"]);
const VIDEO_REQUIRED = new Set(["tiktok"]);

function imageUrl() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return null;
  return `https://raw.githubusercontent.com/${repo}/main/today_image.png`;
}

function videoUrl() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return null;
  return `https://raw.githubusercontent.com/${repo}/main/today_tiktok.mp4`;
}

function contentFor(platform, p) {
  switch (platform) {
    case "facebook":  return p.facebook;
    case "linkedin":  return p.linkedin;
    case "x":         return p.x;
    case "instagram": return p.instagram;
    case "pinterest": return `${p.pinterest_title}\n\n${p.pinterest_description}`;
    case "tiktok":    return p.instagram || p.facebook;
    default:          return null;
  }
}

async function postOne(platform, text, p) {
  const platformId = PLATFORM_ID[platform];
  if (!platformId) { console.log(`SKIP ${platform}: unsupported`); return; }

  const img  = imageUrl();
  const vid  = videoUrl();

  const needsImg = IMAGE_REQUIRED.has(platform);
  const needsVid = VIDEO_REQUIRED.has(platform);

  if (needsImg && !img) { console.log(`SKIP ${platform}: image required`); return; }
  if (needsVid && !vid) { console.log(`SKIP ${platform}: video required`); return; }

  const body = { post: { body: text }, profiles: [platformId] };

  if (needsVid) {
    body.media = [vid];
  } else if (img && (needsImg || IMAGE_OPTIONAL.has(platform))) {
    body.media = [img];
  }

  if (platform === "facebook") {
    body.platforms = { facebook: { page_id: FACEBOOK_PAGE_ID } };
  }

  if (platform === "x") {
    const stripped = text.replace(/https?:\/\/\S+/g, "").replace(/[\s:–—-]+$/, "").trim();
    body.post.body = stripped;
    body.thread = [{ body: p._meta.url }];
  }

  if (platform === "pinterest") {
    body.platforms = {
      pinterest: {
        board_id: PINTEREST_BOARD_ID,
        title: (p.pinterest_title || "").slice(0, 100),
        destination_link: p._meta.url
      }
    };
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
    console.log(`POSTED ${platform}${body.media ? " (with media)" : ""} -> id ${data.id || "?"}`);
  }
}

async function main() {
  const p = JSON.parse(fs.readFileSync("today_posts.json", "utf8"));
  const platforms = (p._meta && p._meta.platforms) || [];

  for (const platform of platforms) {
    const text = contentFor(platform, p);
    if (!text) { console.log(`SKIP ${platform}: no content`); continue; }
    await postOne(platform, text, p);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
