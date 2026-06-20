#!/usr/bin/env node
/**
 * Verify or download default cube BGM (Mixkit — commercial use).
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { COMMERCIAL_BGM_CATALOG } from "./download-commercial-bgm.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bgmDir = join(root, "apps", "web", "public", "bgm");

const missing = COMMERCIAL_BGM_CATALOG.filter((entry) => !existsSync(join(bgmDir, entry.file)));

console.log("Cube BGM setup\n");
console.log(`Target: ${bgmDir}\n`);

for (const entry of COMMERCIAL_BGM_CATALOG) {
  const path = join(bgmDir, entry.file);
  console.log(`  ${existsSync(path) ? "[OK]" : "[MISSING]"} ${entry.file} — ${entry.title}`);
}

if (missing.length > 0) {
  console.log(`\n${missing.length} file(s) missing — running download:commercial-bgm…\n`);
  const result = spawnSync("node", ["scripts/download-commercial-bgm.mjs"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(result.status ?? 1);
}

console.log("\nAll BGM present. License: apps/web/public/bgm/LICENSE.md");
