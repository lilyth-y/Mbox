#!/usr/bin/env node
/**
 * Per-shape best-shot acceptance — static geometry + optional live pull-hold render.
 *
 *   node scripts/verify-showcase-shapes.mjs
 *   node scripts/verify-showcase-shapes.mjs --live
 *   node scripts/verify-showcase-shapes.mjs --json
 *
 * Env:
 *   MBOX_SHOWCASE_URL — default http://127.0.0.1:5173/showcase.html
 *   MBOX_SHAPE_LIVE_TIMEOUT_MS — per-shape wait (default 22000)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = join(root, "experiments/showcase-commercial-goals");
const latestPath = join(reportDir, "shapes-latest.json");

const runLive = process.argv.includes("--live");
const jsonOut = process.argv.includes("--json");

const SHAPE_IDS = ["cube", "tall_rect", "hex_prism", "heart", "sphere", "gem_prism"];

function runStaticTier() {
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/verify-showcase-shapes-static.ts"],
    { cwd: root, encoding: "utf8", timeout: 120_000 }
  );
  if (child.stdout) {
    console.log(child.stdout.trimEnd());
  }
  if (child.status !== 0) {
    if (child.stderr) {
      console.error(child.stderr.trimEnd());
    }
    return { ok: false, perShape: SHAPE_IDS.map((id) => ({ shapeId: id, staticPassed: false })) };
  }

  return {
    ok: true,
    perShape: SHAPE_IDS.map((shapeId) => ({ shapeId, staticPassed: true })),
  };
}

function buildShowcaseUrl(shapeId) {
  const base =
    process.env.MBOX_SHOWCASE_URL ?? "http://localhost:5173/showcase.html";
  const url = new URL(base);
  url.searchParams.set("shape", shapeId);
  url.searchParams.set("look", "rose_gold_premium");
  url.searchParams.set("bg", "solid_black");
  url.searchParams.delete("backdrop");
  return url.toString();
}

async function runLiveTier(staticByShape) {
  const timeoutMs = Number(process.env.MBOX_SHAPE_LIVE_TIMEOUT_MS ?? 22_000);
  const browser = await chromium.launch({
    headless: process.env.MBOX_HEADED !== "1",
    args: [
      "--use-gl=angle",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });

  const perShape = [];
  const consoleErrors = [];

  try {
    for (const shapeId of SHAPE_IDS) {
      const context = await browser.newContext({ viewport: { width: 1080, height: 1080 } });
      await context.addInitScript(() => {
        window.__MBOX_SHOWCASE_E2E__ = true;
      });

      const page = await context.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(`[${shapeId}] ${msg.text()}`);
        }
      });
      page.on("pageerror", (err) => {
        consoleErrors.push(`[${shapeId}] ${String(err)}`);
      });

      const url = buildShowcaseUrl(shapeId);
      console.log(`\nLive ${shapeId}: ${url}`);

      let livePassed = false;
      let audit = null;
      let error = null;

      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        if (!response?.ok()) {
          throw new Error(`load failed: ${response?.status()}`);
        }

        await page.waitForFunction(
          () => typeof window.__MBOX_SHOWCASE_SHAPE_AUDIT__ === "function",
          undefined,
          { timeout: 120_000 }
        );

        await page.waitForFunction(
          () => {
            const auditFn = window.__MBOX_SHOWCASE_SHAPE_AUDIT__;
            if (!auditFn) {
              return false;
            }
            const result = auditFn();
            return result?.checks?.some((c) => c.id === "live:pull_hold_phase" && c.pass);
          },
          undefined,
          { timeout: timeoutMs, polling: 400 }
        );

        audit = await page.evaluate(() => window.__MBOX_SHOWCASE_SHAPE_AUDIT__?.());
        livePassed = audit?.passed === true;
      } catch (err) {
        error = String(err);
        try {
          audit = await page.evaluate(() => window.__MBOX_SHOWCASE_SHAPE_AUDIT__?.());
        } catch {
          /* ignore */
        }
      }

      const staticPassed = staticByShape.get(shapeId) ?? false;
      const passed = staticPassed && livePassed;

      console.log(
        `${passed ? "PASS" : "FAIL"} ${shapeId} static=${staticPassed} live=${livePassed}${
          error ? ` err=${error.slice(0, 120)}` : ""
        }`
      );

      if (audit && !passed) {
        const failed = audit.checks?.filter((c) => !c.pass).map((c) => c.id) ?? [];
        if (failed.length) {
          console.log(`  failed checks: ${failed.join(", ")}`);
        }
      }

      perShape.push({
        shapeId,
        staticPassed,
        livePassed,
        passed,
        audit,
        error,
      });

      await context.close();
    }
  } finally {
    await browser.close();
  }

  return { perShape, consoleErrors };
}

const staticTier = runStaticTier();
const staticByShape = new Map(
  staticTier.perShape.map((entry) => [entry.shapeId, entry.staticPassed])
);

let liveResult = null;
if (runLive) {
  console.log("\n--- live pull-hold acceptance ---");
  liveResult = await runLiveTier(staticByShape);
}

const perShape = SHAPE_IDS.map((shapeId) => {
  const staticPassed = staticByShape.get(shapeId) ?? false;
  const liveEntry = liveResult?.perShape.find((p) => p.shapeId === shapeId);
  const livePassed = runLive ? liveEntry?.livePassed === true : null;
  const passed = runLive ? staticPassed && livePassed : staticPassed;
  return {
    shapeId,
    staticPassed,
    livePassed,
    passed,
    audit: liveEntry?.audit ?? null,
    error: liveEntry?.error ?? null,
  };
});

const validatedCount = perShape.filter((p) => p.passed).length;
const payload = {
  at: new Date().toISOString(),
  mode: runLive ? "static+live" : "static",
  validatedCount,
  gateValidatedCount: runLive ? validatedCount : 0,
  total: SHAPE_IDS.length,
  passRate: validatedCount / SHAPE_IDS.length,
  perShape,
  consoleErrors: liveResult?.consoleErrors ?? [],
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(latestPath, JSON.stringify(payload, null, 2));

if (jsonOut) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`\nshapes acceptance: ${validatedCount}/${SHAPE_IDS.length}`);
  console.log(`Report: ${latestPath}`);
}

process.exit(validatedCount === SHAPE_IDS.length ? 0 : 1);
