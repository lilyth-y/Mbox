import { HOLOGRAM_DISPLAY_SPEC } from "@mbox/shared";

import {
  getPhotoCrystalFramingExtent,
  getPhotoCrystalPullPhotoExtent,
  PHOTO_CRYSTAL_SHAPES,
  type PhotoCrystalShapeId,
} from "./babylon/photoCrystalShapeCatalog";
import { computePhotoCrystalPortraitLayout } from "./babylon/photoCrystalPortraitLayout";
import { getShapeInnerPhotoAnchor } from "./babylon/photoCrystalShapeGeometry";
import { getInnerCubePhotoSize } from "./babylon/jewelPhotoInnerMesh";
import { OUTER_SIZE } from "./babylon/jewelCubeMaterials";
import {
  getJewelPhotoRasterPullExtent,
  resolveJewelPhotoRasterSpec,
} from "./babylon/jewelPhotoRasterSpec";
import type { ShowcaseCatalogOptions } from "./showcaseCatalogOptions";
import {
  DEFAULT_SHOWCASE_PIPELINE_CONFIG,
  type ShowcasePipelineConfig,
  type ShowcasePipelineSnapshot,
} from "./pipeline/types";

export const SHOWCASE_SHAPE_IDS = PHOTO_CRYSTAL_SHAPES.map((s) => s.id);

export type ShowcaseShapeAcceptanceCheck = {
  id: string;
  pass: boolean;
  detail?: string;
};

export type ShowcaseShapeStaticAcceptance = {
  shapeId: PhotoCrystalShapeId;
  passed: boolean;
  checks: ShowcaseShapeAcceptanceCheck[];
};

export type ShowcaseShapeRuntimeAcceptance = {
  shapeId: PhotoCrystalShapeId;
  passed: boolean;
  checks: ShowcaseShapeAcceptanceCheck[];
  snapshot?: ShowcasePipelineSnapshot;
  canvas?: { centerLuma: number; colorVariance: number; width: number; height: number };
};

export type ShowcaseShapeAuditResult = ShowcaseShapeRuntimeAcceptance & {
  staticPassed: boolean;
};

declare global {
  interface Window {
    __MBOX_SHOWCASE_E2E__?: boolean;
    __MBOX_SHOWCASE_SHAPE_AUDIT__?: () => ShowcaseShapeAuditResult;
  }
}

/** Pull hold window — middle of hold is the best-shot frame. */
export function computeShowcasePullHoldWindow(
  config: ShowcasePipelineConfig = DEFAULT_SHOWCASE_PIPELINE_CONFIG
): { pullEndMs: number; pullHoldEndMs: number; pullHoldMidMs: number } {
  const lead = config.pullSpinLeadMs;
  const zoomStartMs = lead * config.pullZoomLeadOverlap;
  const zoomDuration = lead - zoomStartMs + config.pullDurationMs;
  const pullEndMs = zoomStartMs + zoomDuration;
  const pullHoldEndMs = pullEndMs + config.pullHoldMs;
  const pullHoldMidMs = pullEndMs + config.pullHoldMs * 0.5;
  return { pullEndMs, pullHoldEndMs, pullHoldMidMs };
}

/** Elapsed ms (no-fall pipeline, ≥2 photos) when pull hold midpoint is reached. */
export function computeShowcasePullHoldMidElapsedMs(
  config: ShowcasePipelineConfig = DEFAULT_SHOWCASE_PIPELINE_CONFIG,
  imageCount = 3
): number {
  let ms = config.revealHoldMs + config.rotateDurationMs;
  if (imageCount > 1) {
    ms += config.morphDurationMs;
  }
  return ms + computeShowcasePullHoldWindow(config).pullHoldMidMs;
}

function resolveEffectivePhotoLayout(
  shapeId: PhotoCrystalShapeId,
  photoLayout: ShowcaseCatalogOptions["photoLayout"]
): "cube" | "portrait" {
  if (photoLayout !== "auto") {
    return photoLayout;
  }
  const shape = PHOTO_CRYSTAL_SHAPES.find((s) => s.id === shapeId)!;
  return shape.photoMode;
}

