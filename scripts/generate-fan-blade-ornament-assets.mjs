#!/usr/bin/env node
/**
 * Generate fan-blade ornament PNGs with Nano Banana Pro (gemini-3-pro-image).
 *
 * Requires: GOOGLE_CLOUD_PROJECT + ADC (gcloud auth application-default login)
 *
 *   node scripts/generate-fan-blade-ornament-assets.mjs
 *   ORNAMENT_IMAGE_MODEL=gemini-2.5-flash-image node scripts/generate-fan-blade-ornament-assets.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleAuth } from "google-auth-library";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps/web/public/assets/fan-blade-ornaments");
const mirrorDir = join(root, "wedding-simple/assets/fan-blade-ornaments");

const MODEL = process.env.ORNAMENT_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";
const LOCATION = process.env.ORNAMENT_VERTEX_LOCATION?.trim() || "us-central1";

const PROMPTS = {
  rose: "Extreme close-up of a single blush pink wedding rose flower head only, petals filling the frame, no stem no leaves no shadow no vase, photorealistic, isolated on fully transparent background, no text, centered, square canvas",
  pearl: "Single lustrous white wedding pearl with soft iridescent highlight, 3D jewelry render, isolated on fully transparent background, gentle shadow beneath, no text, centered, square canvas",
  leaf: "Pair of elegant sage green eucalyptus wedding leaves, botanical illustration with soft 3D volume, isolated on fully transparent background, subtle shadow, no text, centered, square canvas",
  filigree: "Ornate antique gold filigree wedding ornament curl, baroque luxury metal scroll, 3D render with specular highlights, isolated on fully transparent background, no text, centered, square canvas",
  star: "Small refined gold six-point wedding star charm with soft glow, 3D jewelry render, isolated on fully transparent background, no text, centered, square canvas",
  sparkle: "Delicate gold diamond sparkle burst, four-point star lens flare, wedding luxury accent, isolated on fully transparent background, no text, centered, square canvas",
};

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

function resolveProject() {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error("GOOGLE_CLOUD_PROJECT is not set.");
  }
  return project;
}

async function getAccessTokenString() {
  const raw = await auth.getAccessToken();
  const accessToken = typeof raw === "string" ? raw : raw?.token;
  if (!accessToken) {
    throw new Error("Vertex ADC token unavailable.");
  }
  return accessToken;
}

async function generateOrnament(kind, prompt) {
  const project = resolveProject();
  const accessToken = await getAccessTokenString();

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${project}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vertex ${MODEL} failed (${response.status}): ${body.slice(0, 400)}`);
  }

  const json = await response.json();
  const inlineData = json.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
  if (!inlineData?.data) {
    throw new Error(`No image in response for ${kind}`);
  }

  const ext = inlineData.mimeType?.includes("jpeg") ? "jpg" : "png";
  return { base64: inlineData.data, ext };
}

mkdirSync(outDir, { recursive: true });
mkdirSync(mirrorDir, { recursive: true });

const results = [];

for (const [kind, prompt] of Object.entries(PROMPTS)) {
  process.stdout.write(`Generating ${kind} via ${MODEL}… `);
  try {
    const { base64, ext } = await generateOrnament(kind, prompt);
    const filename = `${kind}.${ext}`;
    const buffer = Buffer.from(base64, "base64");
    writeFileSync(join(outDir, filename), buffer);
    if (ext === "png") {
      writeFileSync(join(mirrorDir, filename), buffer);
    }
    results.push({ kind, ok: true, bytes: buffer.length, file: filename });
    console.log(`OK (${buffer.length} bytes)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ kind, ok: false, error: message });
    console.log(`FAIL — ${message}`);
  }
}

const okCount = results.filter((entry) => entry.ok).length;
if (okCount > 0) {
  console.log("Matting backgrounds (transparent cutout)…");
  const matte = spawnSync("python", [join(root, "scripts/matte-fan-blade-ornaments.py")], {
    stdio: "inherit",
  });
  if (matte.status !== 0) {
    process.exit(matte.status ?? 1);
  }
}
console.log(JSON.stringify({ model: MODEL, location: LOCATION, outDir, okCount, results }, null, 2));
process.exit(okCount === results.length ? 0 : 1);
