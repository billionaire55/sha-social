// generate_image.js
// Creates a fresh design from the SHA Canva brand template, updates today's
// product content, exports page 1 as PNG, saves as today_image.png.
//
// Requires env: CANVA_CLIENT_ID, CANVA_CLIENT_SECRET (stored in GitHub Secrets)
// Brand template ID: EAHNan0L2tM
// Element IDs (page 1):
//   headline    : PBwDbm2blKgH1xJz-LBkZmhL6rqsF9TFQ
//   subline     : PBwDbm2blKgH1xJz-LBWwgFDMVSD83QfC
//   description : PBwDbm2blKgH1xJz-LB2WRVlKC4j5T5jC
//   price       : PBwDbm2blKgH1xJz-LBPVlPxNzSrBCkpG

const fs = require("fs");

const TEMPLATE_ID = "EAHNan0L2tM";

const ELEMENTS = {
  headline:    "PBwDbm2blKgH1xJz-LBkZmhL6rqsF9TFQ",
  subline:     "PBwDbm2blKgH1xJz-LBWwgFDMVSD83QfC",
  description: "PBwDbm2blKgH1xJz-LB2WRVlKC4j5T5jC",
  price:       "PBwDbm2blKgH1xJz-LBPVlPxNzSrBCkpG",
};

async function getToken() {
  const creds = Buffer.from(
    `${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials&scope=design%3Acontent%3Awrite%20design%3Ameta%3Aread%20asset%3Aread%20export%3Acontent%3Awrite"
  });

  if (!res.ok) throw new Error(`Token error: ${res.status} ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

async function createDesign(token) {
  const res = await fetch("https://api.canva.com/rest/v1/designs", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      design_type: { type: "preset", name: "SocialMedia" },
      asset_id: TEMPLATE_ID
    })
  });

  if (!res.ok) throw new Error(`Create design error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.design.id;
}

async function openTransaction(token, designId) {
  const res = await fetch(`https://api.canva.com/rest/v1/designs/${designId}/editing_sessions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  if (!res.ok) throw new Error(`Open transaction error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.editing_session.id;
}

async function updateText(token, designId, sessionId, elementId, newText) {
  const res = await fetch(
    `https://api.canva.com/rest/v1/designs/${designId}/editing_sessions/${sessionId}/commands`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [{
          type: "replace_text",
          element_id: elementId,
          content: [{ type: "text", text: newText }]
        }]
      })
    }
  );

  if (!res.ok) {
    console.warn(`  WARN update ${elementId}: ${res.status} ${await res.text()}`);
  }
}

async function commitTransaction(token, designId, sessionId) {
  const res = await fetch(
    `https://api.canva.com/rest/v1/designs/${designId}/editing_sessions/${sessionId}/commit`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({})
    }
  );

  if (!res.ok) throw new Error(`Commit error: ${res.status} ${await res.text()}`);
}

async function exportPNG(token, designId) {
  const res = await fetch("https://api.canva.com/rest/v1/exports", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      design_id: designId,
      format: "png",
      pages: [1]
    })
  });

  if (!res.ok) throw new Error(`Export request error: ${res.status} ${await res.text()}`);
  const { job } = await res.json();
  const jobId = job.id;

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const poll = await fetch(`https://api.canva.com/rest/v1/exports/${jobId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const { job: j } = await poll.json();
    if (j.status === "success") return j.urls[0];
    if (j.status === "failed") throw new Error("Export job failed");
    console.log(`  Waiting for export... (${j.status})`);
  }
  throw new Error("Export timed out");
}

async function downloadPNG(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download error: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync("today_image.png", buffer);
  console.log(`Wrote today_image.png (${(buffer.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  const p = JSON.parse(fs.readFileSync("today_posts.json", "utf8"));
  const meta = p._meta;

  const headline    = meta.product;
  const subline     = meta.hook.replace(/^[^:]+:\s*/, "").split(".")[0].trim();
  const description = `Get instant access — ${meta.price === "$0" ? "free download" : "one-time payment, yours forever"}.`;
  const price       = meta.price === "$0" ? "FREE" : meta.price;

  console.log("Canva image generator starting...");
  console.log(`  Product : ${headline}`);
  console.log(`  Price   : ${price}`);

  const token     = await getToken();
  console.log("  Token acquired");

  const designId  = await createDesign(token);
  console.log(`  Design created: ${designId}`);

  const sessionId = await openTransaction(token, designId);
  console.log(`  Editing session: ${sessionId}`);

  await updateText(token, designId, sessionId, ELEMENTS.headline,    headline);
  await updateText(token, designId, sessionId, ELEMENTS.subline,     subline);
  await updateText(token, designId, sessionId, ELEMENTS.description, description);
  await updateText(token, designId, sessionId, ELEMENTS.price,       price);
  console.log("  Text updated");

  await commitTransaction(token, designId, sessionId);
  console.log("  Transaction committed");

  const pngUrl = await exportPNG(token, designId);
  console.log(`  Export ready`);

  await downloadPNG(pngUrl);
  console.log("Done.");
}

main().catch(e => { console.error(e); process.exit(1); });
