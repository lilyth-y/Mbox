#!/usr/bin/env node
/**
 * Prints instructions to install default cube BGM files into apps/web/public/bgm/
 * (Cannot auto-download Pixabay assets without your license acceptance in browser.)
 */
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bgmDir = join(root, "apps", "web", "public", "bgm");

mkdirSync(bgmDir, { recursive: true });

const files = [
  "cinematic-romantic.mp3",
  "piano-slideshow.mp3",
  "romantic-wedding.mp3",
];

console.log("Cube BGM setup\n");
console.log(`Target folder: ${bgmDir}\n`);
for (const file of files) {
  const path = join(bgmDir, file);
  console.log(`  ${existsSync(path) ? "[OK]" : "[MISSING]"} ${file}`);
}
console.log(`
Download MP3s from Pixabay (see apps/web/public/bgm/README.md) and rename to match.
Or use「직접 업로드」in the 3D cube tab.
`);
