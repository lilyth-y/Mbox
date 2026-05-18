#!/usr/bin/env node
/** Quick API matte removal smoke test (Seoul-safe, no Vertex image model). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = process.env.API_URL ?? "http://localhost:8787";
const sample = join(root, "data", "asset", "temp_1778692001076.-1818431043", "KakaoTalk_20260505_131306132_01.jpg");

const imageBase64 = readFileSync(sample).toString("base64");

const res = await fetch(`${API_URL}/edit`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    imageBase64,
    label: "test-subject",
    mimeType: "image/jpeg",
    editMode: "remove_background",
    subjectBounds: { x0: 20, y0: 10, x1: 80, y1: 95 },
  }),
});

const text = await res.text();
if (!res.ok) {
  console.error("FAIL", res.status, text.slice(0, 500));
  process.exit(1);
}

const json = JSON.parse(text);
if (!json.imageBase64 || json.imageBase64.length < 1000) {
  console.error("FAIL: empty image response");
  process.exit(1);
}

console.log(`OK matte removal: ${json.mimeType}, ${json.imageBase64.length} base64 chars`);
