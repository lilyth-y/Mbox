#!/usr/bin/env node
/**
 * Demo MP4 — Kakao photos + booth + BGM.
 * Usage:
 *   node scripts/demo-showcase-mp4.mjs [--shape=heart|cube] [--fps=30|60]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadEnvLocal } from "./lib/load-env-local.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal(root);

function readArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) {
    return process.env[`MBOX_DEMO_${name.toUpperCase()}`] ?? fallback;
  }
  return hit.split("=")[1] ?? fallback;
}

const shape = readArg("shape", "heart");
const fps = Number(readArg("fps", "30"));
if (!["heart", "cube"].includes(shape)) {
  throw new Error(`Unsupported shape: ${shape}`);
}
if (!Number.isFinite(fps) || fps < 24 || fps > 60) {
  throw new Error(`Unsupported fps: ${fps}`);
}

const API_URL = (process.env.VITE_API_BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");
const WEB_BASE = (process.env.MBOX_WEB_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const API_KEY = process.env.API_KEY ?? process.env.VITE_API_KEY ?? "";
const kakaoDir = join(root, "data", "asset", "temp_1778692001076.-1818431043");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(root, "experiments", "outputs", "demo-showcase", `${shape}-${fps}fps-${stamp}`);

function headers() {
  const h = { "Content-Type": "application/json", "X-Workspace-Id": "default" };
  if (API_KEY) h["X-API-Key"] = API_KEY;
  return h;
}

function loadKakaoDataUrls(count = 6) {
  const files = readdirSync(kakaoDir)
    .filter((f) => /^KakaoTalk_.*\.jpg$/i.test(f))
    .sort()
    .slice(0, count);
  if (files.length < count) {
    throw new Error(`Need ${count} Kakao JPGs in ${kakaoDir}`);
  }
  return files.map((f) => {
    const b64 = readFileSync(join(kakaoDir, f)).toString("base64");
    return `data:image/jpeg;base64,${b64}`;
  });
}

async function waitHealth() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${API_URL}/health`)).ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("API not ready — run npm run dev");
}

await waitHealth();
mkdirSync(outDir, { recursive: true });

const sourceUrls = loadKakaoDataUrls(6);
const recordTimeoutMs = fps > 30 ? 2_700_000 : 420_000;

const createRes = await fetch(`${API_URL}/render/jobs`, {
  method: "POST",
  headers: headers(),
  body: JSON.stringify({
    kind: "crystal_showcase",
    processedImageRefs: sourceUrls.map((url, i) => ({ id: `kakao-${i + 1}`, url })),
    settings: {
      kind: "crystal_showcase",
      catalogOptions: {
        shapeId: shape,
        photoLayout: shape === "cube" ? "auto" : "auto",
        backgroundPreset: "booth",
        look: "rose_gold_premium",
        bgmEnabled: true,
        bgmTrackId: "cinematic_romantic",
        bgmVolume: 0.85,
      },
      imageCount: 6,
      fallPhysicsEnabled: false,
      backdropMediaPath: "배경동영상/mf001.mp4",
    },
    outputProfile: {
      width: 1080,
      height: 1080,
      fps,
      codec: "h264",
      videoBitrate: fps > 30 ? 12_000_000 : 8_000_000,
    },
  }),
});
const created = await createRes.json();
if (!createRes.ok) {
  throw new Error(created.error ?? `Create failed (${createRes.status})`);
}

const jobId = created.job.id;
console.log("Job:", jobId, `(shape=${shape}, fps=${fps}, timeout=${recordTimeoutMs}ms)`);

const worker = spawnSync(
  process.execPath,
  [join(root, "scripts/render-worker-process-job.mjs"), jobId],
  {
    cwd: root,
    env: {
      ...process.env,
      MBOX_WEB_BASE_URL: WEB_BASE,
      MBOX_RECORD_TIMEOUT_MS: String(recordTimeoutMs),
    },
    stdio: "inherit",
  }
);
if (worker.status !== 0) {
  process.exit(worker.status ?? 1);
}

const safeJob = jobId.replace(/[^a-zA-Z0-9_-]/g, "_");
const localMp4 = join(root, "apps", "api", "data", "render-jobs", "outputs", `${safeJob}.mp4`);
if (!existsSync(localMp4)) {
  const res = await fetch(`${API_URL}/render/jobs/${encodeURIComponent(jobId)}/output`);
  if (!res.ok) throw new Error(`No output file (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(outDir, "showcase.mp4"), buf);
} else {
  writeFileSync(join(outDir, "showcase.mp4"), readFileSync(localMp4));
}

const mp4Path = join(outDir, "showcase.mp4");
let sizeMb = (readFileSync(mp4Path).length / (1024 * 1024)).toFixed(2);

function probeStream(path, streamSelector, entries, countFrames = false) {
  const args = [
    "-v",
    "error",
    ...(countFrames ? ["-count_frames"] : []),
    "-select_streams",
    streamSelector,
    "-show_entries",
    entries,
    "-of",
    "default=noprint_wrappers=1",
    path,
  ];
  const result = spawnSync("ffprobe", args, { encoding: "utf8" });
  if (result.status !== 0) {
    return null;
  }
  const out = {};
  for (const line of result.stdout.trim().split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq > 0) {
      out[line.slice(0, eq)] = line.slice(eq + 1);
    }
  }
  return out;
}

if (fps > 30) {
  const videoProbe = probeStream(
    mp4Path,
    "v:0",
    "stream=duration,nb_read_frames,avg_frame_rate",
    true
  );
  const rawDur = Number(videoProbe?.duration ?? 0);
  const frameCount = Number(videoProbe?.nb_read_frames ?? 0);
  const targetDur = frameCount > 0 ? frameCount / fps : rawDur;
  if (
    Number.isFinite(rawDur) &&
    rawDur > 0 &&
    Number.isFinite(targetDur) &&
    targetDur > 0 &&
    rawDur > targetDur * 1.12
  ) {
    const ratio = targetDur / rawDur;
    const retimedPath = join(outDir, "showcase.retime.mp4");
    console.log(
      `[demo] retiming paced export ${rawDur.toFixed(1)}s → ${targetDur.toFixed(1)}s (${frameCount} frames @ ${fps}fps)`
    );
    const retime = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        mp4Path,
        "-filter:v",
        `setpts=PTS*${ratio},fps=${fps}`,
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "18",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        retimedPath,
      ],
      { stdio: "pipe", encoding: "utf8" }
    );
    if (retime.status === 0 && existsSync(retimedPath)) {
      writeFileSync(mp4Path, readFileSync(retimedPath));
      sizeMb = (readFileSync(mp4Path).length / (1024 * 1024)).toFixed(2);
    } else {
      console.warn("[demo] ffmpeg retime failed — using raw export");
    }
  }
}

let durationSec = null;
const probe = spawnSync(
  "ffprobe",
  ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", mp4Path],
  { encoding: "utf8" }
);
if (probe.status === 0) {
  durationSec = Number(probe.stdout.trim());
}

spawnSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    mp4Path,
    "-vf",
    "select='eq(n\\,0)+eq(n\\,90)+eq(n\\,180)+eq(n\\,270)+eq(n\\,360)'",
    "-vsync",
    "vfr",
    join(outDir, "frame_%02d.png"),
  ],
  { stdio: "pipe", encoding: "utf8" }
);

writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      jobId,
      shape,
      look: "rose_gold_premium",
      background: "booth",
      backdrop: "배경동영상/mf001.mp4",
      bgm: "cinematic_romantic",
      fps,
      photos: 6,
      perFaceCube: shape === "cube",
      mp4: `experiments/outputs/demo-showcase/${shape}-${fps}fps-${stamp}/showcase.mp4`,
      sizeMb: Number(sizeMb),
      durationSec,
      streamUrl: `${API_URL}/render/jobs/${jobId}/output`,
      frames: ["frame_01.png", "frame_02.png", "frame_03.png", "frame_04.png", "frame_05.png"],
    },
    null,
    2
  ),
  "utf8"
);

console.log(`\nMP4: ${mp4Path} (${sizeMb} MB${durationSec ? `, ${durationSec.toFixed(1)}s` : ""})`);
console.log(`Frames: ${outDir}`);
console.log(`Stream: ${API_URL}/render/jobs/${jobId}/output`);
