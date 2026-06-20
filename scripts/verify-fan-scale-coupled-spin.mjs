#!/usr/bin/env node
/**
 * Whoosh spin: fast when small, slow at peak, accelerates while shrinking.
 *   npx tsx scripts/verify-fan-scale-coupled-spin.mjs
 */
import {
  getRevsWithinStep,
  FAN_RETREAT_REVS,
} from "../apps/web/src/features/cube/fanTransform.ts";
import {
  getFanApproachMs,
  getFanShowcaseHoldMs,
  getFanRetreatMs,
} from "../apps/web/src/features/cube/fanTiming.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";
import {
  presentationSpinRateMul,
  sampleApproachPresentationScale,
  sampleRetreatPresentationScale,
  FAN_WHOOSH_RETREAT_REVS,
} from "../apps/web/src/features/cube/fanScaleCoupledSpin.ts";

const DT = 8;
const fx = resolveCubeShowcaseFx({
  cubeShowcaseZoomEnabled: true,
  cubeScaleCoupledSpinEnabled: true,
});
const plainFx = resolveCubeShowcaseFx({
  cubeShowcaseZoomEnabled: true,
  cubeScaleCoupledSpinEnabled: false,
});

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

const farRate = presentationSpinRateMul(sampleApproachPresentationScale, 0.08, "approach");
const peakRate = presentationSpinRateMul(sampleApproachPresentationScale, 1, "approach");
ok(farRate > peakRate * 1.8, `far ${farRate} should exceed peak ${peakRate}`);

const retreatEarly = presentationSpinRateMul(sampleRetreatPresentationScale, 0.12, "retreat");
const retreatLate = presentationSpinRateMul(sampleRetreatPresentationScale, 0.88, "retreat");
ok(retreatLate > retreatEarly, "retreat spin should accelerate as cube shrinks");

const approachMs = getFanApproachMs(0);
const showcaseMs = getFanShowcaseHoldMs(0);
const retreatMs = getFanRetreatMs();
const retreatMidT = approachMs + showcaseMs + retreatMs * 0.5;

function omega(t, useFx) {
  const r0 = getRevsWithinStep(t, 0, 1, "wedding_default", "mixed", useFx);
  const r1 = getRevsWithinStep(t + DT, 0, 1, "wedding_default", "mixed", useFx);
  return (r1 - r0) / DT;
}

const omegaApproachEarly = omega(approachMs * 0.15, fx);
const omegaApproachLate = omega(approachMs * 0.92, fx);
ok(
  Math.abs(omegaApproachEarly) > Math.abs(omegaApproachLate) * 1.15,
  `approach decel: early=${omegaApproachEarly} late=${omegaApproachLate}`
);

const omegaRetreatEarly = omega(retreatMidT - retreatMs * 0.3, fx);
const omegaRetreatLate = omega(retreatMidT + retreatMs * 0.35, fx);
ok(
  Math.abs(omegaRetreatLate) > Math.abs(omegaRetreatEarly) * 1.2,
  `retreat accel: early=${omegaRetreatEarly} late=${omegaRetreatLate}`
);

const wPeak = omega(approachMs + showcaseMs * 0.5, fx);
ok(Math.abs(wPeak) < 0.00002, `showcase hold frozen, got ω=${wPeak}`);

ok(FAN_WHOOSH_RETREAT_REVS > FAN_RETREAT_REVS * 2, "whoosh retreat revs boosted");

const gapMs = 1450;
const coupledBack = Math.abs(
  getRevsWithinStep(
    approachMs + showcaseMs + retreatMs + gapMs * 0.5,
    0,
    1,
    "wedding_default",
    "mixed",
    fx
  ) -
    getRevsWithinStep(approachMs + showcaseMs, 0, 1, "wedding_default", "mixed", fx)
);
const plainBack = Math.abs(
  getRevsWithinStep(
    approachMs + showcaseMs + retreatMs + gapMs * 0.5,
    0,
    1,
    "wedding_default",
    "mixed",
    plainFx
  ) -
    getRevsWithinStep(approachMs + showcaseMs, 0, 1, "wedding_default", "mixed", plainFx)
);
ok(
  coupledBack > plainBack * 2,
  `whoosh back-flight revs: coupled=${coupledBack} plain=${plainBack}`
);

const omegaHandoffMid = omega(approachMs + showcaseMs + retreatMs + gapMs * 0.45, fx);
ok(Math.abs(omegaHandoffMid) > 0.00004, `handoff still spinning ω=${omegaHandoffMid}`);

console.log("verify-fan-scale-coupled-spin: OK");
