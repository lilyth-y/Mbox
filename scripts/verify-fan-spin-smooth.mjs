#!/usr/bin/env node
/**
 * Fan loop yaw: approach decel → showcase freeze → retreat accel.
 *   npx tsx scripts/verify-fan-spin-smooth.mjs
 */
import {
  getAccumulatedRevs,
  getFanStepSegmentMs,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import {
  getFanApproachMs,
  getFanShowcaseHoldMs,
  getFanRetreatMs,
  FAN_GAP_MS,
} from "../apps/web/src/features/cube/fanTiming.ts";

const DT_MS = 40;
const SAMPLE_OFFSET_MS = 120;
const TARGET_APPROACH_DECEL_RATIO = 1.35;
const TARGET_RETREAT_ACCEL_RATIO = 1.35;
const TARGET_HOLD_OMEGA_FRAC = 0.06;
const TARGET_PHASE_JUMP_MAX = 1.4;

function spinRateAt(step, tMs, speedMul = 1) {
  const r0 = getAccumulatedRevs(tMs, step, speedMul);
  const r1 = getAccumulatedRevs(tMs + DT_MS, step, speedMul);
  return ((r1 - r0) / DT_MS) * 1000;
}

function measureStep(step, speedMul = 1) {
  const profile = "wedding_default";
  const approachEnd = getFanApproachMs(step, profile) / speedMul;
  const showcaseEnd = approachEnd + getFanShowcaseHoldMs(step, profile) / speedMul;
  const retreatPhaseEnd = showcaseEnd + getFanRetreatMs(profile) / speedMul;
  const retreatEnd = retreatPhaseEnd + FAN_GAP_MS / speedMul;
  const total = getFanStepSegmentMs(step, profile, speedMul);

  const wApproachStart = Math.abs(spinRateAt(step, SAMPLE_OFFSET_MS, speedMul));
  const wApproachEnd = Math.abs(
    spinRateAt(step, Math.max(0, approachEnd - SAMPLE_OFFSET_MS), speedMul)
  );
  const approachDecel = wApproachStart >= wApproachEnd * TARGET_APPROACH_DECEL_RATIO;

  const holdT = approachEnd + getFanShowcaseHoldMs(step, profile) / speedMul / 2;
  const wHold = Math.abs(spinRateAt(step, holdT, speedMul));
  const wPeak = Math.abs(spinRateAt(step, approachEnd - SAMPLE_OFFSET_MS, speedMul));
  const showcaseFrozen = wHold <= TARGET_HOLD_OMEGA_FRAC * Math.max(wPeak, 1e-9);

  const wRetreatStart = Math.abs(
    spinRateAt(step, showcaseEnd + SAMPLE_OFFSET_MS, speedMul)
  );
  const wRetreatMid = Math.abs(
    spinRateAt(
      step,
      showcaseEnd + (retreatPhaseEnd - showcaseEnd) * 0.52,
      speedMul
    )
  );
  const wRetreatEnd = Math.abs(
    spinRateAt(step, Math.max(0, retreatPhaseEnd - SAMPLE_OFFSET_MS), speedMul)
  );
  const retreatAccel = wRetreatMid >= wRetreatStart * TARGET_RETREAT_ACCEL_RATIO;

  const boundaries = [approachEnd, showcaseEnd, retreatEnd];
  let maxPhaseJump = 1;
  const wRef = Math.max(wRetreatEnd, 1e-9);
  for (const t of boundaries) {
    if (t <= DT_MS || t >= total - DT_MS) continue;
    const wBefore = Math.abs(spinRateAt(step, t - DT_MS, speedMul));
    const wAfter = Math.abs(spinRateAt(step, t + DT_MS, speedMul));
    if (wBefore < 0.02 && wAfter < 0.02) continue;
    const jump = Math.abs(wAfter - wBefore) / wRef;
    maxPhaseJump = Math.max(maxPhaseJump, jump);
  }

  return {
    approachDecel,
    showcaseFrozen,
    retreatAccel,
    maxPhaseJump,
    wApproachStart,
    wApproachEnd,
    wHold,
    wRetreatStart,
    wRetreatEnd,
  };
}

const m0 = measureStep(0);
const m1 = measureStep(1);
const pass =
  m0.approachDecel &&
  m1.approachDecel &&
  m0.showcaseFrozen &&
  m1.showcaseFrozen &&
  m0.retreatAccel &&
  m1.retreatAccel &&
  m0.maxPhaseJump <= TARGET_PHASE_JUMP_MAX &&
  m1.maxPhaseJump <= TARGET_PHASE_JUMP_MAX;

console.log(
  JSON.stringify(
    {
      profile: "approach decel → showcase freeze → retreat+handoff accel",
      targets: {
        approachDecel: `ω(start) >= ${TARGET_APPROACH_DECEL_RATIO}× ω(end)`,
        showcaseFrozen: `ω(hold) <= ${TARGET_HOLD_OMEGA_FRAC}× ω(approach end)`,
        retreatAccel: `ω(end) >= ${TARGET_RETREAT_ACCEL_RATIO}× ω(retreat start)`,
        phaseBoundaryJump: `<= ${TARGET_PHASE_JUMP_MAX}`,
      },
      step0: m0,
      step1: m1,
      pass,
    },
    null,
    2
  )
);

if (!pass) {
  console.error("verify-fan-spin-smooth: FAIL");
  process.exit(1);
}
console.log("verify-fan-spin-smooth: OK");