export function evaluateShowcaseShapeStaticAcceptance(
  shapeId: PhotoCrystalShapeId,
  photoLayout: ShowcaseCatalogOptions["photoLayout"] = "auto"
): ShowcaseShapeStaticAcceptance {
  const checks: ShowcaseShapeAcceptanceCheck[] = [];
  const shape = PHOTO_CRYSTAL_SHAPES.find((s) => s.id === shapeId)!;
  const layout = resolveEffectivePhotoLayout(shapeId, photoLayout);
  const anchor = getShapeInnerPhotoAnchor(shapeId);

  const framingExtent = getPhotoCrystalFramingExtent(shapeId);
  checks.push({
    id: "framing_extent",
    pass: framingExtent > OUTER_SIZE * 0.55,
    detail: `extent=${framingExtent.toFixed(3)}`,
  });

  checks.push({
    id: "pull_framing_fill",
    pass:
      shape.pullFramingFill >= 0.45 &&
      shape.pullFramingFill <= HOLOGRAM_DISPLAY_SPEC.pullPhotoViewportFill + 0.05,
    detail: `fill=${shape.pullFramingFill.toFixed(3)}`,
  });

  const raster = resolveJewelPhotoRasterSpec(shapeId, photoLayout);
  checks.push({
    id: "raster_dimensions",
    pass: raster.width >= 64 && raster.height >= 64,
    detail: `${raster.width}x${raster.height}`,
  });

  const pullExtent = getJewelPhotoRasterPullExtent(shapeId, photoLayout);
  checks.push({
    id: "pull_photo_extent",
    pass: pullExtent > 0.35,
    detail: `extent=${pullExtent.toFixed(3)}`,
  });

  if (layout === "cube") {
    const cubePhoto = getInnerCubePhotoSize(shapeId);
    checks.push({
      id: "cube_photo_size",
      pass: cubePhoto > 0.5,
      detail: `size=${cubePhoto.toFixed(3)}`,
    });
  } else {
    const plate = computePhotoCrystalPortraitLayout(shapeId);
    const aspect = plate.width / Math.max(plate.height, 0.001);
    const aspectDelta = Math.abs(aspect - shape.portraitAspect);
    checks.push({
      id: "portrait_plate_size",
      pass: plate.width > 0.08 && plate.height > 0.08,
      detail: `${plate.width.toFixed(3)}x${plate.height.toFixed(3)}`,
    });
    checks.push({
      id: "portrait_aspect",
      pass: aspectDelta < 0.12,
      detail: `aspect=${aspect.toFixed(3)} target=${shape.portraitAspect}`,
    });
    checks.push({
      id: "portrait_fits_cavity",
      pass:
        plate.width <= anchor.maxWidth * anchor.fill * 1.02 &&
        plate.height <= anchor.maxHeight * anchor.fill * 1.02,
      detail: `max=${anchor.maxWidth.toFixed(3)}x${anchor.maxHeight.toFixed(3)}`,
    });

    if (anchor.useCircleFit) {
      const hw = plate.width * 0.5;
      const hh = plate.height * 0.5;
      const radius = Math.min(anchor.maxWidth, anchor.maxHeight) * 0.5 * anchor.fill;
      checks.push({
        id: "portrait_circle_fit",
        pass: Math.hypot(hw, hh) <= radius * 1.02,
        detail: `dist=${Math.hypot(hw, hh).toFixed(3)} R=${radius.toFixed(3)}`,
      });
    }
  }

  const heroExtent = getPhotoCrystalPullPhotoExtent(shapeId, layout);
  checks.push({
    id: "hero_pull_extent",
    pass: heroExtent > 0.35,
    detail: `hero=${heroExtent.toFixed(3)}`,
  });

  return {
    shapeId,
    passed: checks.every((c) => c.pass),
    checks,
  };
}

