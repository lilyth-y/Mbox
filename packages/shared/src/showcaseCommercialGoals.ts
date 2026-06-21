/**
 * Commercial launch goal program — measurable KPIs per gate (/goal skill).
 * Runner: scripts/showcase-commercial-goals.mjs
 */

import type { ShowcaseStageMaturity } from "./showcaseCommercialSpec.js";
import { stageMeetsMaturity } from "./showcaseCommercialSpec.js";

export type ShowcaseCommercialGoalId =
  | "stage_rc"
  | "stage_commercial"
  | "presets"
  | "wysiwyg_export"
  | "photo_corpus"
  | "photo_batch_100"
  | "motion_smooth"
  | "shapes_validated"
  | "booth_aspects";

export type ShowcaseCommercialGoalSpec = {
  id: ShowcaseCommercialGoalId;
  labelKo: string;
  /** How the KPI is measured (reproducible). */
  kpi: string;
  target: number;
  theoreticalBest: number;
  /** "ratio" | "count" — comparison uses >= for both. */
  unit: "ratio" | "count";
  order: number;
};

/** Ordered gates for commercial_launch. Master KPI = pass_count / gate_count. */
export const SHOWCASE_COMMERCIAL_GOALS: ShowcaseCommercialGoalSpec[] = [
  {
    id: "stage_rc",
    order: 1,
    labelKo: "스테이지 maturity ≥ rc",
    kpi: "active_pipeline_stages_at_rc_or_above / active_pipeline_stage_count",
    target: 1,
    theoreticalBest: 1,
    unit: "ratio",
  },
  {
    id: "stage_commercial",
    order: 2,
    labelKo: "스테이지 maturity ≥ commercial",
    kpi: "active_pipeline_stages_at_commercial_or_above / active_pipeline_stage_count",
    target: 1,
    theoreticalBest: 1,
    unit: "ratio",
  },
  {
    id: "presets",
    order: 3,
    labelKo: "판매 룩 프리셋",
    kpi: "commercial_look_preset_count",
    target: 3,
    theoreticalBest: 3,
    unit: "count",
  },
  {
    id: "wysiwyg_export",
    order: 4,
    labelKo: "1080 WYSIWYG export",
    kpi: "e2e_export_wysiwyg_passed (binary 1/0)",
    target: 1,
    theoreticalBest: 1,
    unit: "ratio",
  },
  {
    id: "photo_corpus",
    order: 5,
    labelKo: "QA 코퍼스 100장",
    kpi: "showcase_qa_corpus_image_count",
    target: 100,
    theoreticalBest: 100,
    unit: "count",
  },
  {
    id: "photo_batch_100",
    order: 6,
    labelKo: "100장 전시 합격률",
    kpi: "preset_only_pass_count / 100 on fixed corpus",
    target: 1,
    theoreticalBest: 1,
    unit: "ratio",
  },
  {
    id: "motion_smooth",
    order: 7,
    labelKo: "모션 zero-defect (스냅·등속· jerk)",
    kpi: "1 - (active_stage_known_motion_issues / active_stage_count)",
    target: 1,
    theoreticalBest: 1,
    unit: "ratio",
  },
  {
    id: "shapes_validated",
    order: 8,
    labelKo: "형상별 베스트샷 검증",
    kpi: "shapes_with_acceptance_tests / catalog_shape_count",
    target: 1,
    theoreticalBest: 1,
    unit: "ratio",
  },
  {
    id: "booth_aspects",
    order: 9,
    labelKo: "부스 종횡비 템플릿 (1:1·9:16·16:9)",
    kpi: "validated_export_aspect_templates / 3",
    target: 1,
    theoreticalBest: 1,
    unit: "ratio",
  },
];

export type ShowcaseCommercialGoalMeasurement = {
  id: ShowcaseCommercialGoalId;
  labelKo: string;
  kpi: string;
  target: number;
  theoreticalBest: number;
  unit: "ratio" | "count";
  measured: number | null;
  /** null = not run (e.g. e2e skipped). */
  result: "PASS" | "FAIL" | "SKIP";
  gap: string;
  notes?: string;
};

export type ShowcaseCommercialGoalRunInput = {
  activeStageMaturities: ShowcaseStageMaturity[];
  commercialPresetCount: number;
  /** 0/1 or undefined if e2e not run. */
  wysiwygPassed?: boolean;
  photoCorpusSize?: number;
  /** 0–1 on full corpus; undefined if batch not run. */
  measuredPhotoPassRate?: number;
  /** knownIssuesKo strings on active stages (motion-related). */
  motionKnownIssues: string[];
  shapesValidated?: number;
  shapesTotal?: number;
  boothAspectsValidated?: number;
  /** When true, photo_batch_100 gate is excluded (product waiver). */
  photoBatchWaived?: boolean;
};

