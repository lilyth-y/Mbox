#!/usr/bin/env node
/**
 * Heartbeat envelope + bidirectional spin for mixed rotation mode.
 *   npx tsx scripts/verify-fan-heartbeat-bidirectional.mjs
 */
import { sampleHeartbeat } from "../apps/web/src/features/cube/fanHeartbeat.ts";
import {
  getAccumulatedRevs,
  getRevsWithinStep,
} from "../apps/web/src/features/cube/fanTransform.ts";
import {
  getFanApproachMs,
  getFanRetreatMs,
  FAN_GAP_MS,
  getFanShowcaseHoldMs,
} from "../apps/web/src/features/cube/fanTiming.ts";
import { sampleFanCubeMotion } from "../apps/web/src/features/cube/cubeFanTimeline.ts";

function ok(name, pass, detail = "") {
  console.log(`[${pass ? "OK" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

const hbLub = sampleHeartbeat(120);
const hbDub = sampleHeartbeat(302);
ok("heartbeat lub peak", hbLub.envelope > 0.5, String(hbLub.envelope));
ok("heartbeat dub peak", hbDub.envelope > 0.25, String(hbDub.envelope));

const approachEnd = getFanApproachMs(0);
const showcaseMid = approachEnd + getFanShowcaseHoldMs(0) * 0.5;
const retreatMid =
  approachEnd +
  getFanShowcaseHoldMs(0) +
  getFanRetreatMs() * 0.5;

const revApproachEnd = getRevsWithinStep(approachEnd, 0, 1, "wedding_default", "mixed");
const revRetreatMid = getRevsWithinStep(retreatMid, 0, 1, "wedding_default", "mixed");
ok("mixed: approach ends positive", revApproachEnd > 0.5, String(revApproachEnd));
ok("mixed: retreat reverses spin", revRetreatMid < revApproachEnd, `${revRetreatMid} < ${revApproachEnd}`);

const revStep1Approach = getRevsWithinStep(getFanApproachMs(1), 1, 1, "wedding_default", "mixed");
ok("mixed: step1 approach opposes step0", revStep1Approach < 0, String(revStep1Approach));

const fx = {
  cubeHeartbeatEnabled: true,
  cubeShowcaseZoomEnabled: true,
  cubeSubjectPullEnabled: false,
};
const hold = sampleFanCubeMotion(0, showcaseMid, 4, 6, 42, "mixed", "wedding_default", 1, fx);
ok("showcase heartbeat focus pulse", (hold.focusPulse ?? 0) > 0.05, String(hold.focusPulse));

const handoffT =
  getFanApproachMs(0) +
  getFanShowcaseHoldMs(0) +
  getFanRetreatMs() +
  FAN_GAP_MS * 0.5;
const handoff = sampleFanCubeMotion(0, handoffT, 4, 6, 42, "mixed", "wedding_default", 1, fx);
ok(
  "handoff scale breathes",
  handoff.presentationScale >= 0.418 && handoff.presentationScale < 0.43,
  String(handoff.presentationScale)
);

const endRevs = getAccumulatedRevs(
  getFanApproachMs(0) + getFanShowcaseHoldMs(0) + getFanRetreatMs() + FAN_GAP_MS,
  0,
  1,
  "wedding_default",
  "mixed"
);
ok("mixed: net spin per step is small", Math.abs(endRevs) < 1.2, String(endRevs));

if (process.exitCode) {
  process.exit(1);
}
console.log("verify-fan-heartbeat-bidirectional: OK");
