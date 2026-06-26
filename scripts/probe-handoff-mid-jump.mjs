#!/usr/bin/env node
import * as THREE from "three";
import { sampleFanCubeMotion } from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";
import { resolveFanPhase } from "../apps/web/src/features/cube/fanTiming.ts";

const fx = resolveCubeShowcaseFx({ cubeShowcaseZoomEnabled: false });
const step = 5;
let prev = null;
for (let el = 8870; el <= 8930; el += 2) {
  const m = sampleFanCubeMotion(step, el, getPresentationFace(step), 6, 42, "auto", "wedding_default", 1, fx, false);
  const ph = resolveFanPhase(step, el);
  let d = 0;
  if (prev) {
    d = new THREE.Quaternion().setFromEuler(prev.rotation).angleTo(new THREE.Quaternion().setFromEuler(m.rotation));
  }
  if (d > 0.08) {
    console.log(`el=${el} phase=${ph.phase} u=${ph.phaseU.toFixed(4)} dRot=${d.toFixed(4)} pitch=${m.rotation.x.toFixed(4)} yaw=${m.rotation.y.toFixed(4)}`);
  }
  prev = m;
}
