/**
 * Measure /analyze latency (raw vs resized) against production or local API.
 *   MBOX_API_KEY=... node scripts/benchmark-analyze-latency.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const api =
  process.env.MBOX_API_BASE_URL ??
  "https://mbox-api-118689443638.asia-northeast3.run.app";
const key = process.env.MBOX_API_KEY;
if (!key) {
  console.error("Set MBOX_API_KEY");
  process.exit(1);
}

const imagePath =
  process.env.MBOX_TEST_IMAGE ??
  join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "data/asset/temp_1778692001076.-1818431043/KakaoTalk_20260505_131306132_01.jpg",
  );

async function timedAnalyze(label, base64, mimeType) {
  const t0 = performance.now();
  const res = await fetch(`${api}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": key },
    body: JSON.stringify({ imageBase64: base64, mimeType }),
  });
  const body = await res.json();
  const sec = ((performance.now() - t0) / 1000).toFixed(2);
  if (!res.ok) {
    console.log(`${label}: FAIL ${res.status} in ${sec}s`, body.error ?? body);
    return null;
  }
  console.log(`${label}: OK in ${sec}s → ${body.metadata?.label}`);
  return Number(sec);
}

const raw = readFileSync(imagePath);
const rawB64 = raw.toString("base64");
console.log(`image bytes: ${(raw.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`API: ${api}\n`);

await timedAnalyze("raw JPEG (full file)", rawB64, "image/jpeg");

// Second call should hit server cache if same payload
await timedAnalyze("raw JPEG (cache)", rawB64, "image/jpeg");
