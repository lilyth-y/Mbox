#!/usr/bin/env node
/**
 * Live E2E: rapid shape changes must not accumulate jewel meshes (GPU leak).
 *   npm run verify:showcase-shape-cycle
 *
 * Requires dev server: npm run dev
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { WEB_URL } from "./lib/dev-ports.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const testImage = join(root, "data/showcase-qa-corpus/qa_005_portrait.jpg");

const useSwiftShader =
  process.env.MBOX_USE_SWIFTSHADER !== "0" && process.env.MBOX_USE_SWIFTSHADER !== "false";

const SHAPE_LABELS = ["큐브", "하트", "구(볼)", "육각 프리즘", "보석 프리즘", "직육면체(세로)"];

function targetUrl() {
  const base = process.env.MBOX_SHOWCASE_URL ?? `${WEB_URL}/showcase.html`;
  const url = new URL(base);
  url.searchParams.set("localOnly", "1");
  url.searchParams.set("fullGpu", "1");
  url.searchParams.set("companionTarget", "1");
  url.searchParams.set("noPhysics", "1");
  url.searchParams.set("shape", "cube");
  url.searchParams.set("look", "rose_gold_premium");
  url.searchParams.set("bg", "solid_black");
  return url.toString();
}

async function waitForDevServer() {
  const probe = process.env.MBOX_SHOWCASE_URL ?? `${WEB_URL}/showcase.html`;
  const res = await fetch(probe, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    throw new Error(`dev server not ready: ${res.status}`);
  }
}

async function waitForMeshAudit(page, timeoutMs = 120_000) {
  await page.waitForFunction(
    () => typeof window.__MBOX_SHOWCASE_MESH_AUDIT__ === "function",
    undefined,
    { timeout: timeoutMs }
  );
  await page.waitForFunction(
    () => {
      const audit = window.__MBOX_SHOWCASE_MESH_AUDIT__?.();
      return (
        audit?.pass === true &&
        audit.counts.colliders === 1 &&
        audit.counts.jewelMeshes > 0
      );
    },
    undefined,
    { timeout: timeoutMs, polling: 400 }
  );
  return page.evaluate(() => window.__MBOX_SHOWCASE_MESH_AUDIT__?.());
}

async function main() {
  if (!existsSync(testImage)) {
    throw new Error(`missing test image: ${testImage}`);
  }

  await waitForDevServer();

  const browser = await chromium.launch({
    headless: process.env.MBOX_HEADED !== "1",
    args: [
      ...(useSwiftShader
        ? ["--use-gl=swiftshader", "--enable-webgl"]
        : ["--use-gl=angle", "--ignore-gpu-blocklist", "--enable-webgl"]),
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });

  const context = await browser.newContext({ viewport: { width: 1080, height: 1080 } });
  await context.addInitScript(() => {
    window.__MBOX_SHOWCASE_E2E__ = true;
  });
  const page = await context.newPage();

  try {
    const url = targetUrl();
    console.log(`Shape cycle: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

    const upload = page.locator('[data-testid="showcase-photo-upload"]');
    await upload.waitFor({ state: "attached", timeout: 30_000 });
    await upload.setInputFiles([testImage]);

    let audit = await waitForMeshAudit(page);
    console.log(
      `✓ initial spawn colliders=${audit?.counts?.colliders} shells=${audit?.counts?.shells}`
    );

    for (const label of SHAPE_LABELS) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.waitForTimeout(600);
      audit = await waitForMeshAudit(page);
      if (!audit?.pass) {
        const detail = audit?.checks?.map((c) => `${c.id}=${c.pass}`).join(", ");
        throw new Error(`mesh leak after ${label}: ${detail}`);
      }
      console.log(
        `✓ ${label} colliders=${audit.counts.colliders} jewelMeshes=${audit.counts.jewelMeshes}`
      );
    }

    if ((audit?.counts?.colliders ?? 0) > 1) {
      throw new Error(`final collider count=${audit?.counts?.colliders}`);
    }

    console.log("\nverify-showcase-shape-cycle: OK");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error("FAIL:", error instanceof Error ? error.message : error);
  process.exit(1);
});
