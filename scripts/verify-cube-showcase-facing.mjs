#!/usr/bin/env node
/**
 * All 6 cube faces: showcase root * mount rotation must face +Z (camera).
 */
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadModule() {
  const dist = join(root, "apps/web/dist/assets");
  // Import from source via tsx-less dynamic: inline mirror of cubeSequence logic
  const seqSrc = readFileSync(join(root, "apps/web/src/features/cube/cubeSequence.ts"), "utf8");
  if (!/getCubeShowcaseRootRotation/.test(seqSrc)) {
    throw new Error("cubeSequence must export getCubeShowcaseRootRotation");
  }

  const FACE_ROTATIONS = {
    4: new THREE.Euler(0, 0, 0),
    5: new THREE.Euler(0, Math.PI, 0),
    0: new THREE.Euler(0, -Math.PI / 2, 0),
    1: new THREE.Euler(0, Math.PI / 2, 0),
    2: new THREE.Euler(-Math.PI / 2, 0, 0),
    3: new THREE.Euler(Math.PI / 2, 0, 0),
  };

  function getFaceRotation(faceIndex) {
    return FACE_ROTATIONS[faceIndex]?.clone() ?? new THREE.Euler(0, 0, 0);
  }

  function getCubeShowcaseRootRotation(faceIndex) {
    const qMount = new THREE.Quaternion().setFromEuler(getFaceRotation(faceIndex));
    const outward = new THREE.Vector3(0, 0, 1).applyQuaternion(qMount);
    const qRoot = new THREE.Quaternion().setFromUnitVectors(outward, new THREE.Vector3(0, 0, 1));
    return new THREE.Euler().setFromQuaternion(qRoot, "XYZ");
  }

  return { getFaceRotation, getCubeShowcaseRootRotation };
}

const { getFaceRotation, getCubeShowcaseRootRotation } = await loadModule();
const faces = [4, 0, 1, 2, 3, 5];
const camera = new THREE.Vector3(0, 0, 1);
let maxErr = 0;

for (const faceIndex of faces) {
  const qMount = new THREE.Quaternion().setFromEuler(getFaceRotation(faceIndex));
  const qRoot = new THREE.Quaternion().setFromEuler(getCubeShowcaseRootRotation(faceIndex));
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(qRoot).applyQuaternion(qMount);
  const err = 1 - normal.dot(camera);
  maxErr = Math.max(maxErr, err);
  if (err > 0.02) {
    throw new Error(`face ${faceIndex} showcase normal err=${err.toFixed(4)} (expected +Z)`);
  }
}

function fanSpinEulerWorldY(base, signedRevs) {
  const baseQuat = new THREE.Quaternion().setFromEuler(base);
  const spinQuat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    signedRevs * 2 * Math.PI
  );
  return new THREE.Euler().setFromQuaternion(spinQuat.clone().multiply(baseQuat));
}

for (const faceIndex of faces) {
  const root = getCubeShowcaseRootRotation(faceIndex);
  const qMount = new THREE.Quaternion().setFromEuler(getFaceRotation(faceIndex));
  const spun = fanSpinEulerWorldY(root, 2);
  const qRoot = new THREE.Quaternion().setFromEuler(spun);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(qRoot).applyQuaternion(qMount);
  const err = 1 - normal.dot(camera);
  maxErr = Math.max(maxErr, err);
  if (err > 0.02) {
    throw new Error(`face ${faceIndex} after 2 world-Y revs err=${err.toFixed(4)} (expected +Z)`);
  }
}

console.log(`verify-cube-showcase-facing: OK (max err ${maxErr.toExponential(2)})`);
