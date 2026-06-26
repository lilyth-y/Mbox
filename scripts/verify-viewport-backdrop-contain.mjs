#!/usr/bin/env node
import {
  computeBackdropContainTransform,
  computeBackdropCoverTransform,
} from "../apps/web/src/features/showcase/babylon/showcaseBackdropCover.ts";

function ok(name, pass, detail = "") {
  console.log(`[${pass ? "OK" : "FAIL"}] ${name}${detail ? `: ${detail}` : ""}`);
  if (!pass) process.exitCode = 1;
}

// 16:9 media in square viewport — contain shows full frame (letterbox), cover crops.
const mediaAspect = 16 / 9;
const viewAspect = 1;
const contain = computeBackdropContainTransform(mediaAspect, viewAspect);
const cover = computeBackdropCoverTransform(mediaAspect, viewAspect);

ok("contain keeps full width", contain.uScale === 1 && contain.vScale < 1, JSON.stringify(contain));
ok("cover crops width", cover.uScale < 1 && cover.vScale === 1, JSON.stringify(cover));
ok("contain letterbox sum", contain.vOffset * 2 + contain.vScale, 1, String(contain.vOffset * 2 + contain.vScale));

if (process.exitCode) process.exit(1);
console.log("verify-viewport-backdrop-contain: OK");
