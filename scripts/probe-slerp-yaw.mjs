#!/usr/bin/env node
import * as THREE from "three";
import { slerpEuler } from "../apps/web/src/features/cube/cubeSequence.ts";

const retreat = new THREE.Euler(0, 0.1075, 0);
const handoff8908 = new THREE.Euler(0, -0.1137, 0);
const handoff8910 = new THREE.Euler(0, -0.1062, 0);

for (const t of [0.839, 0.8404, 0.8421, 0.8438, 0.845]) {
  const r = slerpEuler(retreat, handoff8910, t);
  console.log(`t=${t} y=${r.y.toFixed(4)}`);
}

const q1 = new THREE.Quaternion().setFromEuler(retreat);
const q2 = new THREE.Quaternion().setFromEuler(handoff8910);
console.log("retreat-handoff angle deg", (q1.angleTo(q2) * 180) / Math.PI);