export function sampleShowcaseCanvasMetrics(canvas: HTMLCanvasElement): {
  centerLuma: number;
  colorVariance: number;
  width: number;
  height: number;
  /** Highest-variance patch — tall shapes may not sit at viewport center. */
  peakVariance: number;
  peakLuma: number;
} | null {
  const w = canvas.width;
  const h = canvas.height;
  if (w < 32 || h < 32) {
    return null;
  }

  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.drawImage(canvas, 0, 0);

  const patchSize = Math.max(24, Math.floor(Math.min(w, h) * 0.16));
  const grid = 5;
  const xs = Array.from({ length: grid }, (_, i) =>
    Math.floor((i / (grid - 1)) * Math.max(w - patchSize, 1))
  );
  const ys = Array.from({ length: grid }, (_, i) =>
    Math.floor((i / (grid - 1)) * Math.max(h - patchSize, 1))
  );

  let centerLuma = 0;
  let colorVariance = 0;
  let peakVariance = 0;
  let peakLuma = 0;

  const cx = Math.floor((w - patchSize) * 0.5);
  const cy = Math.floor((h - patchSize) * 0.5);

  for (const x of xs) {
    for (const y of ys) {
      const data = ctx.getImageData(x, y, patchSize, patchSize).data;
      const n = data.length / 4;
      let lumaSum = 0;
      let lumaSqSum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const luma = data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722;
        lumaSum += luma;
        lumaSqSum += luma * luma;
      }
      const luma = lumaSum / n;
      const variance = Math.max(0, lumaSqSum / n - luma * luma);
      if (variance > peakVariance) {
        peakVariance = variance;
        peakLuma = luma;
      }
      if (x === cx && y === cy) {
        centerLuma = luma;
        colorVariance = variance;
      }
    }
  }

  return {
    centerLuma,
    colorVariance,
    width: w,
    height: h,
    peakVariance,
    peakLuma,
  };
}

export function evaluateShowcaseShapeRuntimeAcceptance(input: {
  shapeId: PhotoCrystalShapeId;
  snapshot: ShowcasePipelineSnapshot;
  rigShapeId?: string | null;
  canvas: HTMLCanvasElement | null;
  config?: ShowcasePipelineConfig;
}): ShowcaseShapeRuntimeAcceptance {
  const checks: ShowcaseShapeAcceptanceCheck[] = [];
  const { pullEndMs, pullHoldEndMs } = computeShowcasePullHoldWindow(input.config);

  checks.push({
    id: "rig_shape_match",
    pass: input.rigShapeId === input.shapeId,
    detail: `rig=${input.rigShapeId ?? "null"}`,
  });

  checks.push({
    id: "pull_hold_phase",
    pass:
      input.snapshot.stageId === "pull" &&
      input.snapshot.phaseElapsedMs >= pullEndMs &&
      input.snapshot.phaseElapsedMs <= pullHoldEndMs,
    detail: `stage=${input.snapshot.stageId} phase=${Math.round(input.snapshot.phaseElapsedMs)} pullEnd=${pullEndMs}`,
  });

  let canvasMetrics: ReturnType<typeof sampleShowcaseCanvasMetrics> = null;
  if (input.canvas) {
    canvasMetrics = sampleShowcaseCanvasMetrics(input.canvas);
  }

  checks.push({
    id: "canvas_visible",
    pass:
      canvasMetrics !== null &&
      (canvasMetrics.centerLuma > 14 || canvasMetrics.peakLuma > 14),
    detail: canvasMetrics
      ? `center=${canvasMetrics.centerLuma.toFixed(1)} peak=${canvasMetrics.peakLuma.toFixed(1)}`
      : "no sample",
  });

  const detailVariance = canvasMetrics
    ? Math.max(canvasMetrics.colorVariance, canvasMetrics.peakVariance)
    : 0;
  checks.push({
    id: "photo_detail",
    pass: canvasMetrics !== null && detailVariance > 120,
    detail: canvasMetrics ? `var=${detailVariance.toFixed(0)}` : "no sample",
  });

  return {
    shapeId: input.shapeId,
    passed: checks.every((c) => c.pass),
    checks,
    snapshot: input.snapshot,
    canvas: canvasMetrics ?? undefined,
  };
}

export function auditShowcaseShapeRuntime(input: {
  shapeId: PhotoCrystalShapeId;
  snapshot: ShowcasePipelineSnapshot;
  rigShapeId?: string | null;
  canvas: HTMLCanvasElement | null;
  photoLayout?: ShowcaseCatalogOptions["photoLayout"];
}): ShowcaseShapeAuditResult {
  const staticResult = evaluateShowcaseShapeStaticAcceptance(
    input.shapeId,
    input.photoLayout ?? "auto"
  );
  const runtime = evaluateShowcaseShapeRuntimeAcceptance({
    shapeId: input.shapeId,
    snapshot: input.snapshot,
    rigShapeId: input.rigShapeId,
    canvas: input.canvas,
  });

  return {
    ...runtime,
    staticPassed: staticResult.passed,
    passed: staticResult.passed && runtime.passed,
    checks: [
      ...staticResult.checks.map((c) => ({ ...c, id: `static:${c.id}` })),
      ...runtime.checks.map((c) => ({ ...c, id: `live:${c.id}` })),
    ],
  };
}
