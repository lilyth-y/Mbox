#!/usr/bin/env node
/**
 * Measurable KPIs for composite_rose_cube pipeline (Goal skill).
 * Usage: node scripts/measure-composite-kpi.mjs <video> [--at 65]
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, ".cache");
mkdirSync(cacheDir, { recursive: true });

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { code: r.status ?? 1, stdout: r.stdout.trim(), stderr: r.stderr };
}

export function ffprobeDuration(file) {
  const { code, stdout } = run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ]);
  if (code !== 0) return null;
  return parseFloat(stdout);
}

export function ffprobeWxH(file) {
  const { code, stdout } = run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=p=0:s=x", file,
  ]);
  if (code !== 0) return null;
  const [w, h] = stdout.split("x").map(Number);
  return { width: w, height: h };
}

export function audioMeanDb(file) {
  const { stderr, code } = run("ffmpeg", [
    "-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-",
  ]);
  if (code !== 0) return null;
  const m = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/);
  return m ? parseFloat(m[1]) : null;
}

function regionMeanLuma(file, atSec, cropFilter) {
  const r = spawnSync(
    "ffmpeg",
    [
      "-hide_banner", "-ss", String(atSec), "-i", file,
      "-vf", `${cropFilter},scale=16:16,format=gray`,
      "-frames:v", "1", "-f", "rawvideo", "pipe:1",
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const buf = r.stdout;
  if (!buf?.length) return null;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  return sum / buf.length;
}

export function centerYavg(file, atSec = 5) {
  return regionMeanLuma(file, atSec, "crop=iw*0.3:ih*0.3:(iw-ow)/2:(ih-oh)/2");
}

export function cornerYavg(file, atSec = 5) {
  return regionMeanLuma(file, atSec, "crop=80:80:0:0");
}

/** Left-edge strip ??proxy for visible rose background beside cube. */
export function edgeStripYavg(file, atSec = 5) {
  return regionMeanLuma(file, atSec, "crop=60:ih:0:0");
}

export function frameMd5(file, atSec) {
  const tmp = join(cacheDir, "composite_frame.jpg");
  const r = run("ffmpeg", [
    "-y", "-ss", String(atSec), "-i", file, "-frames:v", "1", "-update", "1", tmp,
  ]);
  if (r.code !== 0 || !existsSync(tmp)) return null;
  return createHash("md5").update(readFileSync(tmp)).digest("hex");
}

function main() {
  const file = process.argv[2];
  const atIdx = process.argv.indexOf("--at");
  const at = atIdx >= 0 ? parseFloat(process.argv[atIdx + 1]) : 5;

  if (!file) {
    console.error("Usage: node measure-composite-kpi.mjs <video> [--at sec]");
    process.exit(2);
  }

  const out = {
    file,
    durationSec: ffprobeDuration(file),
    ...ffprobeWxH(file),
    centerYavgAt: at,
    centerYavg: centerYavg(file, at),
    cornerYavg: cornerYavg(file, at),
    audioMeanDb: audioMeanDb(file),
  };
  console.log(JSON.stringify(out, null, 2));
}

if (process.argv[1]?.includes("measure-composite-kpi")) {
  main();
}