export type ShowcaseCommercialGoalRunResult = {
  masterKpi: string;
  masterTarget: number;
  masterMeasured: number;
  masterResult: "PASS" | "FAIL";
  masterGap: string;
  currentBottleneck: ShowcaseCommercialGoalId | null;
  measurements: ShowcaseCommercialGoalMeasurement[];
  attemptLogHint: string;
};

const MOTION_ISSUE_PATTERN =
  /등속|스냅|jerk|stutter|튐|끊김|micro-stutter|offset/i;

function ratioPass(measured: number, target: number): boolean {
  return measured >= target - 1e-9;
}

function measureGoal(
  spec: ShowcaseCommercialGoalSpec,
  measured: number | null,
  notes?: string
): ShowcaseCommercialGoalMeasurement {
  if (measured === null) {
    return {
      id: spec.id,
      labelKo: spec.labelKo,
      kpi: spec.kpi,
      target: spec.target,
      theoreticalBest: spec.theoreticalBest,
      unit: spec.unit,
      measured: null,
      result: "SKIP",
      gap: "not measured",
      notes,
    };
  }

  const pass = ratioPass(measured, spec.target);
  const gapToTarget = spec.target - measured;
  const gapToBest = spec.theoreticalBest - measured;

  return {
    id: spec.id,
    labelKo: spec.labelKo,
    kpi: spec.kpi,
    target: spec.target,
    theoreticalBest: spec.theoreticalBest,
    unit: spec.unit,
    measured,
    result: pass ? "PASS" : "FAIL",
    gap: `Δtarget=${gapToTarget.toFixed(4)}, Δbest=${gapToBest.toFixed(4)}`,
    notes,
  };
}

