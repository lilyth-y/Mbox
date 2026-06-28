#!/usr/bin/env node
/**
 * Sync data/background media for local dev + verify (no gcloud required).
 *
 *   npm run sync:backgrounds:local
 *   npm run sync:backgrounds:local -- --minimal
 *   npm run sync:backgrounds:local -- --stub-only
 *
 * Env:
 *   MBOX_GCS_WEB_BASE — default https://storage.googleapis.com/mbox-web-newmedia-496107
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bgRoot = join(root, "data", "background");
const catalogPath = join(bgRoot, "catalog.json");

const GCS_BASE = (
  process.env.MBOX_GCS_WEB_BASE ?? "https://storage.googleapis.com/mbox-web-newmedia-496107"
).replace(/\/$/, "");

const minimalPaths = [
  "배경동영상/mf001.mp4",
  "배경동영상/mf002.mp4",
  "배경동영상/mf003.mp4",
  "luxury/0_Background_Black_3840x2160 (1).mp4",
  "luxury/럭셔리13.mp4",
];

function parseArgs(argv) {
  return {
    minimal: argv.includes("--minimal"),
    stubOnly: argv.includes("--stub-only"),
    dryRun: argv.includes("--dry-run"),
  };
}

function ffmpegOk() {
  return spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;
}

function catalogPaths() {
  if (!existsSync(catalogPath)) {
    return minimalPaths;
  }
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const paths = [];
  for (const collection of catalog.collections ?? []) {
    for (const item of collection.items ?? []) {
      if (item.kind === "video" || /\.(mp4|webm|mov|m4v)$/i.test(item.file)) {
        paths.push(`${collection.id}/${item.file}`);
      }
    }
  }
  return paths;
}

function gcsUrl(relPath) {
  const encoded = relPath.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${GCS_BASE}/backgrounds/${encoded}`;
}

async function downloadFile(url, destPath, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    mkdirSync(dirname(destPath), { recursive: true });
    const fileStream = createWriteStream(destPath);
    await pipeline(response.body, fileStream);
    return statSync(destPath).size;
  } finally {
    clearTimeout(timer);
  }
}

function stubVideo(destPath, label) {
  if (!ffmpegOk()) {
    throw new Error("ffmpeg required for --stub-only or failed downloads");
  }
  mkdirSync(dirname(destPath), { recursive: true });
  const filter = "color=c=0x141820:s=1080x1080:d=12";
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    filter,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-t",
    "12",
    "-movflags",
    "+faststart",
    destPath,
  ];
  const r = spawnSync("ffmpeg", args, { encoding: "utf8", stdio: "pipe" });
  if (r.status !== 0) {
    throw new Error(r.stderr?.slice(-400) ?? "ffmpeg stub failed");
  }
  console.log(`  stub ${label} (${(statSync(destPath).size / 1024).toFixed(0)} KiB)`);
}

async function syncOne(relPath, { dryRun, stubOnly }) {
  const destPath = join(bgRoot, relPath);
  if (existsSync(destPath) && statSync(destPath).size > 4096) {
    console.log(`  skip ${relPath} (exists)`);
    return { relPath, ok: true, skipped: true };
  }
  if (dryRun) {
    console.log(`  would sync ${relPath}`);
    return { relPath, ok: true, dryRun: true };
  }
  if (!stubOnly) {
    const url = gcsUrl(relPath);
    try {
      const bytes = await downloadFile(url, destPath);
      console.log(`  ok ${relPath} (${(bytes / 1024 / 1024).toFixed(2)} MiB)`);
      return { relPath, ok: true, downloaded: true };
    } catch (error) {
      console.warn(`  download failed ${relPath}: ${error instanceof Error ? error.message : error}`);
    }
  }
  try {
    stubVideo(destPath, relPath);
    return { relPath, ok: true, stubbed: true };
  } catch (error) {
    console.error(`  FAIL ${relPath}:`, error instanceof Error ? error.message : error);
    return { relPath, ok: false, error: String(error) };
  }
}

const { minimal, stubOnly, dryRun } = parseArgs(process.argv.slice(2));
const targets = minimal ? minimalPaths : catalogPaths();

console.log(`sync-backgrounds-local: ${targets.length} video(s)${minimal ? " (minimal)" : ""}`);
mkdirSync(bgRoot, { recursive: true });

const results = [];
for (const relPath of targets) {
  results.push(await syncOne(relPath, { dryRun, stubOnly }));
}

const failed = results.filter((r) => !r.ok);
const synced = results.filter((r) => r.ok && !r.skipped).length;
console.log(`\nDone: ${synced} synced, ${results.filter((r) => r.skipped).length} skipped, ${failed.length} failed`);

if (failed.length) {
  process.exit(1);
}
