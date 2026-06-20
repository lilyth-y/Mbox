#!/usr/bin/env node
/**
 * Download built-in cube BGM from Mixkit (Mixkit Free License — commercial use OK).
 * https://mixkit.co/license/#musicFree
 */
import { mkdirSync, createWriteStream, existsSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicBgmDir = join(root, "apps", "web", "public", "bgm");
const userBgmDir = join(root, "data", "user-assets", "bgm");

/** @type {readonly { file: string; mixkitId: number; title: string; artist: string; mixkitPage: string }[]} */
export const COMMERCIAL_BGM_CATALOG = [
  {
    file: "cinematic-romantic.mp3",
    mixkitId: 659,
    title: "Romantic",
    artist: "Francisco Alvear",
    mixkitPage: "https://mixkit.co/free-stock-music/mood/romantic/",
  },
  {
    file: "piano-slideshow.mp3",
    mixkitId: 22,
    title: "Piano Reflections",
    artist: "Ahjay Stelino",
    mixkitPage: "https://mixkit.co/free-stock-music/piano/22/",
  },
  {
    file: "romantic-wedding.mp3",
    mixkitId: 657,
    title: "Wedding 01",
    artist: "Francisco Alvear",
    mixkitPage: "https://mixkit.co/free-stock-music/wedding/657/",
  },
  {
    file: "bridal-chorus.mp3",
    mixkitId: 688,
    title: "Classical vibes 5",
    artist: "Grigoriy Nuzhny",
    mixkitPage: "https://mixkit.co/free-stock-music/classical/688/",
  },
];

function mixkitMp3Url(id) {
  return `https://assets.mixkit.co/music/${id}/${id}.mp3`;
}

async function downloadFile(url, dest) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
  const size = statSync(dest).size;
  if (size < 50_000) {
    throw new Error(`Download too small (${size} bytes): ${dest}`);
  }
}

async function main() {
  mkdirSync(publicBgmDir, { recursive: true });
  mkdirSync(userBgmDir, { recursive: true });

  let failed = 0;
  for (const entry of COMMERCIAL_BGM_CATALOG) {
    const publicPath = join(publicBgmDir, entry.file);
    const userPath = join(userBgmDir, entry.file);
    const url = mixkitMp3Url(entry.mixkitId);
    try {
      if (existsSync(publicPath)) {
        console.log(`[skip exists] ${entry.file}`);
      } else {
        console.log(`[download] ${entry.file} ← Mixkit #${entry.mixkitId} (${entry.title})`);
        await downloadFile(url, publicPath);
      }
      copyFileSync(publicPath, userPath);
      const kb = Math.round(statSync(publicPath).size / 1024);
      console.log(`  OK ${entry.file} (${kb} KB) → public/bgm + user-assets/bgm`);
    } catch (error) {
      failed++;
      console.error(`  FAIL ${entry.file}: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
  console.log("\nAll commercial BGM files ready. See apps/web/public/bgm/LICENSE.md");
}

main();
