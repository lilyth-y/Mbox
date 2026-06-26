#!/usr/bin/env node
/**
 * Copy luxury MP4s from E:\MBOX\럭셔리원본11 (or MBOX_LUXURY_SOURCE) → data/background/luxury/
 *
 *   npm run sync:luxury
 *   MBOX_LUXURY_SOURCE=D:\videos npm run sync:luxury
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(root, "data", "background", "luxury");
const defaultSource = "E:\\MBOX\\럭셔리원본11";
const source = (process.env.MBOX_LUXURY_SOURCE ?? defaultSource).trim();
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

if (!existsSync(source)) {
  console.error(`[sync:luxury] source not found: ${source}`);
  console.error("Mount E: drive or set MBOX_LUXURY_SOURCE to the folder containing 럭셔리13.mp4");
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });

const files = readdirSync(source).filter((name) => VIDEO_EXT.test(name));
if (files.length === 0) {
  console.error(`[sync:luxury] no video files in ${source}`);
  process.exit(1);
}

let copied = 0;
let bytes = 0;
for (const file of files) {
  const src = join(source, file);
  const dest = join(destDir, file);
  cpSync(src, dest);
  const size = statSync(dest).size;
  copied += 1;
  bytes += size;
  console.log(`  ${file} (${(size / 1024 / 1024).toFixed(1)} MiB)`);
}

console.log(`[sync:luxury] ${copied} files → ${destDir} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);

const required = join(destDir, "럭셔리13.mp4");
if (!existsSync(required)) {
  console.warn("[sync:luxury] WARN: 럭셔리13.mp4 not in source folder");
} else {
  console.log("[sync:luxury] OK: 럭셔리13.mp4 ready for /backgrounds/luxury/");
}
