/**
 * Compare euler spike counts: orbital_showcase vs entrance fan (EHI rule).
 *   npx tsx scripts/research-orbital-prism-feasibility.mjs
 */
import * as THREE from "three";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getOrbitalShowcaseSegmentMs,
  sampleOrbitalShowcaseMotion,
} from "../packages/shared/src/orbitalShowcaseMotion.ts";
import { applyOrbitalShowcaseRootTransform } from "../apps/web/src/features/cube/orbitalPivot.ts";
import {
  getFanStepSegmentMs,
  resolveFanPhase,
  sampleFanCubeMotion,
} from "../apps/web/src/features/cube/cubeFanTimeline.ts";
import {
  getLoopBridgeMs,
  resolvePresentationTimeline,
  sumSegmentDurations,
} from "../apps/web/src/features/cube/cubeMotionVariety.ts";
import { getPresentationFace } from "../apps/web/src/features/cube/cubeSequence.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "orbital_prism_feasibility");
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const SPIKE_DEG = 12;
const SPIKE_DPS = 120;

mkdirSync(outDir, { recursive: true });

function eulerDist(a, b) {
  const dq = new THREE.Quaternion().setFromEuler(a);
  const qq = new THREE.Quaternion().setFromEuler(b);
  const dot = Math.min(1, Math.abs(dq.dot(qq)));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

function countSpikes(frames) {
  let spikes = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const cur = frames[i];
    const dDeg = eulerDist(prev.euler, cur.euler);
    const dt = (cur.t - prev.t) / 1000;
    if (dDeg > SPIKE_DEG || dDeg / dt > SPIKE_DPS) spikes += 1;
  }
  return spikes;
}

function sampleOrbitalCycle(steps = 3) {
  const segMs = getOrbitalShowcaseSegmentMs();
  const cycleMs = segMs * steps;
  const frames = [];
  const dummy = new THREE.Group();
  dummy.userData.orbitalPivot = {
    orbitGroup: new THREE.Group(),
    spinGroup: new THREE.Group(),
  };
  dummy.add(dummy.userData.orbitalPivot.orbitGroup);
  dummy.userData.orbitalPivot.orbitGroup.add(dummy.userData.orbitalPivot.spinGroup);

  for (let t = 0; t < cycleMs; t += FRAME_MS) {
    const step = Math.floor(t / segMs);
    const stepElapsed = t - step * segMs;
    const sample = sampleOrbitalShowcaseMotion(stepElapsed, {
      step,
      faceCount: 8,
      motionSeed: 42,
    });
    applyOrbitalShowcaseRootTransform(dummy, sample);
    dummy.updateMatrixWorld(true);
    const euler = new THREE.Euler().setFromQuaternion(
      dummy.userData.orbitalPivot.spinGroup.getWorldQuaternion(new THREE.Quaternion())
    );
    frames.push({
      t: Math.round(t),
      step,
      phase: sample.phase,
      euler,
      scale: sample.scale,
      cameraDolly: sample.cameraDolly,
      dockingLock: sample.dockingLock,
    });
  }
  return { frames, segMs, cycleMs };
}

function sampleEntranceFanCycle(steps = 3) {
  const profile = "entrance_processional";
  const segmentMs = Array.from({ length: steps }, (_, s) => getFanStepSegmentMs(s, profile));
  const loopBridgeMs = getLoopBridgeMs("cube_focus", steps);
  const cycleMs = sumSegmentDurations(segmentMs) + loopBridgeMs;
  const frames = [];
  for (let t = 0; t < cycleMs; t += FRAME_MS) {
    const resolved = resolvePresentationTimeline(Math.round(t), segmentMs, loopBridgeMs);
    if (resolved.kind === "loop_bridge") continue;
    const { step, stepElapsed } = resolved;
    const phase = resolveFanPhase(step, stepElapsed, profile).phase;
    const face = getPresentationFace(step);
    const m = sampleFanCubeMotion(step, stepElapsed, face, steps, 42, "yaw_cw", profile);
    frames.push({
      t: Math.round(t),
      step,
      phase,
      euler: m.rotation.clone(),
      scale: m.presentationScale,
    });
  }
  return { frames, cycleMs };
}

