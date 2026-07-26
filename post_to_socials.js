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
  tiktok:    "tiktok",
  youtube:   "youtube"
};

// Every platform gets the branded mascot image except the ones getting video
// instead — per her request, no post should go out as words-only.
const IMAGE_PLATFORMS = new Set(["facebook", "linkedin", "x", "instagram", "pinterest"]);
const VIDEO_REQUIRED = new Set(["tiktok", "youtube"]);

// YouTube requires an explicit title (separate from the post body/description).
function youtubeTitle(p) {
  const headline = p.graphic_headline || p._meta.product;
  const title = `${headline} — Smarter Hustle Academy`;
  return title.length > 95 ? `${title.slice(0, 92)}...` : title;
}

function imageUrl() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return null;
  // Only point platforms at this file if it actually exists locally — otherwise
  // a skipped/failed render step would still hand PostProxy a 404 URL instead
  // of cleanly skipping the platforms that need it.
  if (!fs.existsSync("today_image.png")) return null;
  return `https://raw.githubusercontent.com/${repo}/main/today_image.png`;
}

function videoUrl() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return null;
  if (!fs.existsSync("today_tiktok.mp4")) return null;
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
    case "youtube":   return p.instagram || p.facebook;
    default:          return null;
  }
}

async function postOne(platform, text, p) {
  const platformId = PLATFORM_ID[platform];
  if (!platformId) { console.log(`SKIP ${platform}: unsupported`); return; }

  const img  = imageUrl();
  const vid  = videoUrl();

  const needsImg = IMAGE_PLATFORMS.has(platform);
  const needsVid = VIDEO_REQUIRED.has(platform);

  if (needsImg && !img) { console.log(`SKIP ${platform}: image required`); return; }
  if (needsVid && !vid) { console.log(`SKIP ${platform}: video required`); return; }

  const body = { post: { body: text }, profiles: [platformId] };

  if (needsVid) {
    body.media = [vid];
  } else if (needsImg && img) {
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

  if (platform === "youtube") {
    body.platforms = {
      youtube: {
        title: youtubeTitle(p),
        privacy_status: "public"
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

  let failures = 0;

  for (const platform of platforms) {
    const text = contentFor(platform, p);
    if (!text) { console.log(`SKIP ${platform}: no content`); continue; }
    // Each platform is isolated — a thrown error (network failure, PostProxy
    // outage) on one platform must not stop the remaining platforms from
    // posting. Previously an uncaught exception here killed the whole loop
    // and everything after the failing platform silently never posted.
    try {
      await postOne(platform, text, p);
    } catch (e) {
      failures++;
      console.error(`FAIL ${platform}: ${e.message || e}`);
    }
  }

  if (failures > 0) {
    console.error(`${failures} platform(s) failed to post — see FAIL lines above.`);
    process.exitCode = 1; // visible as a failed run in Actions, but every platform was still attempted
  }
}

main().catch(e => { console.error(e); process.exit(1); });
