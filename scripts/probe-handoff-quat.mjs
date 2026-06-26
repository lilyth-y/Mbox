#!/usr/bin/env node
import * as THREE from "three";
import { sampleFanCubeMotion } from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";
import { resolveCubeShowcaseFx } from "../packages/shared/src/cubeShowcaseFx.ts";

const fx = resolveCubeShowcaseFx({ cubeShowcaseZoomEnabled: false });
const step = 5;
for (const el of [8908, 8909, 8910, 8911]) {
  const m = sampleFanCubeMotion(step, el, getPresentationFace(step), 6, 42, "auto", "wedding_default", 1, fx, false);
  const q = new THREE.Quaternion().setFromEuler(m.rotation);
  console.log(`el=${el} euler y=${m.rotation.y.toFixed(5)} quat=`, q.x.toFixed(4), q.y.toFixed(4), q.z.toFixed(4), q.w.toFixed(4));
}
const a = sampleFanCubeMotion(step, 8909, getPresentationFace(step), 6, 42, "auto", "wedding_default", 1, fx, false);
const b = sampleFanCubeMotion(step, 8910, getPresentationFace(step), 6, 42, "auto", "wedding_default", 1, fx, false);
const qa = new THREE.Quaternion().setFromEuler(a.rotation);
const qb = new THREE.Quaternion().setFromEuler(b.rotation);
console.log("quat angle deg", (qa.angleTo(qb) * 180) / Math.PI);
