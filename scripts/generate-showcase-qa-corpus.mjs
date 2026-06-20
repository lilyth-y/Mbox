#!/usr/bin/env node
/**
 * Tier-2 corpus for commercial photo-batch KPI (100 varied synthetic portraits).
 * Uses ffmpeg lavfi — same toolchain as export KPI scripts.
 *
 *   npm run generate:showcase-qa-corpus
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "data/showcase-qa-corpus");
const TARGET = 100;

const profiles = [
  { w: 768, h: 1024, tag: "portrait" },
  { w: 1024, h: 768, tag: "landscape" },
  { w: 768, h: 768, tag: "square" },
  { w: 600, h: 1200, tag: "tall" },
  { w: 1200, h: 600, tag: "wide" },
];

function ffmpegOk() {
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return r.status === 0;
}

if (!ffmpegOk()) {
  console.error("ffmpeg required for corpus generation");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const manifest = [];

for (let i = 1; i <= TARGET; i += 1) {
  const profile = profiles[i % profiles.length];
  const hex = ((i * 9973) % 0xffffff).toString(16).padStart(6, "0");
  const filename = `qa_${String(i).padStart(3, "0")}_${profile.tag}.jpg`;
  const outPath = join(outDir, filename);

  const filter = `color=c=0x${hex}:s=${profile.w}x${profile.h}:d=1`;
  const args = ["-y", "-f", "lavfi", "-i", filter, "-frames:v", "1", "-q:v", "2", outPath];

  const r = spawnSync("ffmpeg", args, { encoding: "utf8", stdio: "pipe" });
  if (r.status !== 0) {
    console.error(`ffmpeg failed for ${filename}:`, r.stderr?.slice(-400));
    process.exit(1);
  }

  manifest.push({
    id: i,
    file: filename,
    aspect: profile.tag,
    width: profile.w,
    height: profile.h,
  });

  if (i % 20 === 0) {
    console.log(`Generated ${i}/${TARGET}`);
  }
}

writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify(
    {
      version: 1,
      count: TARGET,
      purpose: "commercial_launch photo_batch_100 KPI corpus",
      profiles,
      images: manifest,
    },
    null,
    2
  )
);

console.log(`Corpus ready: ${outDir} (${TARGET} images)`);
