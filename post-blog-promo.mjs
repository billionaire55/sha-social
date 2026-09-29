// post-blog-promo.mjs
// Posts a blog promo card to Facebook, X, LinkedIn, Instagram via Postproxy.
// Called by blog-promo.yml after the promo image is generated and committed.
//
// CORRECTED (Sep 29 2026): a previous edit changed FACEBOOK_PAGE_ID to
// "136127763142783" (the daily-social-pipeline page ID) on the assumption
// that the old value was a typo. That was wrong — Postproxy's post history
// confirms "136127503142783" has been publishing successfully to Facebook
// via this exact script (posts on 9/27 and 9/28), and the article-42 run
// with the changed ID silently failed to post to Facebook at all (Twitter,
// LinkedIn and Instagram all posted fine; Facebook just never appeared in
// Postproxy's history). Reverted to the confirmed-working ID.
//
// Also removed the unused PINTEREST_BOARD_ID constant (blog promos don't
// post to Pinterest — it was declared but never referenced, which made it
// look like Pinterest was covered when it isn't). If you want blog promos
// on Pinterest too, say so and it's a small addition using the same board
// ID your daily posts use.
//
// Also added: required-env-var checks (fails loudly instead of silently
// sending a bad request if a secret is missing) and a try/catch around each
// platform's fetch so one platform's network error can't crash the whole
// run before the others get a chance to post.

const FACEBOOK_PAGE_ID = "136127503142783"; // confirmed working via Postproxy post history
const BASE_URL          = "https://api.postproxy.dev/api/posts";

const title   = process.env.BLOG_TITLE   || "New Post";
const blogUrl = process.env.BLOG_URL     || "https://blog.smarterhustleacademy.com";
const repo    = process.env.GITHUB_REPOSITORY;

if (!process.env.POSTPROXY_API_KEY) {
  console.error("FATAL: POSTPROXY_API_KEY is not set (check repo secrets).");
  process.exit(1);
}
if (!repo) {
  console.warn("GITHUB_REPOSITORY not set — posts will go out with no image.");
}

const imageUrl = repo
  ? `https://raw.githubusercontent.com/${repo}/main/blog_promo_image.png`
  : null;

const PLATFORMS = [
  {
    id: "facebook",
    body: `📝 New on the SHA Blog\n\n${title}\n\nRead it free → ${blogUrl}`,
    extra: { platforms: { facebook: { page_id: FACEBOOK_PAGE_ID } } }
  },
  {
    id: "twitter",
    body: `New post just dropped 👇\n\n${title}`,
    thread: [{ body: blogUrl }]
  },
  {
    id: "linkedin",
    body: `New on the Smarter Hustle Academy blog:\n\n${title}\n\nRead it here → ${blogUrl}`
  },
  {
    id: "instagram",
    body: `New blog post alert 🚨\n\n${title}\n\nLink in bio → ${blogUrl}\n\n#sidehustle #digitalproducts #passiveincome #smarterhustle #onlinebusiness #makemoneyonline #digitalentrepreneur #sidehustleideas`
  }
];

async function post(platform) {
  const body = {
    post: { body: platform.body },
    profiles: [platform.id],
    ...(platform.extra || {}),
    ...(platform.thread ? { thread: platform.thread } : {})
  };
  if (imageUrl) body.media = [imageUrl];

  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.POSTPROXY_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      console.error(`FAIL ${platform.id}: ${res.status} ${await res.text()}`);
    } else {
      const data = await res.json();
      console.log(`POSTED ${platform.id} -> id ${data.id || "?"}`);
    }
  } catch (e) {
    console.error(`FAIL ${platform.id}: network error — ${e.message}`);
  }
}

let failures = 0;
for (const platform of PLATFORMS) {
  await post(platform);
}
