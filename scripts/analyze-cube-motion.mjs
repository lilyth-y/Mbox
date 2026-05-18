/**
 * Numerical continuity analysis for cube presentation motion.
 * Mirrors apps/web cube motion (linked vs legacy reset pipeline).
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const THREE = require(join(dirname(fileURLToPath(import.meta.url)), "../node_modules/three"));

// --- constants (sync with perceptualMotion.ts / cubeSequence.ts) ---
const ROTATE_MS = 1350;
const ZOOM_MS = 850;
const PARALLAX_MS = 2700;
const RESET_MS = 680;
const CUBE_RESET_MS = 0;
const DEFAULT_CAMERA_Z = 5;
const ZOOM_SCALE = 1.24;
const FRONT_CAMERA_Z = DEFAULT_CAMERA_Z / ZOOM_SCALE;
const PARALLAX_MAX = 0.038 * (PARALLAX_MS / 1000);
const PARALLAX_ROTATE_BLEND = 0.62;
const LOOP_BRIDGE_MS = 900;
const CORNER_REST = { x: 0, y: 0.38, z: 0 };
const CUBE_FACE_ORDER = [4, 0, 1, 2, 3, 5];

const FACE_ROTATIONS = {
  4: [0, 0, 0],
  5: [0, Math.PI, 0],
  0: [0, -Math.PI / 2, 0],
  1: [0, Math.PI / 2, 0],
  2: [-Math.PI / 2, 0, 0],
  3: [Math.PI / 2, 0, 0],
};

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}
function easeInOutSine01(t) {
  const x = Math.min(1, Math.max(0, t));
  return (-(Math.cos(Math.PI * x) - 1)) / 2;
}
function bellParallax(elapsed, holdMs, peak) {
  const t = Math.min(1, Math.max(0, elapsed / holdMs));
  return peak * Math.sin(Math.PI * t);
}
function rampParallax(elapsed, holdMs, peak) {
  const t = Math.min(1, Math.max(0, elapsed / holdMs));
  return easeInOutSine01(t) * peak;
}

function getPresentationFace(step) {
  return CUBE_FACE_ORDER[step % CUBE_FACE_ORDER.length];
}
function eulerToQuat(e) {
  const q = new THREE.Quaternion();
  q.setFromEuler(new THREE.Euler(e[0], e[1], e[2], "XYZ"));
  return q;
}
function slerpEuler(fromE, toE, alpha) {
  const from = eulerToQuat(fromE);
  const to = eulerToQuat(toE);
  return from.clone().slerp(to, alpha);
}
function quatAngleRad(a, b) {
  return 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));
}
function getFaceEuler(face) {
  return FACE_ROTATIONS[face] ?? [0, 0, 0];
}
function getCubeEntryEuler(step) {
  if (step === 0) return [CORNER_REST.x, CORNER_REST.y, CORNER_REST.z];
  return getFaceEuler(getPresentationFace(step - 1));
}

function getPhase(stepElapsed, timing) {
  const { rotateMs, zoomMs, parallaxMs, resetMs } = timing;
  const zoomStart = rotateMs;
  const parallaxStart = rotateMs + zoomMs;
  const resetStart = parallaxStart + parallaxMs;
  if (stepElapsed < rotateMs) return { phase: "rotate", alpha: easeInOut(stepElapsed / rotateMs) };
  if (stepElapsed < zoomStart + zoomMs)
    return { phase: "zoom", alpha: easeInOut((stepElapsed - zoomStart) / zoomMs) };
  if (stepElapsed < resetStart) return { phase: "parallax", alpha: 1 };
  return { phase: "reset", alpha: easeInOut((stepElapsed - resetStart) / resetMs) };
}

function getLegacyCamera(phase) {
  if (phase.phase === "rotate") return DEFAULT_CAMERA_Z;
  if (phase.phase === "zoom")
    return THREE.MathUtils.lerp(DEFAULT_CAMERA_Z, FRONT_CAMERA_Z, phase.alpha);
  if (phase.phase === "parallax") return FRONT_CAMERA_Z;
  return THREE.MathUtils.lerp(FRONT_CAMERA_Z, DEFAULT_CAMERA_Z, phase.alpha);
}

function getLinkedCamera(phase, step) {
  if (step > 0) return FRONT_CAMERA_Z;
  if (phase.phase === "rotate")
    return THREE.MathUtils.lerp(DEFAULT_CAMERA_Z, FRONT_CAMERA_Z, easeOutCubic(phase.alpha));
  return FRONT_CAMERA_Z;
}

function getLegacyParallax(stepElapsed, timing) {
  const parallaxStart = timing.rotateMs + timing.zoomMs;
  if (stepElapsed < parallaxStart || stepElapsed >= parallaxStart + timing.parallaxMs) return 0;
  return rampParallax(stepElapsed - parallaxStart, timing.parallaxMs, PARALLAX_MAX);
}

function getLinkedParallax(step, stepElapsed, timing) {
  const parallaxStart = timing.rotateMs + timing.zoomMs;
  const holdEnd = parallaxStart + timing.parallaxMs;
  const windowStart = step > 0 ? timing.rotateMs * PARALLAX_ROTATE_BLEND : parallaxStart;
  if (stepElapsed < windowStart || stepElapsed >= holdEnd) return 0;
  const windowLength = Math.max(holdEnd - windowStart, 1);
  const u = (stepElapsed - windowStart) / windowLength;
  return PARALLAX_MAX * Math.sin(Math.PI * u);
}

function getTiming(step, mode) {
  const isLinked = mode === "linked";
  return {
    rotateMs: ROTATE_MS,
    zoomMs: isLinked && step > 0 ? 0 : ZOOM_MS,
    parallaxMs: PARALLAX_MS,
    resetMs: isLinked ? CUBE_RESET_MS : RESET_MS,
  };
}

function segmentMs(step, mode) {
  const t = getTiming(step, mode);
  return t.rotateMs + t.zoomMs + t.parallaxMs + t.resetMs;
}

function sampleState(step, stepElapsed, mode) {
  const timing = getTiming(step, mode);
  const phase = getPhase(stepElapsed, timing);
  const face = getPresentationFace(step);
  const target = getFaceEuler(face);
  const isLinked = mode === "linked";
  const cameraZ = isLinked ? getLinkedCamera(phase, step) : getLegacyCamera(phase);
  const parallax = isLinked
    ? getLinkedParallax(step, stepElapsed, timing)
    : getLegacyParallax(stepElapsed, timing);

  let quat;
  if (phase.phase === "rotate") {
    const ease = step === 0 ? easeOutCubic : easeInOut;
    quat = slerpEuler(getCubeEntryEuler(step), target, ease(phase.alpha));
  } else {
    quat = eulerToQuat(target);
  }

  return { phase: phase.phase, cameraZ, parallax, quat };
}

function sampleLoopBridge(bridgeElapsed, lastStep) {
  const alpha = easeInOut(Math.min(1, Math.max(0, bridgeElapsed / LOOP_BRIDGE_MS)));
  const from = eulerToQuat(getFaceEuler(getPresentationFace(lastStep)));
  const to = eulerToQuat([CORNER_REST.x, CORNER_REST.y, CORNER_REST.z]);
  return {
    phase: "loop_bridge",
    cameraZ: THREE.MathUtils.lerp(FRONT_CAMERA_Z, DEFAULT_CAMERA_Z, alpha),
    parallax: 0,
    quat: from.clone().slerp(to, alpha),
  };
}

function buildTimeline(steps, mode, dtMs = 16, withLoopBridge = false) {
  const samples = [];
  for (let step = 0; step < steps; step += 1) {
    const dur = segmentMs(step, mode);
    for (let t = 0; t < dur; t += dtMs) {
      const s = sampleState(step, t, mode);
      samples.push({
        globalMs: samples.length * dtMs,
        step,
        stepElapsed: t,
        ...s,
      });
    }
    const end = sampleState(step, dur - 1, mode);
    samples.push({
      globalMs: samples.length * dtMs,
      step,
      stepElapsed: dur,
      ...end,
      atStepEnd: true,
    });
  }
  if (withLoopBridge && mode === "linked" && steps >= 2) {
    for (let t = 0; t <= LOOP_BRIDGE_MS; t += dtMs) {
      const s = sampleLoopBridge(t, steps - 1);
      samples.push({ globalMs: samples.length * dtMs, step: steps - 1, stepElapsed: t, ...s, loopBridge: true });
    }
    const loopStart = sampleState(0, 0, "linked");
    samples.push({
      globalMs: samples.length * dtMs,
      step: 0,
      stepElapsed: 0,
      ...loopStart,
      atLoopWrap: true,
    });
  }
  return samples;
}

function deriveVelocities(samples, dtMs) {
  const dt = dtMs / 1000;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    b.dCameraZ = (b.cameraZ - a.cameraZ) / dt;
    b.dParallax = (b.parallax - a.parallax) / dt;
    b.angularRadPerSec = quatAngleRad(a.quat, b.quat) / dt;
  }
  samples[0].dCameraZ = 0;
  samples[0].dParallax = 0;
  samples[0].angularRadPerSec = 0;
  return samples;
}

function boundaryJumps(samples, steps) {
  const jumps = [];
  for (let step = 0; step < steps - 1; step += 1) {
    const endIdx = samples.findIndex((s) => s.step === step && s.atStepEnd);
    const nextIdx = samples.findIndex((s) => s.step === step + 1 && s.stepElapsed === 0);
    if (endIdx < 0 || nextIdx < 0) continue;
    const a = samples[endIdx];
    const b = samples[nextIdx];
    jumps.push({
      boundary: `${step}→${step + 1}`,
      dCameraZ: Math.abs(b.cameraZ - a.cameraZ),
      dParallax: Math.abs(b.parallax - a.parallax),
      dAngleDeg: (quatAngleRad(a.quat, b.quat) * 180) / Math.PI,
      parallaxEnd: a.parallax,
      parallaxStart: b.parallax,
      cameraEnd: a.cameraZ,
      cameraStart: b.cameraZ,
    });
  }
  return jumps;
}

function internalPhaseJumps(samples, step, mode) {
  const stepSamples = samples.filter((s) => s.step === step && !s.atStepEnd);
  let maxParallaxJump = 0;
  let maxParallaxJumpAt = null;
  for (let i = 1; i < stepSamples.length; i += 1) {
    const dp = Math.abs(stepSamples[i].parallax - stepSamples[i - 1].parallax);
    if (dp > maxParallaxJump) {
      maxParallaxJump = dp;
      maxParallaxJumpAt = {
        ms: stepSamples[i].stepElapsed,
        from: stepSamples[i - 1].phase,
        to: stepSamples[i].phase,
        fromP: stepSamples[i - 1].parallax,
        toP: stepSamples[i].parallax,
      };
    }
  }
  return { step, maxParallaxJump, maxParallaxJumpAt };
}

function summarize(samples, steps, mode) {
  const v = deriveVelocities(samples, 16);
  const peaks = {
    maxAbsDCameraZ: Math.max(...v.map((s) => Math.abs(s.dCameraZ ?? 0))),
    maxAbsDParallax: Math.max(...v.map((s) => Math.abs(s.dParallax ?? 0))),
    maxAngularDegPerSec:
      (Math.max(...v.map((s) => s.angularRadPerSec ?? 0)) * 180) / Math.PI,
  };
  const boundaries = boundaryJumps(v, steps);
  const phaseJumps = [];
  for (let step = 0; step < steps; step += 1) {
    phaseJumps.push(internalPhaseJumps(v, step, mode));
  }
  const totalMs = v.length * 16;
  return { mode, steps, totalMs, peaks, boundaries, phaseJumps, sampleCount: v.length };
}

function printReport(linked, legacy) {
  const fmt = (n, d = 4) => Number(n).toFixed(d);
  console.log("\n=== Cube motion numerical analysis (dt=16ms, 6 faces) ===\n");
  console.log("Timing per step (linked):");
  for (let s = 0; s < 6; s += 1) {
    const t = getTiming(s, "linked");
    console.log(
      `  step ${s}: rotate=${t.rotateMs} zoom=${t.zoomMs} parallax=${t.parallaxMs} reset=${t.resetMs} → ${segmentMs(s, "linked")}ms`
    );
  }
  console.log(`\nTotal duration: linked ${linked.totalMs}ms (+${LOOP_BRIDGE_MS}ms bridge → ${linked.totalMs + LOOP_BRIDGE_MS}ms) | legacy ${legacy.totalMs}ms`);
  console.log("\n--- Peak temporal derivatives (60fps samples) ---");
  console.log(
    `|camera dZ/dt| max: linked ${fmt(linked.peaks.maxAbsDCameraZ)} vs legacy ${fmt(legacy.peaks.maxAbsDCameraZ)} (units: world-units/s)`
  );
  console.log(
    `|parallax d/dt| max: linked ${fmt(linked.peaks.maxAbsDParallax, 5)} vs legacy ${fmt(legacy.peaks.maxAbsDParallax, 5)}`
  );
  console.log(
    `angular vel max: linked ${fmt(linked.peaks.maxAngularDegPerSec, 1)}°/s vs legacy ${fmt(legacy.peaks.maxAngularDegPerSec, 1)}°/s`
  );

  console.log("\n--- Scene boundary jumps (end step N → start step N+1) ---");
  console.log("boundary | ΔcameraZ | Δparallax | Δangle(deg) | parallax_end→start");
  for (const row of linked.boundaries) {
    console.log(
      `${row.boundary.padEnd(8)} | ${fmt(row.dCameraZ)} | ${fmt(row.dParallax, 5)} | ${fmt(row.dAngleDeg, 2)} | ${fmt(row.parallaxEnd, 5)}→${fmt(row.parallaxStart, 5)}`
    );
  }
  console.log("\nLegacy (with reset) boundaries for comparison:");
  for (const row of legacy.boundaries) {
    console.log(
      `${row.boundary.padEnd(8)} | ${fmt(row.dCameraZ)} | ${fmt(row.dParallax, 5)} | ${fmt(row.dAngleDeg, 2)} | ${fmt(row.parallaxEnd, 5)}→${fmt(row.parallaxStart, 5)}`
    );
  }

  console.log("\n--- Internal phase discontinuities (max |Δparallax| between frames, per step) ---");
  for (const row of linked.phaseJumps) {
    const at = row.maxParallaxJumpAt;
    const detail = at
      ? ` @${at.ms}ms ${at.from}→${at.to} (${fmt(at.fromP, 5)}→${fmt(at.toP, 5)})`
      : "";
    console.log(`  step ${row.step}: max Δparallax=${fmt(row.maxParallaxJump, 5)}${detail}`);
  }

  const linkedWithBridge = buildTimeline(STEPS, "linked", 16, true);
  const bridgeV = deriveVelocities(linkedWithBridge, 16);
  const bridgeEnd = bridgeV.find((s) => s.loopBridge && s.stepElapsed >= LOOP_BRIDGE_MS - 16);
  const wrapStart = bridgeV.find((s) => s.atLoopWrap);
  if (bridgeEnd && wrapStart) {
    console.log("\n--- Loop seam WITH bridge (bridge end → step 0 t=0) ---");
    console.log(
      `ΔcameraZ=${fmt(Math.abs(wrapStart.cameraZ - bridgeEnd.cameraZ))} Δparallax=${fmt(Math.abs(wrapStart.parallax - bridgeEnd.parallax), 5)} Δangle=${fmt((quatAngleRad(bridgeEnd.quat, wrapStart.quat) * 180) / Math.PI, 2)}°`
    );
  }
  const loopEnd = sampleState(5, segmentMs(5, "linked") - 1, "linked");
  const loopStart = sampleState(0, 0, "linked");
  console.log("\n--- Loop seam WITHOUT bridge (legacy jump) ---");
  console.log(
    `ΔcameraZ=${fmt(Math.abs(loopStart.cameraZ - loopEnd.cameraZ))} Δparallax=${fmt(Math.abs(loopStart.parallax - loopEnd.parallax), 5)} Δangle=${fmt((quatAngleRad(eulerToQuat(getFaceEuler(getPresentationFace(5))), eulerToQuat(getFaceEuler(getPresentationFace(0)))) * 180) / Math.PI, 1)}°`
  );

  return { linked, legacy };
}

const STEPS = 6;
const linkedSamples = buildTimeline(STEPS, "linked");
const legacySamples = buildTimeline(STEPS, "legacy");
const linked = summarize(linkedSamples, STEPS, "linked");
const legacy = summarize(legacySamples, STEPS, "legacy");
printReport(linked, legacy);

const outPath = join(dirname(fileURLToPath(import.meta.url)), "../experiments/outputs/cube_motion_analysis.json");
writeFileSync(outPath, JSON.stringify({ linked, legacy }, null, 2));
console.log(`\nWrote ${outPath}`);