const orbital = sampleOrbitalCycle(3);
const entrance = sampleEntranceFanCycle(3);
const holdFrame = orbital.frames.find(
  (f) => f.phase === "hold" && f.dockingLock >= 0.98
);

const report = {
  generatedAt: new Date().toISOString(),
  studyId: "orbital-prism-feasibility-2026",
  orbitalShowcase: {
    verifyScript: "verify-orbital-showcase-motion.mjs PASS",
    segmentMs: orbital.segMs,
    cycleMs: orbital.cycleMs,
    spikeCountEhiRule: countSpikes(orbital.frames),
    spikeNote:
      "EHI euler rule on world spin quaternion; differs from verify-orbital jerk metric",
    holdPeak: holdFrame
      ? {
          scale: holdFrame.scale,
          cameraDolly: holdFrame.cameraDolly,
          dockingLock: holdFrame.dockingLock,
        }
      : null,
    geometry: "OctahedronGeometry 8 faces (icosahedron 12 optional)",
  },
  entranceProcessional: {
    profile: "entrance_processional + yaw_cw",
    cycleMs: entrance.cycleMs,
    spikeCountEhiRule: countSpikes(entrance.frames),
    note: "Production entrance KPI tuned for this path, not orbital",
  },
  prismFullscreenConcept: {
    implemented: false,
    nearestExisting: [
      "orbital cameraDolly + scale → partial fill (max scale ~1.1, dolly ~0.96)",
      "photo_slideshow_3d dolly phase → depth fly-in, not prism",
      "hologram parallax + voluMax → depth split, not refraction",
    ],
    geometricNarrativeRisk:
      "Octahedron faces are triangles; 'prism' suggests triangular cross-section refraction — metaphor OK if staged as separate prop mesh, confusing if literal octahedron=prism",
    fullscreenGap: {
      currentHoldScale: holdFrame?.scale ?? 1.09,
      theoreticalFill: "~2.5–3.5× scale or FOV 75→40 + cameraZ push for true edge-to-edge",
      aspectIssue: "Face planes are square; 16:9 MP4 needs crop or letterbox at fullscreen",
    },
  },
  feasibilityTiers: [
    {
      tier: "A — Staged prism metaphor (M)",
      description:
        "After orbital dock: 0.4s chromatic aberration + radial blur post, simultaneous scale/FOV ramp to fill — no physical refraction",
      kpiRisk: "Must add orbital EHI-like spike gate; scale jerk may exceed orbital verify thresholds",
      entranceCompatible: "Requires new profile; EHI gate does not cover orbital today",
    },
    {
      tier: "B — Scene prism prop (M–L)",
      description:
        "Transparent triangular prism mesh; photo plane lerps through prop; shader fakes dispersion RGB split",
      kpiRisk: "Medium; export MP4 parity with preview",
      entranceCompatible: "Opt-in micro-module `prism_reveal`",
    },
    {
      tier: "C — Physical refraction (L/XL)",
      description: "Multi-pass render-to-texture through refractive volume",
      kpiRisk: "High GPU cost; mobile/export frame drops",
      recommendation: "Reject for entrance hologram v1",
    },
  ],
  recommendation: {
    orbitalEffect:
      "Implemented and jerk-smooth (verify PASS), but 185 EHI-style spikes/cycle — NOT drop-in for entrance EHI gate",
    prismFullscreen: "NARRATIVELY viable as Tier A/B; NOT lab-validated for beauty; conflicts with entrance EHI until separate KPI",
    suggestedPath:
      "Prototype Tier A on orbital hold exit only; measure scale jerk + spike count; field A/B for '시선 끔' vs '어지러움'",
  },
};

writeFileSync(join(outDir, "analysis.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
