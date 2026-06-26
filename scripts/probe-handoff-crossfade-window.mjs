#!/usr/bin/env node
import { getFanApproachMs, getFanShowcaseHoldMs, getFanRetreatMs, FAN_GAP_MS, resolveFanPhase } from "../apps/web/src/features/cube/fanTiming.ts";
import { getPhaseCrossfadeMs } from "../apps/web/src/features/cube/fanPhaseCrossfade.ts";

const step = 5;
const approachMs = getFanApproachMs(step) / 1;
const showcaseMs = getFanShowcaseHoldMs(step) / 1;
const retreatMs = getFanRetreatMs() / 1;
const gapMs = FAN_GAP_MS / 1;
const handoffStart = approachMs + showcaseMs + retreatMs;
const crossMs = getPhaseCrossfadeMs(1);

console.log({ approachMs, showcaseMs, retreatMs, gapMs, handoffStart, crossMs });
console.log("handoff crossfade ends at stepElapsed", handoffStart + crossMs);

for (const el of [8905, 8908, 8909, 8910, 8915, handoffStart + crossMs - 1, handoffStart + crossMs, handoffStart + crossMs + 1]) {
  const ph = resolveFanPhase(step, el);
  console.log(`el=${el} phase=${ph.phase} phaseEl=${ph.phaseElapsed} u=${ph.phaseU.toFixed(4)}`);
}
