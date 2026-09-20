// generate_image_kie_sample.js
// TEST-ONLY SCRIPT — produces one sample image (kie_sample_image.png) using
// Kie.ai's 4o Image model as pure text-to-image (no reference image), so you
// can judge quality before deciding whether/how often to use it as a variant
// alongside your existing free branded SVG card (generate_image.js —
// unchanged, still free, still your default).
//
// NOT wired into daily-offer.yml. Doesn't touch today_posts.json, doesn't
// post anywhere. Run manually via the "Kie.ai Image Sample (Test Only)"
// GitHub Actions workflow.
//
// KNOWN LIMITATIONS to judge the sample against:
// 1. Kie.ai's 4o Image API only supports aspect ratios 1:1, 3:2, or 2:3 —
//    none match your card's 1080x1350 (~4:5) exactly. This uses 2:3.
// 2. AI image models are unreliable at rendering crisp, correctly-spelled
//    text. Your current SVG card renders text with 100% accuracy every
//    time; this sample's on-image text (if any renders at all) may be
//    garbled, misspelled, or missing. This is a real trade-off, not a bug.
// 3. No mascot reference — this generates a brand-new illustrated character/
//    scene from the text prompt alone, so it will NOT look like your
//    existing mascot.
//
// Requires env: KIE_API_KEY

const fs = require("fs");
const https = require("https");

const KIE_API = "https://api.kie.ai";

// Override with a different prompt via the workflow's manual input if you
// want to test other creative directions.
const TEST_PROMPT =
  process.env.TEST_PROMPT ||
  "A warm, professional illustrated social media card for a digital " +
  "education business called Smarter Hustle Academy. Forest green " +
  "(#2D6A4F) and gold (#D4A017) color scheme, cream background. Show a " +
  "confident, approachable illustrated character in a clean flat " +
  "illustration style, motivational and trustworthy feel. Leave clear " +
  "open space at the top for a short headline.";

function downloadFile(url, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`Download failed: ${res.statusCode} for ${url}`));
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", reject);
  });
}

function kieRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      `${KIE_API}${urlPath}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${process.env.KIE_API_KEY}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
        }
      },
      res => {
        let data = "";
        res.on("data", c => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data) });
          } catch (e) {
            reject(new Error(`Kie.ai returned non-JSON (HTTP ${res.statusCode}): ${data.slice(0, 500)}`));
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function createImageTask(prompt) {
  // Pure text-to-image — no filesUrl, no reference image, so there's nothing
  // for Kie.ai to fetch from anywhere. This sidesteps the GitHub-raw-URL
  // fetch/rate-limit issue entirely.
  const { status, json } = await kieRequest("POST", "/api/v1/gpt4o-image/generate", {
    prompt,
    size: "2:3" // closest available option to your 1080x1350 card
  });
  if (json?.code !== 200) {
    throw new Error(`Kie.ai generate failed (HTTP ${status}): ${json?.msg || JSON.stringify(json)}`);
  }
  return json.data.taskId;
}

async function waitForImage(taskId, { timeoutMs = 2 * 60 * 1000, intervalMs = 4000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { json } = await kieRequest("GET", `/api/v1/gpt4o-image/record-info?taskId=${encodeURIComponent(taskId)}`);
    const data = json?.data;
    if (!data) throw new Error(`Kie.ai record-info returned no data: ${JSON.stringify(json)}`);
    if (data.status === "SUCCESS") {
      const urls = data.response?.resultUrls || [];
      if (!urls.length) throw new Error("Kie.ai task succeeded but returned no resultUrls.");
      return urls[0];
    }
    if (data.status === "CREATE_TASK_FAILED" || data.status === "GENERATE_FAILED") {
      throw new Error(`Kie.ai image task failed (${data.status}): ${data.errorMessage || "no reason given"}`);
    }
    console.log(`  Kie.ai: ${data.status} (progress ${data.progress || "0.00"})...`);
    // Docs cap queries at 3/sec per task — 4s interval is comfortably under that.
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for Kie.ai image task ${taskId} after ${timeoutMs / 1000}s`);
}

async function main() {
  if (!process.env.KIE_API_KEY) throw new Error("KIE_API_KEY environment variable not set.");

  console.log(`Prompt: "${TEST_PROMPT}"`);
  console.log("Requesting Kie.ai 4o Image (text-to-image, no reference)...");

  const taskId = await createImageTask(TEST_PROMPT);
  console.log(`Kie.ai taskId: ${taskId}`);

  const imageUrl = await waitForImage(taskId);
  console.log("Downloading result...");
  await downloadFile(imageUrl, "kie_sample_image.png");

  console.log("Wrote kie_sample_image.png — download it from this run's artifacts to view.");
}

main().catch(e => {
  console.error("Sample generation failed:", e.message);
  process.exit(1);
});
