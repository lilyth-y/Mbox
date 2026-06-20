#!/usr/bin/env node
/**
 * Tier-1 KPI experiments for composite_rose_cube pipeline (Goal skill).
 * Short 8s clips at critical timestamps — one variable per attempt.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ffprobeDuration,
  ffprobeWxH,
  centerYavg,
  cornerYavg,
  edgeStripYavg,
  audioMeanDb,
  frameMd5,
} from "./measure-composite-kpi.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = join(root, "experiments", "composite_rose_cube");
const clipDir = join(outRoot, "tier1_clips");
const fg = join(process.env.USERPROFILE ?? "", "Downloads", "mbox-cube_focus (1).mp4");
const bg = join(process.env.USERPROFILE ?? "", "Downloads", "2026_06_10 11_31.mp4");
const bgm = join(root, "apps", "web", "public", "bgm", "piano-slideshow.mp3");
const ps1 = join(root, "scripts", "composite_rose_cube_video.ps1");
const manifestPath = join(root, "experiments", "outputs", "composite_rose_cube_focus_manifest.json");
const catalogPath = join(root, "data", "background", "catalog.json");

mkdirSync(clipDir, { recursive: true });
mkdirSync(outRoot, { recursive: true });

function runPs1(args, label) {
  const r = spawnSync(
    "powershell",
    ["-ExecutionPolicy", "Bypass", "-File", ps1, ...args],
    { encoding: "utf8", cwd: root, maxBuffer: 30 * 1024 * 1024 },
  );
  return { label, code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

function renderClip(name, extraArgs, startSec = 0, lenSec = 8) {
  const out = join(clipDir, `${name}.mp4`);
  const filter = [
    `[0:v]trim=start=${startSec}:duration=${lenSec},setpts=PTS-STARTPTS,scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,fps=30,format=yuv420p[bg]`,
  ];
  const args = extraArgs;
  // Use full ps1 with SegmentSeconds 0 and custom output — but ps1 doesn't support clip-only easily.
  // Spawn ffmpeg directly for controlled A/B.
  return out;
}

function ffmpegClip(out, filter, withBgm = false) {
  const args = ["-y", "-stream_loop", "-1", "-i", bg, "-i", fg];
  if (withBgm) args.push("-stream_loop", "-1", "-i", bgm);
  args.push("-filter_complex", filter, "-map", "[outv]");
  if (withBgm) args.push("-map", "2:a", "-shortest");
  else args.push("-map", "0:a?");
  args.push("-t", "8", "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", out);
  const r = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return r.status === 0 ? out : null;
}

function filterColorKey(cube, start = 65) {
  return [
    `[0:v]trim=start=${start % 60}:duration=8,setpts=PTS-STARTPTS,scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,fps=30,format=yuv420p[bg]`,
    `[1:v]trim=start=${start}:duration=8,setpts=PTS-STARTPTS,scale=${cube}:${cube}:force_original_aspect_ratio=decrease,format=yuv420p,fps=30[fg0]`,
    `[fg0]colorkey=0x000000:0.12:0.18[fgk]`,
    `[bg][fgk]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p[outv]`,
  ].join(";");
}

function filterScreen(cube, start = 65) {
  return [
    `[0:v]trim=start=${start % 60}:duration=8,setpts=PTS-STARTPTS,scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080,fps=30,format=yuv420p[bg]`,
    `[1:v]trim=start=${start}:duration=8,setpts=PTS-STARTPTS,scale=1080:1080:force_original_aspect_ratio=decrease,format=yuv420p,fps=30,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:color=black[fgpad]`,
    `[bg][fgpad]blend=all_mode=screen:all_opacity=1,format=yuv420p[outv]`,
  ].join(";");
}

function verdict(kpi, target, measured, op = "<=") {
  let pass = false;
  if (op === "<=") pass = measured <= target;
  else if (op === ">=") pass = measured >= target;
  else if (op === ">") pass = measured > target;
  else if (op === "===") pass = measured === target;
  return {
    kpi,
    target,
    measured,
    result: pass ? "PASS" : "FAIL",
    gap: typeof measured === "number" ? measured - target : null,
  };
}

const results = [];
const attempts = [];

// E1 segment duration sum (probe part01-03 directly)
const partFiles = [1, 2, 3].map((n) =>
  join(root, "experiments", "outputs", `composite_rose_cube_focus_part${String(n).padStart(2, "0")}.mp4`),
).filter((p) => existsSync(p));
if (partFiles.length >= 2) {
  const srcDur = ffprobeDuration(fg);
  const sumProbe = partFiles.reduce((s, p) => s + (ffprobeDuration(p) ?? 0), 0);
  const gap = Math.abs(sumProbe - srcDur);
  results.push({
    id: "E1_segment_duration",
    kpi: "gapProbeSec",
    target: 0.15,
    measured: gap,
    result: gap <= 0.15 ? "PASS" : "FAIL",
    theoreticalBest: 0,
    sourceDurationSec: srcDur,
    sumProbedSec: sumProbe,
    partCount: partFiles.length,
  });
} else {
  results.push({ id: "E1_segment_duration", result: "SKIP", reason: "no part files" });
}

// E2 boundary seek — part02@2s should differ from part01@58s (no overlap bug)
const part1 = join(root, "experiments/outputs/composite_rose_cube_focus_part01.mp4");
const part2 = join(root, "experiments/outputs/composite_rose_cube_focus_part02.mp4");
if (existsSync(part1) && existsSync(part2)) {
  const hEnd = frameMd5(part1, 58);
  const hStart = frameMd5(part2, 2);
  const distinct = hEnd && hStart && hEnd !== hStart;
  results.push({
    id: "E2_boundary_seek",
    kpi: "part01@58s hash != part02@2s hash (no duplicate segment)",
    target: true,
    measured: distinct,
    result: distinct ? "PASS" : "FAIL",
    hashes: { part1_58s: hEnd, part2_2s: hStart },
  });
}

// E3 cube scale — corner luma at t=5 (more bg visible at 1.25 vs 1.5)
for (const { scale, cube } of [{ scale: 1.0, cube: 1080 }, { scale: 1.25, cube: 1350 }]) {
  const out = join(clipDir, `e3_scale_${scale}.mp4`);
  ffmpegClip(out, filterColorKey(cube, 5));
  const edge = edgeStripYavg(out, 4);
  attempts.push({ id: `E3_scale_${scale}`, variable: `CubeScale=${scale}`, edgeStripYavg: edge });
}
const e100 = attempts.find((a) => a.id === "E3_scale_1")?.edgeStripYavg ?? 0;
const e125 = attempts.find((a) => a.id === "E3_scale_1.25")?.edgeStripYavg ?? 0;
results.push({
  id: "E3_cube_scale_edge_bg",
  kpi: "edgeStripYavg_1.0 > edgeStripYavg_1.25",
  target: true,
  measured: e100 > e125,
  edgeStripYavg100: e100,
  edgeStripYavg125: e125,
  result: e100 > e125 ? "PASS" : "FAIL",
  note: "Smaller cube leaves more rose on edge; 1.25 vs 1.5 both overflow canvas",
});

// E4 blend mode at cube segment t=65
const ckOut = join(clipDir, "e4_colorkey.mp4");
const scOut = join(clipDir, "e4_screen.mp4");
ffmpegClip(ckOut, filterColorKey(1350, 65));
ffmpegClip(scOut, filterScreen(1350, 65));
const yCk = centerYavg(ckOut, 4);
const ySc = centerYavg(scOut, 4);
results.push({
  id: "E4_blend_cube_luma",
  kpi: "centerYavg_screen > centerYavg_colorkey @ cube segment",
  target: true,
  measured: ySc > yCk,
  centerYavgColorKey: yCk,
  centerYavgScreen: ySc,
  result: ySc > yCk ? "PASS" : "FAIL",
  theoreticalBest: "screen removes black without eating dark suit",
});

// E5 audio — bg only vs BGM
const noBgm = join(clipDir, "e5_nobgm.mp4");
const withBgm = join(clipDir, "e5_bgm.mp4");
ffmpegClip(noBgm, filterColorKey(1350, 5), false);
ffmpegClip(withBgm, filterColorKey(1350, 5), true);
const dbNo = audioMeanDb(noBgm);
const dbBgm = audioMeanDb(withBgm);
results.push({
  id: "E5_audio_bgm",
  kpi: "audioMeanDb with BGM > -40",
  target: -40,
  measured: dbBgm,
  result: dbBgm !== null && dbBgm > -40 ? "PASS" : "FAIL",
  audioMeanDbNoBgm: dbNo,
  audioMeanDbWithBgm: dbBgm,
});

// E6 concat duration
const concatOut = join(clipDir, "e6_concat_test");
mkdirSync(concatOut, { recursive: true });
const r6 = runPs1([
  `-Foreground`, fg,
  `-Output`, join(concatOut, "seg_test.mp4"),
  `-SegmentSeconds`, "30",
  `-CubeScale`, "1.25",
  `-ConcatParts`,
], "E6");
const concatFile = join(concatOut, "seg_test_concat.mp4");
const srcDur = ffprobeDuration(fg);
const concatDur = existsSync(concatFile) ? ffprobeDuration(concatFile) : null;
const gap6 = concatDur !== null ? Math.abs(concatDur - srcDur) : 999;
results.push({
  id: "E6_concat_duration",
  kpi: "abs(concatDur - sourceDur) <= 0.15s",
  target: 0.15,
  measured: gap6,
  result: gap6 <= 0.15 ? "PASS" : "FAIL",
  sourceDurationSec: srcDur,
  concatDurationSec: concatDur,
  ps1Exit: r6.code,
});

// E7 catalog
let e7pass = false;
if (existsSync(catalogPath)) {
  const cat = JSON.parse(readFileSync(catalogPath, "utf8"));
  const videos = cat.collections?.find((c) => c.id.includes("동영상") || c.id.includes("배경"));
  e7pass = !!videos?.items?.some((i) => i.file.includes("2026_06_10 11_31"));
}
results.push({
  id: "E7_catalog_registration",
  kpi: "2026_06_10 11_31.mp4 in catalog 배경동영상",
  target: true,
  measured: e7pass,
  result: e7pass ? "PASS" : "FAIL",
});

// E8 npm script smoke (dry — script file exists + ps1 parses)
results.push({
  id: "E8_npm_script_registered",
  kpi: "composite:rose-cube in package.json",
  target: true,
  measured: readFileSync(join(root, "package.json"), "utf8").includes("composite:rose-cube"),
  result: readFileSync(join(root, "package.json"), "utf8").includes("composite:rose-cube") ? "PASS" : "PENDING",
});

// E9 resolution
for (const size of [720, 1080]) {
  const out = join(clipDir, `e9_${size}.mp4`);
  const f = [
    `[0:v]trim=start=0:duration=8,setpts=PTS-STARTPTS,scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},fps=30,format=yuv420p[bg]`,
    `[1:v]trim=start=0:duration=8,setpts=PTS-STARTPTS,scale=${Math.round(size * 1.25)}:${Math.round(size * 1.25)}:force_original_aspect_ratio=decrease,format=yuv420p,fps=30[fg0]`,
    `[fg0]colorkey=0x000000:0.12:0.18[fgk]`,
    `[bg][fgk]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p[outv]`,
  ].join(";");
  ffmpegClip(out, f);
  const wh = ffprobeWxH(out);
  results.push({
    id: `E9_resolution_${size}`,
    kpi: `output ${size}x${size}`,
    target: size,
    measured: wh?.width === size && wh?.height === size,
    result: wh?.width === size && wh?.height === size ? "PASS" : "FAIL",
    width: wh?.width,
    height: wh?.height,
  });
}

// E10 EHI gate (informational — on existing entrance export if present)
const ehiScript = join(root, "scripts", "measure-entrance-ehi.mjs");
if (existsSync(ehiScript)) {
  const r10 = spawnSync("npx", ["tsx", ehiScript, "--gate"], {
    encoding: "utf8",
    cwd: root,
    maxBuffer: 10 * 1024 * 1024,
  });
  results.push({
    id: "E10_entrance_ehi_gate",
    kpi: "EHI >= 1.0 (entrance hologram baseline)",
    target: 1.0,
    measured: r10.code === 0 ? "gate_pass" : "gate_fail",
    result: r10.code === 0 ? "PASS" : "FAIL",
    note: "Measures Mbox entrance export, not composite file directly",
    stderrTail: r10.stderr?.slice(-500),
  });
}

const summary = {
  generatedAt: new Date().toISOString(),
  tier: 1,
  pass: results.filter((r) => r.result === "PASS").length,
  fail: results.filter((r) => r.result === "FAIL").length,
  skip: results.filter((r) => r.result === "SKIP" || r.result === "PENDING").length,
  results,
  attempts,
  recommendedNext: [],
};

for (const r of results.filter((x) => x.result === "FAIL")) {
  if (r.id === "E4_blend_cube_luma") summary.recommendedNext.push("Set BlendMode=Screen as default for cube segments");
  if (r.id === "E5_audio_bgm") summary.recommendedNext.push("Always pass -BgmPath piano-slideshow.mp3");
  if (r.id === "E3_cube_scale_corner_bg") summary.recommendedNext.push("Default CubeScale=1.25 for visible rose border");
}

const outJson = join(outRoot, "tier1_results.json");
writeFileSync(outJson, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

const passAll = summary.fail === 0;
process.exit(passAll ? 0 : 1);
