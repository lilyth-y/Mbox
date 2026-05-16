import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API =
  process.env.MBOX_API_BASE_URL ??
  "https://mbox-api-118689443638.asia-northeast3.run.app";
const KEY = process.env.MBOX_API_KEY;
if (!KEY) {
  console.error("Set MBOX_API_KEY");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const imagePath =
  process.env.MBOX_TEST_IMAGE ??
  join(root, "experiments/assets/web-varied/web-portrait-tall.jpg");
const buf = readFileSync(imagePath);
const body = {
  imageBase64: buf.toString("base64"),
  mimeType: "image/jpeg",
};

const res = await fetch(`${API}/analyze`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": KEY,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  console.error("Non-JSON response", res.status, text.slice(0, 500));
  process.exit(1);
}

if (!res.ok) {
  console.error("Analyze failed", res.status, json);
  process.exit(1);
}

const meta = json.metadata ?? json;
console.log(
  JSON.stringify(
    {
      ok: true,
      status: res.status,
      hasMetadata: Boolean(meta),
      category: meta?.suggestedCategory ?? meta?.category,
      keys: meta && typeof meta === "object" ? Object.keys(meta).slice(0, 12) : [],
    },
    null,
    2,
  ),
);
