#!/usr/bin/env node
import * as THREE from "three";
import { sampleFanCubeMotion } from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";
import { resolveFanPhase } from "../apps/web/src/features/cube/fanTiming.ts";

const fx = resolveCubeShowcaseFx({ cubeShowcaseZoomEnabled: false });
const step = 5;
for (let el = 8898; el <= 8922; el += 1) {
  const m = sampleFanCubeMotion(step, el, getPresentationFace(step), 6, 42, "auto", "wedding_default", 1, fx, false);
  const ph = resolveFanPhase(step, el);
  console.log(
    `el=${el} u=${ph.phaseU.toFixed(5)} yaw=${m.rotation.y.toFixed(5)} scale=${m.presentationScale.toFixed(4)}`
  );
}
