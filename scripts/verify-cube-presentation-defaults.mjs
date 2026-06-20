#!/usr/bin/env node
/**
 * Smoke: wedding-simple loads shared defaults (all opt-in OFF) and cube-config is present.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_URL = process.env.WEB_URL ?? "http://localhost:5173/wedding-simple/index.html";

const configSrc = readFileSync(
  join(root, "apps/web/public/wedding-simple/cube-config.js"),
  "utf8"
);
const sharedSrc = readFileSync(
  join(root, "packages/shared/src/cubePresentationDefaults.ts"),
  "utf8"
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(/["']?hologramMode["']?\s*:\s*false/.test(configSrc), "cube-config hologramMode should be false");
assert(/["']?voluMaxDepthEnabled["']?\s*:\s*false/.test(configSrc), "cube-config voluMaxDepthEnabled false");
assert(/hologramMode:\s*false/.test(sharedSrc), "shared defaults hologramMode false");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(WEB_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });

const loaded = await page.evaluate(() => {
  const d = window.MBOX_CUBE_PRESENTATION_DEFAULTS;
  return d
    ? {
        hologramMode: d.hologramMode,
        voluMaxDepthEnabled: d.voluMaxDepthEnabled,
        voluMaxAutoPrepareLayers: d.voluMaxAutoPrepareLayers,
        particleTheme: d.particleTheme,
        bgmTrackId: d.bgmTrackId,
      }
    : null;
});
assert(loaded, "MBOX_CUBE_PRESENTATION_DEFAULTS missing on page");
assert(loaded.hologramMode === false, `hologramMode expected false, got ${loaded.hologramMode}`);
assert(loaded.voluMaxDepthEnabled === false, `voluMaxDepth expected false`);
assert(loaded.voluMaxAutoPrepareLayers === false, `voluMaxAuto expected false`);
assert(loaded.particleTheme === "none", `particleTheme expected none`);
assert(loaded.bgmTrackId === "none", `bgmTrackId expected none`);

const ui = await page.evaluate(() => ({
  depth: document.querySelector(".volumax-depth-cb")?.checked,
  ai: document.querySelector(".volumax-ai-cb")?.checked,
  auto: document.querySelector(".volumax-auto-cb")?.checked,
  particleNone: document.querySelector('[data-particle="none"]')?.classList.contains("active"),
  bgmNone: document.querySelector('[data-bgm="none"]')?.classList.contains("active"),
}));
assert(ui.depth === false, "depth checkbox should be unchecked");
assert(ui.ai === true, "ai checkbox should default on for VoluMax cutout");
assert(ui.auto === false, "auto checkbox unchecked");
assert(ui.particleNone === true, "particle none should be active");
assert(ui.bgmNone === true, "bgm none should be active");

await browser.close();
console.log("verify-cube-presentation-defaults: OK", loaded);
