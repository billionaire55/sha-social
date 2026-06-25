// post-blog-promo.mjs
// Posts a blog promo card to Facebook, X, LinkedIn, Instagram via Postproxy.
// Called by blog-promo.yml after the promo image is generated and committed.

const FACEBOOK_PAGE_ID    = "136127503142783";
const PINTEREST_BOARD_ID  = "1109011545681300939";
const BASE_URL            = "https://api.postproxy.dev/api/posts";

const title   = process.env.BLOG_TITLE   || "New Post";
const blogUrl = process.env.BLOG_URL     || "https://blog.smarterhustleacademy.com";
const repo    = process.env.GITHUB_REPOSITORY;

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
  if (imageUrl && platform.id !== "twitter") body.media = [imageUrl];

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
}

for (const platform of PLATFORMS) {
  await post(platform);
}
