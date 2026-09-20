// generate_image_kie_sample.js
// TEST-ONLY SCRIPT — produces one sample image (kie_sample_image.png) using
// Kie.ai's 4o Image model, referencing your mascot, so you can judge quality
// before deciding whether/how often to use it as a variant alongside your
// existing free branded SVG card (generate_image.js — unchanged, still free,
// still your default).
//
// NOT wired into daily-offer.yml. Doesn't touch today_posts.json, doesn't
// post anywhere. Run manually via the "Kie.ai Image Sample (Test Only)"
// GitHub Actions workflow.
//
// CONFIRMED (via Kie.ai's own dashboard logs, Sep 2026): both a mascot-
// referenced task and a no-reference task completed with status "success" —
// the mascot version looked great and is the preferred direction. The
// earlier "timed out" result wasn't a real failure; the job genuinely took
// longer than our 5-minute polling window to finish, so this version waits
// longer instead of giving up early.
//
// KNOWN LIMITATIONS to judge the sample against:
// 1. Kie.ai's 4o Image API only supports aspect ratios 1:1, 3:2, or 2:3 —
//    none match your card's 1080x1350 (~4:5) exactly. This uses 2:3.
// 2. AI image models are unreliable at rendering crisp, correctly-spelled
//    text — worth double-checking any on-image text in the result carefully.
//
// Requires env: KIE_API_KEY
// Requires: assets/mascot.png committed to the repo

const fs = require("fs");
const https = require("https");

const KIE_API = "https://api.kie.ai";

// Override with a different prompt via the workflow's manual input if you
// want to test other creative directions.
const TEST_PROMPT =
  process.env.TEST_PROMPT ||
  "A warm, professional illustrated branded social media card for a digital " +
  "education business called Smarter Hustle Academy. Forest green (#2D6A4F) " +
  "and gold (#D4A017) color scheme, cream background. Feature the mascot " +
  "character prominently. Clean, modern, trustworthy, motivational feel. " +
  "Leave clear open space at the top for a short headline.";

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

// Uploads the mascot to Kie.ai's own file storage rather than pointing them
// at a raw.githubusercontent.com URL, so the whole request is self-contained
// on Kie.ai's infrastructure and there's no dependency on GitHub's fetch
// speed/rate limits at all.
async function uploadMascotToKie() {
  const localPath = "assets/mascot.png";
  if (!fs.existsSync(localPath)) {
    throw new Error(`${localPath} not found — checkout must include the mascot image.`);
  }
  const base64Data = `data:image/png;base64,${fs.readFileSync(localPath).toString("base64")}`;

  const { status, json } = await new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      base64Data,
      uploadPath: "images",
      fileName: "mascot.png"
    });
    const req = https.request(
      "https://kieai.redpandaai.co/api/file-base64-upload",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.KIE_API_KEY}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      res => {
        let data = "";
        res.on("data", c => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data) });
          } catch (e) {
            reject(new Error(`Kie.ai upload returned non-JSON (HTTP ${res.statusCode}): ${data.slice(0, 500)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });

  const uploadedUrl = json?.data?.downloadUrl || json?.data?.fileUrl || json?.downloadUrl || json?.fileUrl;
  if (!uploadedUrl) {
    throw new Error(`Kie.ai upload failed (HTTP ${status}): ${JSON.stringify(json)}`);
  }
  console.log(`Mascot uploaded to Kie.ai's own storage: ${uploadedUrl}`);
  return uploadedUrl;
}

async function createImageTask(prompt, referenceImageUrl) {
  const { status, json } = await kieRequest("POST", "/api/v1/gpt4o-image/generate", {
    prompt,
    filesUrl: [referenceImageUrl],
    size: "2:3" // closest available option to your 1080x1350 card
  });
  if (json?.code !== 200) {
    throw new Error(`Kie.ai generate failed (HTTP ${status}): ${json?.msg || JSON.stringify(json)}`);
  }
  return json.data.taskId;
}

async function waitForImage(taskId, { timeoutMs = 8 * 60 * 1000, intervalMs = 5000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { json } = await kieRequest("GET", `/api/v1/gpt4o-image/record-info?taskId=${encodeURIComponent(taskId)}`);
    const data = json?.data;
    if (!data) throw new Error(`Kie.ai record-info returned no data: ${JSON.stringify(json)}`);
    if (data.status === "SUCCESS") {
      const urls = data.response?.resultUrls || [];
      if (!urls.length) throw new Error("Kie.ai task succeeded but returned no resultUrls.");
      console.log("Kie.ai task complete.");
      return urls[0];
    }
    if (data.status === "CREATE_TASK_FAILED" || data.status === "GENERATE_FAILED") {
      throw new Error(`Kie.ai image task failed (${data.status}): ${data.errorMessage || "no reason given"}`);
    }
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`  Kie.ai: ${data.status} (progress ${data.progress || "0.00"}, ${elapsed}s elapsed)...`);
    // Docs cap queries at 3/sec per task — 5s interval is comfortably under that.
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Timed out waiting for Kie.ai image task ${taskId} after ${timeoutMs / 1000}s. ` +
    `Check kie.ai/logs directly for this taskId — it may have completed just after this script gave up ` +
    `(this happened once before: a task that reported "timed out" here actually succeeded on Kie.ai's ` +
    `own dashboard a bit later). If it shows success there, the image is available via the "Result" ` +
    `button on that log entry even though this run failed.`
  );
}

async function main() {
  if (!process.env.KIE_API_KEY) throw new Error("KIE_API_KEY environment variable not set.");

  console.log(`Prompt: "${TEST_PROMPT}"`);
  const referenceUrl = await uploadMascotToKie();
  console.log("Requesting Kie.ai 4o Image (referencing uploaded mascot)...");

  const taskId = await createImageTask(TEST_PROMPT, referenceUrl);
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
