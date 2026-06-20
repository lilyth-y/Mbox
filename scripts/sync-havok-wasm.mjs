#!/usr/bin/env node
/**
 * Copy HavokPhysics.wasm next to public assets (Vite dev cannot resolve package subpath ?url).
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm");
const destDir = join(root, "apps/web/public/havok");
const dest = join(destDir, "HavokPhysics.wasm");

if (!existsSync(src)) {
  console.error(`sync-havok-wasm: missing source ${src} — run npm install @babylonjs/havok`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
cpSync(src, dest);
console.log(`sync-havok-wasm: copied → ${dest}`);
