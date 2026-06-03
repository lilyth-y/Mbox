#!/usr/bin/env tsx
/**
 * Verify Photo Slideshow 3D timeline: segment length, showcase strength.
 */
import {
  getPhotoSlideshow3dStepSegmentMs,
  samplePhotoSlideshow3dMotion,
  PHOTO_SLIDESHOW_STEP_MS,
} from "../apps/web/src/features/cube/photoSlideshow3dTimeline";

const presentationCount = 4;
const motionSeed = 42;

let ok = true;

const segmentMs = getPhotoSlideshow3dStepSegmentMs(0);
if (segmentMs !== PHOTO_SLIDESHOW_STEP_MS) {
  console.error(`segment ms mismatch: ${segmentMs} !== ${PHOTO_SLIDESHOW_STEP_MS}`);
  ok = false;
}

for (let step = 0; step < presentationCount - 1; step += 1) {
  const end = samplePhotoSlideshow3dMotion(step, segmentMs - 1, presentationCount, motionSeed);
  const start = samplePhotoSlideshow3dMotion(step + 1, 0, presentationCount, motionSeed);
  const dy = Math.abs(end.rotation.y - start.rotation.y);
  const dz = Math.abs(end.position.z - start.position.z);
  const ds = Math.abs(end.presentationScale - start.presentationScale);
  if (dy > 0.2 || dz > 0.25 || ds > 0.15) {
    console.warn(
      `handoff ${step}→${step + 1}: rotY Δ=${dy.toFixed(3)} posZ Δ=${dz.toFixed(3)} scale Δ=${ds.toFixed(3)}`
    );
  }
}

const midShowcase = samplePhotoSlideshow3dMotion(
  1,
  Math.round(PHOTO_SLIDESHOW_STEP_MS * 0.45),
  presentationCount,
  motionSeed
);
if (midShowcase.parallaxAmount < 0.25 || midShowcase.focusPulse < 0.4) {
  console.error("showcase parallax/focus too weak", midShowcase);
  ok = false;
}

console.log(
  JSON.stringify(
    {
      ok,
      segmentMs,
      showcaseSample: {
        parallax: +midShowcase.parallaxAmount.toFixed(3),
        focusPulse: +midShowcase.focusPulse.toFixed(3),
        scale: +midShowcase.presentationScale.toFixed(3),
      },
    },
    null,
    2
  )
);

process.exit(ok ? 0 : 1);
