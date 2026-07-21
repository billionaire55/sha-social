// setup_mascot.js
// ONE-TIME SETUP — run this manually once (node setup_mascot.js), not part of the daily cron.
// Registers the SHA mascot as a Higgsfield SoulId (a trained/reusable character reference)
// and saves the resulting ID to mascot-config.json so generate_tiktok.js can reuse her
// on every run without retraining.
//
// Requires env: HF_CREDENTIALS="KEY_ID:KEY_SECRET"  (or HF_API_KEY + HF_API_SECRET)

const fs = require("fs");
const { HiggsfieldClient } = require("@higgsfield/client");

// The approved mascot image from testing — full-color cartoon woman, tablet, no frame artifact.
const MASCOT_REFERENCE_IMAGE_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3Dk7pg5QYrdX6qNutFy676uQx9z/hf_20260719_014134_30bf6634-fb48-4771-8181-1e54df457914.png";

async function main() {
  const client = new HiggsfieldClient(); // reads HF_CREDENTIALS / HF_API_KEY+HF_API_SECRET from env

  console.log("Registering SHA mascot as a Higgsfield SoulId...");
  const soulId = await client.createSoulId(
    {
      name: "sha-mascot",
      input_images: [{ type: "image_url", image_url: MASCOT_REFERENCE_IMAGE_URL }]
    },
    true // withPolling — wait for training to finish
  );

  if (!soulId.isCompleted) {
    throw new Error("SoulId training did not complete — check your Higgsfield dashboard.");
  }

  fs.writeFileSync(
    "mascot-config.json",
    JSON.stringify({ soul_id: soulId.id, name: "sha-mascot", created: new Date().toISOString() }, null, 2)
  );

  console.log(`Done. SoulId "${soulId.id}" saved to mascot-config.json — commit this file.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
