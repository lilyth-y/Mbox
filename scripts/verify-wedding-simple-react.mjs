#!/usr/bin/env node
/**
 * Smoke: React wedding-simple MPA entry exists and legacy index redirects.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps/web");

const required = [
  join(web, "wedding-simple.html"),
  join(web, "src/wedding-simple-main.tsx"),
  join(web, "public/wedding-simple/index.html"),
];

let failed = 0;
for (const path of required) {
  if (!existsSync(path)) {
    console.error(`FAIL missing ${path}`);
    failed++;
  }
}

const redirectHtml = readFileSync(join(web, "public/wedding-simple/index.html"), "utf8");
if (!redirectHtml.includes("wedding-simple.html")) {
  console.error("FAIL: public/wedding-simple/index.html should redirect to wedding-simple.html");
  failed++;
}

const mainTsx = readFileSync(join(web, "src/wedding-simple-main.tsx"), "utf8");
if (!mainTsx.includes("WeddingSimpleDashboard")) {
  console.error("FAIL: wedding-simple-main.tsx must mount WeddingSimpleDashboard");
  failed++;
}

const dashboard = readFileSync(
  join(web, "src/features/wedding-simple/WeddingSimpleDashboard.tsx"),
  "utf8"
);
if (!dashboard.includes('id="export-btn"') || !dashboard.includes('id="start-ai-btn"')) {
  console.error("FAIL: WeddingSimpleDashboard missing e2e hook ids");
  failed++;
}
if (!dashboard.includes("MediaSection")) {
  console.error("FAIL: WeddingSimpleDashboard must include MediaSection");
  failed++;
}

if (failed > 0) {
  console.error(`verify-wedding-simple-react: ${failed} failure(s)`);
  process.exit(1);
}
console.log("verify-wedding-simple-react: PASS");
