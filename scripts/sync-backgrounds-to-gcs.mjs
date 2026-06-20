#!/usr/bin/env node
/**
 * Upload data/background → gs://BUCKET/backgrounds/
 *
 * Use this when backgrounds are too large for git or you want to refresh GCS
 * without a full Cloud Build (e.g. after adding luxury MP4s on E: drive).
 *
 *   npm run sync:backgrounds:gcs
 *   npm run sync:backgrounds:gcs -- --bucket mbox-web-newmedia-496107 --project newmedia-496107
 *   npm run sync:backgrounds:gcs -- --dry-run
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const backgroundsRoot = path.join(root, "data", "background");

function parseArgs(argv) {
  const out = { bucket: "", project: "", dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--bucket" && argv[i + 1]) {
      out.bucket = argv[++i];
    } else if (arg === "--project" && argv[i + 1]) {
      out.project = argv[++i];
    }
  }
  return out;
}

function countMediaFiles(dir) {
  let count = 0;
  let bytes = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        count += 1;
        bytes += fs.statSync(full).size;
      }
    }
  };
  walk(dir);
  return { count, bytes };
}

const { bucket, project, dryRun } = parseArgs(process.argv.slice(2));
const webBucket =
  bucket ||
  process.env.MBOX_WEB_BUCKET ||
  process.env._WEB_BUCKET ||
  "mbox-web-newmedia-496107";
const gcpProject = project || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "newmedia-496107";

if (!fs.existsSync(backgroundsRoot)) {
  console.error(`Missing ${path.relative(root, backgroundsRoot)}`);
  console.error("Place luxury/ MP4s under data/background/ (or mount E: drive) then retry.");
  process.exit(1);
}

const { count, bytes } = countMediaFiles(backgroundsRoot);
const dest = `gs://${webBucket}/backgrounds/`;

console.log(`Source: ${backgroundsRoot}`);
console.log(`Dest:   ${dest}`);
console.log(`Files:  ${count} (${(bytes / 1024 / 1024).toFixed(1)} MiB)`);
console.log(`Project: ${gcpProject}`);

const gcloudArgs = [
  "storage",
  "rsync",
  "--recursive",
  backgroundsRoot,
  dest,
  "--project",
  gcpProject,
];

if (dryRun) {
  gcloudArgs.push("--dry-run");
}

const result = spawnSync("gcloud", gcloudArgs, { stdio: "inherit", shell: process.platform === "win32" });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!dryRun) {
  const sample = `${dest}luxury/0_Background_Black_3840x2160%20(1).mp4`;
  console.log("\nDone. Sample URL:");
  console.log(`  https://storage.googleapis.com/${webBucket}/backgrounds/luxury/0_Background_Black_3840x2160%20(1).mp4`);
  console.log(`  (encoded: ${sample})`);
}
