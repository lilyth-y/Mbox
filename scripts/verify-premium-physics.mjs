#!/usr/bin/env node
/**
 * Smoke: Premium Babylon.js MPA entry and P0 scene modules exist.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const web = join(root, "apps/web");

const required = [
  join(web, "premium.html"),
  join(web, "src/premium-main.tsx"),
  join(web, "public/premium/index.html"),
  join(web, "src/features/premium/PremiumPhysicsDashboard.tsx"),
  join(web, "src/features/premium/babylon/createPremiumPhysicsScene.ts"),
  join(web, "src/features/premium/babylon/physicsWorld.ts"),
  join(web, "src/features/premium/babylon/photoCubeFactory.ts"),
];

let failed = 0;
for (const path of required) {
  if (!existsSync(path)) {
    console.error(`FAIL missing ${path}`);
    failed++;
  }
}

const redirectHtml = readFileSync(join(web, "public/premium/index.html"), "utf8");
if (!redirectHtml.includes("premium.html")) {
  console.error("FAIL: public/premium/index.html should redirect to premium.html");
  failed++;
}

const mainTsx = readFileSync(join(web, "src/premium-main.tsx"), "utf8");
if (!mainTsx.includes("PremiumPhysicsDashboard")) {
  console.error("FAIL: premium-main.tsx must mount PremiumPhysicsDashboard");
  failed++;
}

const dashboard = readFileSync(
  join(web, "src/features/premium/PremiumPhysicsDashboard.tsx"),
  "utf8"
);
for (const hook of ["premium-canvas", "premium-drop-btn", "premium-demo-btn"]) {
  if (!dashboard.includes(hook)) {
    console.error(`FAIL: PremiumPhysicsDashboard missing ${hook}`);
    failed++;
  }
}

const scene = readFileSync(
  join(web, "src/features/premium/babylon/createPremiumPhysicsScene.ts"),
  "utf8"
);
if (!scene.includes("enableHavokPhysics") || !scene.includes("createPhotoCube")) {
  console.error("FAIL: createPremiumPhysicsScene incomplete");
  failed++;
}

const physicsWorld = readFileSync(
  join(web, "src/features/premium/babylon/physicsWorld.ts"),
  "utf8"
);
if (!physicsWorld.includes("HAVOK_WASM_URL") || !physicsWorld.includes("locateFile")) {
  console.error("FAIL: physicsWorld must set locateFile for Havok WASM");
  failed++;
}
if (!physicsWorld.includes("Physics/physicsEngineComponent")) {
  console.error("FAIL: physicsWorld must side-effect import physicsEngineComponent");
  failed++;
}

const havokWasm = join(web, "public/havok/HavokPhysics.wasm");
if (!existsSync(havokWasm)) {
  console.error(`FAIL: missing ${havokWasm} — run npm run sync:havok-wasm`);
  failed++;
}

const viteConfig = readFileSync(join(web, "vite.config.ts"), "utf8");
if (!viteConfig.includes("premium.html") || !viteConfig.includes("premiumReactEntry")) {
  console.error("FAIL: vite.config.ts missing premium MPA entry");
  failed++;
}
if (!viteConfig.includes('"@babylonjs/havok"')) {
  console.error("FAIL: vite.config.ts must exclude @babylonjs/havok from optimizeDeps");
  failed++;
}

const pkg = JSON.parse(readFileSync(join(web, "package.json"), "utf8"));
if (!pkg.dependencies?.["@babylonjs/core"] || !pkg.dependencies?.["@babylonjs/havok"]) {
  console.error("FAIL: @mbox/web missing Babylon.js dependencies");
  failed++;
}

if (failed > 0) {
  console.error(`verify-premium-physics: ${failed} failure(s)`);
  process.exit(1);
}
console.log("verify-premium-physics: PASS");