export function evaluateShowcaseCommercialGoals(
  input: ShowcaseCommercialGoalRunInput
): ShowcaseCommercialGoalRunResult {
  const stageCount = input.activeStageMaturities.length;
  const rcCount = input.activeStageMaturities.filter((m) =>
    stageMeetsMaturity(m, "rc")
  ).length;
  const commercialCount = input.activeStageMaturities.filter((m) =>
    stageMeetsMaturity(m, "commercial")
  ).length;

  const rcRatio = stageCount > 0 ? rcCount / stageCount : 0;
  const commercialRatio = stageCount > 0 ? commercialCount / stageCount : 0;

  const motionIssues = input.motionKnownIssues.filter((s) => MOTION_ISSUE_PATTERN.test(s));
  const motionRatio =
    stageCount > 0 ? 1 - motionIssues.length / stageCount : 0;

  const shapesTotal = input.shapesTotal ?? 0;
  const shapesValidated = input.shapesValidated ?? 0;
  const shapesRatio = shapesTotal > 0 ? shapesValidated / shapesTotal : 0;

  const boothRatio =
    input.boothAspectsValidated !== undefined
      ? input.boothAspectsValidated / 3
      : null;

  const photoCorpus = input.photoCorpusSize ?? 0;
  const photoPass =
    photoCorpus >= 100 && input.measuredPhotoPassRate !== undefined
      ? input.measuredPhotoPassRate
      : null;

  const wysiwygMeasured =
    input.wysiwygPassed === undefined ? null : input.wysiwygPassed ? 1 : 0;

  const measurements: ShowcaseCommercialGoalMeasurement[] = [
    measureGoal(
      SHOWCASE_COMMERCIAL_GOALS.find((g) => g.id === "stage_rc")!,
      rcRatio,
      `${rcCount}/${stageCount} stages ≥ rc`
    ),
    measureGoal(
      SHOWCASE_COMMERCIAL_GOALS.find((g) => g.id === "stage_commercial")!,
      commercialRatio,
      `${commercialCount}/${stageCount} stages ≥ commercial`
    ),
    measureGoal(
      SHOWCASE_COMMERCIAL_GOALS.find((g) => g.id === "presets")!,
      input.commercialPresetCount,
      `${input.commercialPresetCount} presets`
    ),
    measureGoal(
      SHOWCASE_COMMERCIAL_GOALS.find((g) => g.id === "wysiwyg_export")!,
      wysiwygMeasured,
      input.wysiwygPassed === undefined ? "run with --run-e2e" : undefined
    ),
    measureGoal(
      SHOWCASE_COMMERCIAL_GOALS.find((g) => g.id === "photo_corpus")!,
      photoCorpus,
      photoCorpus < 100 ? `corpus ${photoCorpus}/100 — run npm run generate:showcase-qa-corpus` : undefined
    ),
    measureGoal(
      SHOWCASE_COMMERCIAL_GOALS.find((g) => g.id === "photo_batch_100")!,
      input.photoBatchWaived ? null : photoPass,
      input.photoBatchWaived
        ? "waived — export SHOWCASE_PHOTO_BATCH_REQUIRED=1 to enforce"
        : photoCorpus < 100
          ? "blocked until corpus ≥ 100"
          : input.measuredPhotoPassRate === undefined
            ? "run npm run verify:showcase-photo-batch"
            : undefined
    ),
    measureGoal(
      SHOWCASE_COMMERCIAL_GOALS.find((g) => g.id === "motion_smooth")!,
      motionRatio,
      motionIssues.length
        ? `issues: ${motionIssues.slice(0, 3).join("; ")}`
        : "no known motion issues"
    ),
    measureGoal(
      SHOWCASE_COMMERCIAL_GOALS.find((g) => g.id === "shapes_validated")!,
      shapesTotal > 0 ? shapesRatio : null,
      shapesTotal === 0 ? "set shapesTotal in runner" : `${shapesValidated}/${shapesTotal}`
    ),
    measureGoal(
      SHOWCASE_COMMERCIAL_GOALS.find((g) => g.id === "booth_aspects")!,
      boothRatio,
      boothRatio === null ? "not implemented" : `${input.boothAspectsValidated}/3 aspects`
    ),
  ].sort((a, b) => {
    const oa = SHOWCASE_COMMERCIAL_GOALS.find((g) => g.id === a.id)!.order;
    const ob = SHOWCASE_COMMERCIAL_GOALS.find((g) => g.id === b.id)!.order;
    return oa - ob;
  });

  const evaluated = measurements.filter((m) => m.result !== "SKIP");
  const passed = evaluated.filter((m) => m.result === "PASS").length;
  const masterMeasured = evaluated.length > 0 ? passed / evaluated.length : 0;

  const currentBottleneck =
    measurements.find((m) => m.result === "FAIL")?.id ?? null;

  return {
    masterKpi: "commercial_gate_pass_rate (PASS gates / measured gates)",
    masterTarget: 1,
    masterMeasured,
    masterResult: masterMeasured >= 1 ? "PASS" : "FAIL",
    masterGap: `Δtarget=${(1 - masterMeasured).toFixed(4)} (${passed}/${evaluated.length} gates PASS)`,
    currentBottleneck,
    measurements,
    attemptLogHint:
      "Change ONE variable per /goal attempt; re-run: npm run verify:showcase-commercial",
  };
}

/** First failing gate id — sprint focus. */
export function getShowcaseCommercialSprintKpi(
  result: ShowcaseCommercialGoalRunResult
): ShowcaseCommercialGoalMeasurement | null {
  return result.measurements.find((m) => m.result === "FAIL") ?? null;
}

export function formatShowcaseCommercialGoalReport(
  result: ShowcaseCommercialGoalRunResult
): string {
  const lines: string[] = [
    "# Showcase commercial_launch goal program",
    "",
    `Master KPI:   ${result.masterKpi}`,
    `Target:       ${result.masterTarget}`,
    `Measured:     ${result.masterMeasured.toFixed(4)}`,
    `Result:       ${result.masterResult}`,
    `Gap:          ${result.masterGap}`,
    "",
  ];

  if (result.currentBottleneck) {
    lines.push(`Current bottleneck: ${result.currentBottleneck}`, "");
  }

  lines.push("| Gate | Target | Measured | Result | Notes |", "|------|--------|----------|--------|-------|");

  for (const m of result.measurements) {
    const measured =
      m.measured === null
        ? "—"
        : m.unit === "ratio"
          ? m.measured.toFixed(4)
          : String(Math.round(m.measured));
    lines.push(
      `| ${m.id} | ${m.target} | ${measured} | ${m.result} | ${m.notes ?? ""} |`
    );
  }

  const sprint = getShowcaseCommercialSprintKpi(result);
  if (sprint) {
    lines.push(
      "",
      "## Sprint KPI (first FAIL)",
      `KPI:      ${sprint.kpi}`,
      `Target:   ${sprint.target}`,
      `Measured: ${sprint.measured}`,
      `Result:   FAIL`,
      `Gap:      ${sprint.gap}`,
      "",
      "Goal NOT reached for commercial_launch.",
      result.attemptLogHint
    );
  }

  return lines.join("\n");
}
