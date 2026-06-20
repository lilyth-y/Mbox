#!/usr/bin/env node

/**

 * Classic fan (zoom off): showcase faces camera; phase seams stay continuous.

 */

import { spawnSync } from "node:child_process";

import { writeFileSync, unlinkSync } from "node:fs";

import { dirname, join } from "node:path";

import { fileURLToPath } from "node:url";



const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const tmp = join(root, "scripts", ".verify-main-approach-facing.ts");



const script = `import * as THREE from "three";

import { sampleFanCubeMotion } from "../apps/web/src/features/cube/cubeFanTimeline.ts";

import { getPresentationFace, getFaceRotation } from "../apps/web/src/features/cube/cubeSequence.ts";

import {

  getFanApproachMs,

  getFanShowcaseHoldMs,

  getFanRetreatMs,

  FAN_GAP_MS,

} from "../apps/web/src/features/cube/fanTiming.ts";



const fx = {

  cubeHeartbeatEnabled: false,

  cubeShowcaseZoomEnabled: false,

  cubeComplexRotationEnabled: false,

  cubeSubjectPullEnabled: false,

  cubeScaleCoupledSpinEnabled: false,

};



function dotZ(euler: THREE.Euler, faceIndex: number) {

  const qRoot = new THREE.Quaternion().setFromEuler(euler);

  const qMount = new THREE.Quaternion().setFromEuler(getFaceRotation(faceIndex));

  return new THREE.Vector3(0, 0, 1).applyQuaternion(qRoot).applyQuaternion(qMount).z;

}



function eulerDelta(a: THREE.Euler, b: THREE.Euler) {

  const qa = new THREE.Quaternion().setFromEuler(a);

  const qb = new THREE.Quaternion().setFromEuler(b);

  return qa.angleTo(qb);

}



const holdOk = 0.85;

const seamOk = 0.12;

let failed = false;

for (const step of [0, 1, 2, 3, 4, 5]) {

  const face = getPresentationFace(step);

  const approachMs = getFanApproachMs(step);

  const showcaseMs = getFanShowcaseHoldMs(step);

  const retreatMs = getFanRetreatMs();

  const gapMs = FAN_GAP_MS;

  const seams = [

    ["approach→showcase", approachMs - 2, approachMs + 2],

    ["showcase→retreat", approachMs + showcaseMs - 2, approachMs + showcaseMs + 2],

    ["retreat→handoff", approachMs + showcaseMs + retreatMs - 2, approachMs + showcaseMs + retreatMs + 2],

  ] as const;

  let maxSeam = 0;

  for (const [, a, b] of seams) {

    const sa = sampleFanCubeMotion(step, a, face, 6, 0, "auto", "wedding_default", 1, fx);

    const sb = sampleFanCubeMotion(step, b, face, 6, 0, "auto", "wedding_default", 1, fx);

    maxSeam = Math.max(maxSeam, eulerDelta(sa.rotation, sb.rotation));

  }

  const hold = sampleFanCubeMotion(step, approachMs + showcaseMs * 0.5, face, 6, 0, "auto", "wedding_default", 1, fx);

  const holdDot = dotZ(hold.rotation, face);

  if (maxSeam > seamOk || holdDot < holdOk) {

    console.error(

      \`FAIL step \${step} maxSeam=\${maxSeam.toFixed(4)} hold=\${holdDot.toFixed(4)}\`

    );

    failed = true;

  } else {

    console.log(

      \`OK step \${step} maxSeam=\${maxSeam.toFixed(4)} hold=\${holdDot.toFixed(4)}\`

    );

  }

}

if (failed) process.exit(1);

console.log("verify-main-approach-facing: OK");

`;



writeFileSync(tmp, script, "utf8");

const result = spawnSync("npx", ["tsx", tmp], { cwd: root, stdio: "inherit", shell: true });

try {

  unlinkSync(tmp);

} catch {

  /* ignore */

}

process.exit(result.status ?? 1);

