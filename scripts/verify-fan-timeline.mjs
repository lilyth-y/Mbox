/**
 * Smoke test: fan-blade cube timeline constants and scale/phase invariants.
 *   npx tsx scripts/verify-fan-timeline.mjs
 */
import {
  FAN_APPROACH_MS,
  FAN_OPENING_HOLD_MS,
  FAN_SCALE_PEAK,
  FAN_SCALE_RETREAT,
  FAN_SHOWCASE_HOLD_MS,
  FAN_RETREAT_MS,
  FAN_GAP_MS,
} from "../apps/web/src/features/cube/fanTiming.ts";
import {
  getFanStepSegmentMs,
  resolveFanPhase,
  sampleFanCubeMotion,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { getStepSegmentMs } from "../apps/web/src/features/cube/cubeMotionVariety.ts";

const checks = [];

function ok(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`[${pass ? "OK" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
}

const step0Ms = getFanStepSegmentMs(0);
const step1Ms = getFanStepSegmentMs(1);
ok(
  "step0 longer showcase than step1+",
  step0Ms - step1Ms === FAN_OPENING_HOLD_MS - FAN_SHOWCASE_HOLD_MS,
  `Δ=${step0Ms - step1Ms}`,
);
ok("step1 segment uses fan timeline", getStepSegmentMs(0, 1, 900, 2400, "cube_focus", 3) === step1Ms);

const holdT = FAN_APPROACH_MS + FAN_OPENING_HOLD_MS * 0.5;
const zoomFx = {
  cubeHeartbeatEnabled: false,
  cubeShowcaseZoomEnabled: true,
  cubeSubjectPullEnabled: false,
};
const hold = sampleFanCubeMotion(0, holdT, 4, 3, 42, "mixed", "wedding_default", 1, zoomFx);
ok("showcase hold scale ≈ 105%", Math.abs(hold.presentationScale - FAN_SCALE_PEAK) < 0.02 * FAN_SCALE_PEAK);
ok("showcase hold parallax > 0 at center", hold.parallaxAmount > 0.08, String(hold.parallaxAmount));

const retreatEnd = sampleFanCubeMotion(
  0,
  FAN_APPROACH_MS + FAN_OPENING_HOLD_MS + FAN_RETREAT_MS - 1,
  4,
  3,
  42,
  "mixed",
  "wedding_default",
  1,
  zoomFx,
);
ok(
  "retreat end scale ≈ 80%",
  Math.abs(retreatEnd.presentationScale - FAN_SCALE_RETREAT) < 0.03,
  String(retreatEnd.presentationScale),
);

const step1Showcase = resolveFanPhase(1, FAN_APPROACH_MS + 400);
ok("step>0 has showcase_hold phase", step1Showcase.phase === "showcase_hold", step1Showcase.phase);

const handoff = resolveFanPhase(1, FAN_APPROACH_MS + FAN_SHOWCASE_HOLD_MS + FAN_RETREAT_MS + 200);
ok("handoff phase exists", handoff.phase === "handoff", handoff.phase);

const failed = checks.filter((c) => !c.pass);
if (failed.length > 0) {
  console.error(JSON.stringify({ ok: false, failed }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, step0Ms, step1Ms }, null, 2));
