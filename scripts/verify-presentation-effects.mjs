/**
 * Smoke: all 5 product presentation templates produce finite motion frames.
 *   npx tsx scripts/verify-presentation-effects.mjs
 */
import * as THREE from "three";
import {
  PRESENTATION_EFFECTS,
  DEFAULT_PRESENTATION_EFFECT,
} from "../apps/web/src/features/cube/presentationEffects.ts";
import { computePresentationFrame } from "../apps/web/src/features/cube/presentationFrame.ts";
import {
  getStepSegmentMs,
  getStepPhaseTiming,
} from "../apps/web/src/features/cube/cubeMotionVariety.ts";
import { ZOOM_MS, PARALLAX_MS } from "../apps/web/src/features/cube/cubeSequence.ts";

const checks = [];

function ok(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`[${pass ? "OK" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
}

function assertFiniteFrame(frame, label) {
  const root = new THREE.Object3D();
  frame.applyRootTransform(root);
  const nums = [
    frame.cameraZ,
    frame.fieldOfView,
    frame.parallaxAmount,
    frame.focusPulse ?? 0,
    frame.cameraOffsetX ?? 0,
    frame.cameraOffsetY ?? 0,
    root.rotation.x,
    root.rotation.y,
    root.rotation.z,
    root.position.x,
    root.position.y,
    root.position.z,
    root.scale.x,
  ];
  for (const n of nums) {
    if (!Number.isFinite(n)) {
      throw new Error(`${label}: non-finite ${n}`);
    }
  }
}

ok("default effect is cube_focus", DEFAULT_PRESENTATION_EFFECT === "cube_focus");
ok("product template count", PRESENTATION_EFFECTS.length === 5, String(PRESENTATION_EFFECTS.length));

for (const effect of PRESENTATION_EFFECTS) {
  ok(`${effect.id} has moodLabel`, Boolean(effect.moodLabel?.trim()), effect.moodLabel);
}

const presentationCount = 4;
const motionSeed = 42;
const fanProfile = "wedding_default";

for (const effect of PRESENTATION_EFFECTS) {
  let framesSampled = 0;
  for (let step = 0; step < Math.min(presentationCount, 3); step += 1) {
    const segmentMs = getStepSegmentMs(
      motionSeed,
      step,
      ZOOM_MS,
      PARALLAX_MS,
      effect.id,
      presentationCount,
      fanProfile,
    );
    ok(`${effect.id} step${step} segmentMs > 0`, segmentMs > 0, String(segmentMs));

    const timing = getStepPhaseTiming(
      motionSeed,
      step,
      ZOOM_MS,
      PARALLAX_MS,
      effect.id,
      presentationCount,
    );
    const sampleTimes = [
      Math.floor(timing.rotateMs * 0.5),
      timing.rotateMs + Math.floor(timing.zoomMs * 0.5),
      timing.rotateMs + timing.zoomMs + Math.floor(timing.parallaxMs * 0.5),
      Math.max(0, segmentMs - 1),
    ];

    for (const stepElapsed of sampleTimes) {
      try {
        const frame = computePresentationFrame(effect.id, step, stepElapsed, presentationCount, step % 6, {
          timing,
          motionSeed,
          hologramMode: effect.id === "cube_focus",
          exportRecording: false,
        });
        assertFiniteFrame(frame, `${effect.id} s${step} t${stepElapsed}`);
        framesSampled += 1;
      } catch (error) {
        ok(
          `${effect.id} frame s${step} t${stepElapsed}`,
          false,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
  ok(`${effect.id} sampled frames`, framesSampled >= 8, String(framesSampled));
}

const failed = checks.filter((c) => !c.pass);
if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed }, null, 2));
  process.exit(1);
}
console.log("verify-presentation-effects: OK");
