#!/usr/bin/env node
/**
 * Build @mbox/web for production and sync apps/web/dist → GCS (browser preview hosting).
 *
 *   npm run deploy:web:gcs
 *   npm run deploy:web:gcs -- --backgrounds
 *   npm run deploy:web:gcs -- --bucket mbox-web-newmedia-496107 --dry-run
 *
 * Env: apps/web/.env.production.local (VITE_*), or Cloud Build defaults below.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(root, "apps", "web");
const distRoot = path.join(webRoot, "dist");

const DEFAULT_BUCKET = "mbox-web-newmedia-496107";
const DEFAULT_PROJECT = "newmedia-496107";
const DEFAULT_API = "https://mbox-api-118689443638.asia-northeast3.run.app";

const HTML_PAGES = [
  "index.html",
  "showcase.html",
];

function parseArgs(argv) {
  const out = { bucket: "", project: "", dryRun: false, backgrounds: false, skipBuild: false, ci: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--backgrounds") out.backgrounds = true;
    else if (arg === "--skip-build") out.skipBuild = true;
    else if (arg === "--ci") out.ci = true;
    else if (arg === "--bucket" && argv[i + 1]) out.bucket = argv[++i];
    else if (arg === "--project" && argv[i + 1]) out.project = argv[++i];
  }
  return out;
}

function loadDotEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function run(cmd, args, env = process.env) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const opts = parseArgs(process.argv.slice(2));
const bucket = opts.bucket || process.env.MBOX_WEB_BUCKET || DEFAULT_BUCKET;
const project = opts.project || process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_PROJECT;
const prodEnv = loadDotEnv(path.join(webRoot, ".env.production.local"));

const buildEnv = {
  ...process.env,
  VITE_API_BASE_URL: prodEnv.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || DEFAULT_API,
  VITE_API_KEY: prodEnv.VITE_API_KEY || process.env.VITE_API_KEY || "",
  VITE_WORKSPACE_ID: prodEnv.VITE_WORKSPACE_ID || process.env.VITE_WORKSPACE_ID || "default",
  VITE_USE_SERVER_VAULT: prodEnv.VITE_USE_SERVER_VAULT || process.env.VITE_USE_SERVER_VAULT || "true",
  VITE_RENDER_BACKEND: prodEnv.VITE_RENDER_BACKEND || process.env.VITE_RENDER_BACKEND || "cloud",
  VITE_LOCALHOST_DEMO: prodEnv.VITE_LOCALHOST_DEMO || process.env.VITE_LOCALHOST_DEMO || "false",
  VITE_ENABLE_DEV_ASSET_BATCH:
    prodEnv.VITE_ENABLE_DEV_ASSET_BATCH || process.env.VITE_ENABLE_DEV_ASSET_BATCH || "false",
  VITE_SHOWCASE_LOCAL_ONLY:
    prodEnv.VITE_SHOWCASE_LOCAL_ONLY || process.env.VITE_SHOWCASE_LOCAL_ONLY || "false",
};

console.log("deploy-web-gcs");
console.log(`  bucket:  gs://${bucket}`);
console.log(`  project: ${project}`);
console.log(`  api:     ${buildEnv.VITE_API_BASE_URL}`);
console.log(`  vault:   ${buildEnv.VITE_USE_SERVER_VAULT}`);
console.log(`  render:  ${buildEnv.VITE_RENDER_BACKEND}`);
console.log(`  apiKey:  ${buildEnv.VITE_API_KEY ? "(set)" : "(MISSING — set apps/web/.env.production.local)"}`);

if (!buildEnv.VITE_API_KEY?.trim()) {
  console.error("\nVITE_API_KEY is required for cloud vault + export on hosted preview.");
  process.exit(1);
}

if (!opts.skipBuild) {
  if (opts.ci) {
    run("npm", ["ci"], process.env);
  }
  run("npm", ["run", "build", "--workspace", "@mbox/shared"], buildEnv);
  run("npm", ["run", "build", "--workspace", "@mbox/web"], buildEnv);
}

if (!fs.existsSync(distRoot)) {
  console.error(`Missing ${path.relative(root, distRoot)} — build failed?`);
  process.exit(1);
}

const rsyncArgs = [
  "storage",
  "rsync",
  "--recursive",
  distRoot,
  `gs://${bucket}/`,
  "--project",
  project,
];
if (opts.dryRun) rsyncArgs.push("--dry-run");

console.log(`\nSync dist → gs://${bucket}/`);
run("gcloud", rsyncArgs);

for (const page of HTML_PAGES) {
  const local = path.join(distRoot, page);
  if (!fs.existsSync(local)) continue;
  const cpArgs = [
    "storage",
    "cp",
    local,
    `gs://${bucket}/${page}`,
    "--cache-control=no-cache",
    "--project",
    project,
  ];
  if (opts.dryRun) cpArgs.push("--dry-run");
  const cpResult = spawnSync("gcloud", cpArgs, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (cpResult.status !== 0) {
    process.exit(cpResult.status ?? 1);
  }
}

if (opts.backgrounds) {
  console.log("\nSync backgrounds…");
  run("node", ["scripts/sync-backgrounds-to-gcs.mjs", "--bucket", bucket, "--project", project]);
}

const showcaseUrl = `https://${bucket}.storage.googleapis.com/showcase.html`;
console.log("\nHosted browser preview:");
console.log(`  ${showcaseUrl}`);
console.log(`  https://storage.googleapis.com/${bucket}/showcase.html`);
