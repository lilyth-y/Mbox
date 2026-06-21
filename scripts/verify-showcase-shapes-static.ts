/**
 * Tier-1 shape acceptance — geometry, portrait layout, raster spec (no browser).
 *
 *   npx tsx scripts/verify-showcase-shapes-static.ts
 */
import {
  evaluateShowcaseShapeStaticAcceptance,
  SHOWCASE_SHAPE_IDS,
} from "../apps/web/src/features/showcase/showcaseShapeAcceptance.ts";

const results = SHOWCASE_SHAPE_IDS.map((shapeId) =>
  evaluateShowcaseShapeStaticAcceptance(shapeId, "auto")
);

const passed = results.filter((r) => r.passed).length;
const total = results.length;

for (const result of results) {
  const status = result.passed ? "OK" : "FAIL";
  const failed = result.checks.filter((c) => !c.pass).map((c) => c.id);
  console.log(
    `${status} ${result.shapeId}${failed.length ? ` — ${failed.join(", ")}` : ""}`
  );
}

console.log(`\nstatic acceptance: ${passed}/${total}`);

if (passed !== total) {
  process.exit(1);
}
