import * as THREE from "three";
import { sampleFanCubeMotion, computeFanLoopBridgeFrame, getFanStepSegmentMs } from "../apps/web/src/features/cube/cubeFanTimeline";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence";

function angleBetween(a, b) {
  const qa = new THREE.Quaternion().setFromEuler(a).normalize();
  const qb = new THREE.Quaternion().setFromEuler(b).normalize();
  const dot = Math.abs(qa.dot(qb));
  const clamped = Math.min(1, Math.max(-1, dot));
  return 2 * Math.acos(clamped) * (180 / Math.PI);
}

// Default probe: 6 faces (0..5), loop bridge entry at step 5 end → bridgeElapsed=0.
const presentationCount = 6;
const lastStep = presentationCount - 1;
const motionSeed = 0;
const rotationMode = "mixed";
const profile = "wedding_default";
const speedMul = 1;
const fx = {
  cubeHeartbeatEnabled: false,
  cubeShowcaseZoomEnabled: true,
  cubeComplexRotationEnabled: true,
  cubeSubjectPullEnabled: true,
  cubeScaleCoupledSpinEnabled: true,
  cubeZoomIntensity: 1,
  cubeComplexRotationIntensity: 1,
  cubeAcceleratedSpinIntensity: 1,
  cubeSubjectPullIntensity: 1,
  cubeHeartbeatIntensity: 1,
};

const totalStepMs = getFanStepSegmentMs(lastStep, profile, speedMul);
const endSample = sampleFanCubeMotion(
  lastStep,
  Math.max(0, totalStepMs - 1),
  getPresentationFace(lastStep),
  presentationCount,
  motionSeed,
  rotationMode,
  profile,
  speedMul,
  fx,
  false
);

const bridge = computeFanLoopBridgeFrame(
  0,
  1200,
  lastStep,
  motionSeed,
  rotationMode,
  profile,
  speedMul,
  fx
);

const d = angleBetween(endSample.rotation, bridge.fanRootMotion.rotation);
console.log(`loop_bridge entry: Δθ=${d.toFixed(3)}° (step ${lastStep} end → bridgeElapsed=0)`);

