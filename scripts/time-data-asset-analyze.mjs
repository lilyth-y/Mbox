import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(join(root, "experiments/assets/data-asset-manifest.json"), "utf8"),
);
const api = process.env.API_URL ?? "http://127.0.0.1:8787";

const items = manifest.samples.map((s) => ({
  id: s.id,
  mimeType: s.mimeType,
  imageBase64: readFileSync(join(root, s.imagePath)).toString("base64"),
}));

const started = Date.now();
const results = [];
const CHUNK = Number(process.env.ANALYZE_CHUNK_SIZE ?? 4);
for (let i = 0; i < items.length; i += CHUNK) {
  const chunk = items.slice(i, i + CHUNK);
  const t0 = Date.now();
  const res = await fetch(`${api}/analyze/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: chunk }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  results.push(...json.results);
  console.log(
    `chunk ${Math.floor(i / CHUNK) + 1}: ${chunk.length} images in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}
console.log(
  JSON.stringify(
    { ok: results.length === items.length, images: results.length, seconds: (Date.now() - started) / 1000 },
    null,
    2,
  ),
);
