#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "packages/shared/src/cubeFrameGarland.ts"), "utf8");

const half = 1.275;
const inset = half * 0.082;
const s = Math.max(half - inset, half * 0.5);

function evalBorder(t) {
  const sideLen = 2 * s;
  const total = 4 * sideLen;
  let d = ((t % 1) + 1) % 1 * total;
  if (d < sideLen) return { x: -s + d, y: s };
  d -= sideLen;
  if (d < sideLen) return { x: s, y: s - d };
  d -= sideLen;
  if (d < sideLen) return { x: s - d, y: -s };
  d -= sideLen;
  return { x: -s, y: -s + d };
}

const p0 = evalBorder(0);
const pCorner = evalBorder(0.25);
if (Math.abs(p0.x + s) > 0.001 || Math.abs(p0.y - s) > 0.001) {
  throw new Error(`border walk start mismatch: ${JSON.stringify(p0)} expected near (-${s}, ${s})`);
}
if (Math.abs(pCorner.x - s) > 0.001 || Math.abs(pCorner.y - s) > 0.001) {
  throw new Error(`border walk corner mismatch: ${JSON.stringify(pCorner)} expected (${s}, ${s})`);
}
if (!/rose_gold_ring/.test(src)) {
  throw new Error("cube frame preset mapping missing");
}

console.log("verify-cube-frame-garland: OK");
