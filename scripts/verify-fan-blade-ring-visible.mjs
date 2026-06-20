#!/usr/bin/env node
/**
 * Three.js: camera HUD children only render when camera is added to scene.
 *   node scripts/verify-fan-blade-ring-visible.mjs
 */
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage();

const result = await page.evaluate(async () => {
  const THREE = await import("https://unpkg.com/three@0.174.0/build/three.module.js");

  const w = 256;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(w, h, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#000000");
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  camera.position.z = 5;

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xdfaf86, depthTest: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.04, 8, 64), ringMat);
  const hud = new THREE.Group();
  hud.position.set(0, 0, -1.1);
  hud.add(ring);
  camera.add(hud);

  const sample = (withSceneCamera) => {
    if (withSceneCamera && camera.parent !== scene) scene.add(camera);
    if (!withSceneCamera && camera.parent === scene) scene.remove(camera);
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let max = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      max = Math.max(max, pixels[i] + pixels[i + 1] + pixels[i + 2]);
    }
    return max;
  };

  const withoutScene = sample(false);
  const withScene = sample(true);

  return {
    withoutSceneCamera: withoutScene,
    withSceneCamera: withScene,
    pass: withoutScene < 30 && withScene > 120,
  };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(result.pass ? 0 : 1);
