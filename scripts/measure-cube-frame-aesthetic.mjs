/**
 * FQI (Frame Quality Index) — Tier 1 synthetic + Tier 2 WebGL lab + optional Tier 3 capture.
 *
 *   npx tsx scripts/measure-cube-frame-aesthetic.mjs
 *   npx tsx scripts/measure-cube-frame-aesthetic.mjs --gate
 *   npx tsx scripts/measure-cube-frame-aesthetic.mjs --capture
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  CUBE_FRAME_PRESET_IDS,
  DEFAULT_FRAME_AESTHETIC_THRESHOLDS,
  measureFrameAesthetic,
  passesFrameAestheticGate,
  synthesizeBrokenFrameBuffer,
  synthesizeReferenceFrameBuffer,
} from "@mbox/shared";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "cube_frame_aesthetic");
const shotsDir = join(outDir, "lab_renders");
const thresholdsPath = join(root, "experiments", "cube-frame-aesthetic", "thresholds.json");

const GATE = process.argv.includes("--gate");
const CAPTURE = process.argv.includes("--capture");
const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173";
const SKIP_WEBGL = process.env.SKIP_FQI_WEBGL === "1";

mkdirSync(shotsDir, { recursive: true });

const thresholdsDoc = JSON.parse(readFileSync(thresholdsPath, "utf8"));
const thresholds = thresholdsDoc.thresholds;
const tier1Synthetic = thresholdsDoc.tier1Synthetic ?? {
  referenceFqiMin: 0.8,
  brokenFqiMax: 0.55,
};

const analysis = {
  generatedAt: new Date().toISOString(),
  metric: "FQI",
  thresholds,
  tier1: { presets: [], broken: null, pass: false },
  tier2: { presets: [], pass: false, skipped: false },
  tier3: { presets: [], pass: false, skipped: true },
  overallPass: false,
};

function buildLabHtml() {
  const photoFrameGlsl = readFileSync(
    join(root, "apps/web/src/features/cube/photoFrameGlsl.ts"),
    "utf8"
  );
  const glslMatch = photoFrameGlsl.match(
    /export const PHOTO_FRAME_GLSL = `([\s\S]*?)`;/m
  );
  if (!glslMatch) {
    throw new Error("PHOTO_FRAME_GLSL block not found");
  }
  const photoFrameBody = glslMatch[1];

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script type="importmap">
{"imports":{"three":"https://unpkg.com/three@0.170.0/build/three.module.js"}}
</script>
<script type="module">
import * as THREE from "three";

const PRESETS = ${JSON.stringify(CUBE_FRAME_PRESET_IDS)};
const PHOTO_FRAME_GLSL = \`${photoFrameBody.replace(/`/g, "\\`")}\`;

function makePhotoTexture(size) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = 70 + (x / size) * 150;
      data[i + 1] = 50 + (y / size) * 130;
      data[i + 2] = 90 + (1 - x / size) * 90;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

const vertexShader = \`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}\`;

const fragmentShader = \`
uniform sampler2D uTexture;
uniform float uFramePreset;
uniform float uHologramMode;
uniform float uGradientShift;
uniform float uGradientEnabled;
varying vec2 vUv;
\${PHOTO_FRAME_GLSL}
void main() {
  vec4 tex = texture2D(uTexture, vUv);
  vec4 framed = applyPhotoFrame(tex, vUv, uFramePreset, uHologramMode);
  gl_FragColor = framed;
}\`;

const presetIndex = { rose_gold: 0, pearl_white: 1, classic_black: 2, sage_garden: 3, royal_navy: 4 };

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(512, 512, false);
const rt = new THREE.WebGLRenderTarget(512, 512);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c1418);
const camera = new THREE.OrthographicCamera(-0.72, 0.72, 0.72, -0.72, 0.1, 10);
camera.position.z = 2;

const photoTex = makePhotoTexture(512);
const geo = new THREE.PlaneGeometry(1.44, 1.44);

function readRenderPixels() {
  const pixels = new Uint8Array(512 * 512 * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, 512, 512, pixels);
  const out = new Uint8Array(pixels.length);
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 1) {
      const src = ((511 - y) * 512 + x) * 4;
      const dst = (y * 512 + x) * 4;
      out[dst] = pixels[src];
      out[dst + 1] = pixels[src + 1];
      out[dst + 2] = pixels[src + 2];
      out[dst + 3] = pixels[src + 3];
    }
  }
  return out;
}

window.__renderFqiLab = async () => {
  const outputs = [];
  for (const id of PRESETS) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: photoTex },
        uFramePreset: { value: presetIndex[id] },
        uHologramMode: { value: 1.0 },
        uGradientShift: { value: 0 },
        uGradientEnabled: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    while (scene.children.length > 0) {
      scene.remove(scene.children[0]);
    }
    scene.add(mesh);
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const data = readRenderPixels();
    outputs.push({ presetId: id, width: 512, height: 512, data: Array.from(data) });
    mat.dispose();
  }
  photoTex.dispose();
  geo.dispose();
  rt.dispose();
  renderer.dispose();
  return outputs;
};
</script>
</body></html>`;
}

async function runTier2WebGlLab() {
  if (SKIP_WEBGL) {
    analysis.tier2.skipped = true;
    return;
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(buildLabHtml(), { waitUntil: "load" });
    await page.waitForFunction(() => typeof window.__renderFqiLab === "function", undefined, {
      timeout: 30_000,
    });

    const buffers = await page.evaluate(async () => window.__renderFqiLab());

    for (const buf of buffers) {
      const sample = measureFrameAesthetic(
        {
          width: buf.width,
          height: buf.height,
          data: new Uint8ClampedArray(buf.data),
          faceRect: { x: 0, y: 0, size: buf.width },
        },
        buf.presetId
      );
      const gate = passesFrameAestheticGate(sample, thresholds);
      analysis.tier2.presets.push({ presetId: buf.presetId, sample, gate });
      console.log(
        `[tier2] ${buf.presetId} FQI=${sample.fqi.toFixed(3)} ${gate.pass ? "PASS" : "FAIL"}`
      );
      if (!gate.pass) {
        console.log(`         ${gate.reasons.join("; ")}`);
      }
    }
    analysis.tier2.pass =
      analysis.tier2.presets.length === CUBE_FRAME_PRESET_IDS.length &&
      analysis.tier2.presets.every((entry) => entry.gate.pass);
  } finally {
    await browser.close();
  }
}

async function runTier3Capture() {
  analysis.tier3.skipped = false;
  analysis.tier3.note =
    "Tier 3 full upload flow not automated yet — use verify:cube-frames screenshots for manual FQI pass";
  analysis.tier3.skipped = true;
}

function runTier1Synthetic() {
  for (const presetId of CUBE_FRAME_PRESET_IDS) {
    const buffer = synthesizeReferenceFrameBuffer(presetId, 512);
    const sample = measureFrameAesthetic(buffer, presetId);
    const gate = passesFrameAestheticGate(sample, thresholds);
    analysis.tier1.presets.push({ presetId, sample, gate });
    console.log(
      `[tier1] ${presetId} FQI=${sample.fqi.toFixed(3)} ${gate.pass ? "PASS" : "FAIL"}`
    );
  }
  const brokenSample = measureFrameAesthetic(synthesizeBrokenFrameBuffer(512), "rose_gold");
  analysis.tier1.broken = brokenSample;
  const refMin = Math.min(...analysis.tier1.presets.map((p) => p.sample.fqi));
  analysis.tier1.pass =
    analysis.tier1.presets.every((p) => p.gate.pass) &&
    brokenSample.fqi <= tier1Synthetic.brokenFqiMax &&
    refMin >= tier1Synthetic.referenceFqiMin;
  console.log(`[tier1] broken FQI=${brokenSample.fqi.toFixed(3)}`);
}

function writeReportTex() {
  const lines = [
    "\\section{Cube Frame Aesthetic (FQI)}",
    `Generated: ${analysis.generatedAt}\\\\`,
    "\\subsection{Tier 1 — Synthetic calibration}",
  ];
  for (const row of analysis.tier1.presets) {
    lines.push(
      `${row.presetId}: FQI=${row.sample.fqi.toFixed(3)} (${
        row.gate.pass ? "PASS" : "FAIL"
      })\\\\`
    );
  }
  lines.push(
    `Broken counterexample FQI=${analysis.tier1.broken?.fqi.toFixed(3) ?? "n/a"}\\\\`,
    `Tier 1 overall: ${analysis.tier1.pass ? "PASS" : "FAIL"}\\\\`,
    "\\subsection{Tier 2 — WebGL shader lab}",
  );
  if (analysis.tier2.skipped) {
    lines.push("Skipped\\\\");
  } else {
    for (const row of analysis.tier2.presets) {
      lines.push(
        `${row.presetId}: FQI=${row.sample.fqi.toFixed(3)} (${
          row.gate.pass ? "PASS" : "FAIL"
        })\\\\`
      );
    }
    lines.push(`Tier 2 overall: ${analysis.tier2.pass ? "PASS" : "FAIL"}\\\\`);
  }
  lines.push(`Overall: ${analysis.overallPass ? "PASS" : "FAIL"}`);
  writeFileSync(join(outDir, "report.tex"), lines.join("\n"));
}

async function main() {
  console.log("measure-cube-frame-aesthetic: start");
  runTier1Synthetic();
  await runTier2WebGlLab();
  if (CAPTURE) {
    await runTier3Capture();
  }

  analysis.overallPass =
    analysis.tier1.pass && (analysis.tier2.skipped || analysis.tier2.pass);

  writeFileSync(join(outDir, "analysis.json"), JSON.stringify(analysis, null, 2));
  writeReportTex();

  console.log(`\nOverall: ${analysis.overallPass ? "PASS" : "FAIL"}`);
  console.log(`Output: ${outDir}`);

  if (GATE && !analysis.overallPass) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
