#!/usr/bin/env node
/**
 * Copy cs5 reference media into apps/web/public/cs5 for runtime loading.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cs5 = path.join(root, "cs5");
const pub = path.join(root, "apps", "web", "public", "cs5");

const volumax = path.join(
  cs5,
  "videohive-JsD5kW1J-volumax-3d-photo-animator",
  "VoluMax 7 - 3D Photo Animator",
  "Assets",
  "Images"
);
const boxLogo = path.join(
  cs5,
  "videohive-9P3ssaeY-3d-box-logo",
  "01_3D_Box_Logo_Reveal",
  "(Footage)",
  "3D Box Logo",
  "02_Scene_elements"
);
const confettiSrc = path.join(cs5, "videohive-hksrtRgC-15-confetti-pack");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copy(src, dst) {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  const size = fs.statSync(dst).size;
  console.log(`copied ${path.relative(root, src)} -> ${path.relative(root, dst)} (${size})`);
}

ensureDir(pub);

// Box logo
for (const name of ["Lens_bg.png", "black_bars.png", "media.png", "small_text.png"]) {
  copy(path.join(boxLogo, name), path.join(pub, "box-logo", name));
}

// VoluMax flares
for (const name of ["FLARE.png", "FLARE1.png", "FLARE2.png", "FLARE3.png", "FLARE4.png", "FLARE5.png"]) {
  copy(path.join(volumax, "Flares", name), path.join(pub, "volumax", "flares", name));
}

// VoluMax clouds
for (let i = 1; i <= 8; i += 1) {
  const name = `Clouds_${String(i).padStart(2, "0")}.png`;
  copy(path.join(volumax, "Clouds", name), path.join(pub, "volumax", "clouds", name));
}

// VoluMax dust & dirt
for (const name of ["DIRT.png", "Particles1.png", "Particles2.png", "Particles3.png"]) {
  copy(path.join(volumax, "Dust&Dirt", name), path.join(pub, "volumax", "dust-dirt", name));
}

// Confetti pack (1–5 for UI variants)
for (let i = 1; i <= 5; i += 1) {
  copy(
    path.join(confettiSrc, `${i}.mov`),
    path.join(pub, "confetti-pack", `confetti_${String(i).padStart(2, "0")}.mov`)
  );
}

console.log("cs5 public sync complete");
