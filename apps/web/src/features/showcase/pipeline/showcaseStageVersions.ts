import {
  compareStageMaturity,
  evaluateShowcaseTierReadiness,
  SHOWCASE_CURRENT_CONTENT_TARGET,
  type ShowcaseContentMaturityTier,
  type ShowcaseStageMaturity,
  type ShowcaseTierReadinessResult,
} from "@mbox/shared";
import type { ShowcasePipelineStageId } from "./types";

export type ShowcaseStageChangelogEntry = {
  version: string;
  date: string;
  notesKo: string[];
};

export type ShowcaseStageVersionRecord = {
  id: ShowcasePipelineStageId;
  version: string;
  maturity: ShowcaseStageMaturity;
  labelKo: string;
  summaryKo: string;
  acceptanceKo: string[];
  knownIssuesKo?: string[];
  changelog: ShowcaseStageChangelogEntry[];
};

/**
 * Per-stage content version — bump semver when motion/look/acceptance changes.
 * patch: bugfix  minor: behavior/look  major: breaking pipeline contract
 */
export const SHOWCASE_STAGE_VERSIONS: Record<
  ShowcasePipelineStageId,
  ShowcaseStageVersionRecord
> = {
  reveal: {
    id: "reveal",
    version: "1.2.0",
    maturity: "commercial",
    labelKo: "표출",
    summaryKo: "홀로 전원 ON · L0–L3 ramp · 큐브 스폰 · integral spin",
    acceptanceKo: [
      "450ms 이내 콘텐츠 power ramp",
      "스폰 직후 셰이더·사진·셸 동시 가시",
      "revealHold integral ease-in/out spin",
    ],
    changelog: [
      {
        version: "1.2.0",
        date: "2026-06-21",
        notesKo: ["no-fall pipeline commercial maturity lock"],
      },
      {
        version: "1.1.0",
        date: "2026-06-21",
        notesKo: ["computeIntegralEaseSpinSpeedY reveal hold", "maturity rc"],
      },
      {
        version: "1.0.0",
        date: "2026-06-01",
        notesKo: ["초기 Havok 스택 reveal"],
      },
    ],
  },
  rotate: {
    id: "rotate",
    version: "1.3.0",
    maturity: "commercial",
    labelKo: "회전·모핑",
    summaryKo: "연속 ease-in-cruise 스핀 + 사진 모핑 (구간 경계 무정지)",
    acceptanceKo: [
      "rotate+morph 단일 cruise envelope — 끝에서 peak 유지",
      "spinOmega 관성 브리지 — stage enter 시 ω 리셋 없음",
      "pull 진입 decay — handoff ω에서 연속 감속",
    ],
    changelog: [
      {
        version: "1.2.0",
        date: "2026-06-21",
        notesKo: ["commercial maturity lock"],
      },
      {
        version: "1.1.0",
        date: "2026-06-21",
        notesKo: [
          "computeIntegralEaseSpinSpeedY — ease-in/out 각속도",
          "maturity rc",
        ],
      },
      {
        version: "1.0.0",
        date: "2026-06-01",
        notesKo: ["presentation tick 기본 회전"],
      },
    ],
  },
  pull: {
    id: "pull",
    version: "1.4.0",
    maturity: "commercial",
    labelKo: "정면 강조",
    summaryKo: "ease-in-out yaw + hero zoom + integral spin lead",
    acceptanceKo: [
      "줌 구간 easeInOutCubic yaw (스냅 없음)",
      "큐브 90° cardinal face 정렬",
      "hero lock 시 옆면 photo cull",
      "lead spin ease-out integral — 0.82 cliff 제거",
      "parallax (1−ease)² smooth fade",
    ],
    changelog: [
      {
        version: "1.4.0",
        date: "2026-06-21",
        notesKo: ["commercial maturity lock"],
      },
      {
        version: "1.3.0",
        date: "2026-06-21",
        notesKo: [
          "computeIntegralEaseOutSpinSpeedY lead spin",
          "parallax·hold stiffness smooth ramp",
          "maturity rc",
        ],
      },
      {
        version: "1.2.0",
        date: "2026-06-21",
        notesKo: [
          "repositionJewelCube 스냅 제거",
          "portrait aspect contain on cube",
          "face visibility hero lock",
        ],
      },
      {
        version: "1.1.0",
        date: "2026-06-18",
        notesKo: ["pull camera spring", "hero framing quaternion"],
      },
      {
        version: "1.0.0",
        date: "2026-06-01",
        notesKo: ["spin + zoom hero beat"],
      },
    ],
  },
  ascend: {
    id: "ascend",
    version: "1.3.0",
    maturity: "commercial",
    labelKo: "상승",
    summaryKo: "hero → presentation ease-in-out zoom-out + cruise spin handoff",
    acceptanceKo: [
      "pullReturnMs 대칭 easeInOutCubic 카메라 복귀",
      "returnEndRadius 고정 — 호흡 줌 jerk 제거",
      "ease-in-cruise spin — 루프 rotate에 ω 전달",
    ],
    changelog: [
      {
        version: "1.2.0",
        date: "2026-06-21",
        notesKo: ["commercial maturity lock"],
      },
      {
        version: "1.1.0",
        date: "2026-06-21",
        notesKo: [
          "computeIntegralEaseSpinSpeedY ascend spin",
          "maturity rc",
        ],
      },
      {
        version: "1.0.0",
        date: "2026-06-21",
        notesKo: [
          "resetShowcaseCameraSpring on enter",
          "tickShowcaseCameraReturn direct ease (no spring chase)",
          "tickShowcaseAscendReturn — spin·parallax ramp",
        ],
      },
      {
        version: "0.9.0",
        date: "2026-06-21",
        notesKo: ["알려진 zoom-out jerk — commercial 전 수정 예정"],
      },
      {
        version: "0.8.0",
        date: "2026-06-01",
        notesKo: ["tickShowcaseCameraReturn 복귀"],
      },
    ],
  },
};

/** Lowest maturity among listed stages (pipeline bottleneck). */
export function getPipelineBottleneckMaturity(
  stageIds: ShowcasePipelineStageId[]
): ShowcaseStageMaturity {
  let worst: ShowcaseStageMaturity = "commercial";
  for (const id of stageIds) {
    const m = SHOWCASE_STAGE_VERSIONS[id].maturity;
    if (compareStageMaturity(m, worst) < 0) {
      worst = m;
    }
  }
  return worst;
}

/** Semver string for export manifest — max stage version + bottleneck tag. */
export function computeShowcasePipelineContentVersion(
  stageIds: ShowcasePipelineStageId[]
): string {
  const bottleneck = getPipelineBottleneckMaturity(stageIds);
  const versions = stageIds.map((id) => SHOWCASE_STAGE_VERSIONS[id].version);
  const maxParts = versions
    .map((v) => v.split(".").map(Number))
    .reduce(
      (acc, [maj = 0, min = 0, pat = 0]) => [
        Math.max(acc[0]!, maj),
        Math.max(acc[1]!, min),
        Math.max(acc[2]!, pat),
      ],
      [0, 0, 0]
    );
  return `${maxParts.join(".")}-${bottleneck}`;
}

export type ShowcaseContentManifest = {
  targetTier: ShowcaseContentMaturityTier;
  pipelineContentVersion: string;
  bottleneckMaturity: ShowcaseStageMaturity;
  stages: ShowcaseStageVersionRecord[];
  readiness: ShowcaseTierReadinessResult;
  exportedAt?: string;
};

export function buildShowcaseContentManifest(
  stageIds: ShowcasePipelineStageId[],
  tier: ShowcaseContentMaturityTier = SHOWCASE_CURRENT_CONTENT_TARGET
): ShowcaseContentManifest {
  const stages = stageIds.map((id) => SHOWCASE_STAGE_VERSIONS[id]);
  const maturities = stages.map((s) => s.maturity);
  return {
    targetTier: tier,
    pipelineContentVersion: computeShowcasePipelineContentVersion(stageIds),
    bottleneckMaturity: getPipelineBottleneckMaturity(stageIds),
    stages,
    readiness: evaluateShowcaseTierReadiness({
      tier,
      stageMaturities: maturities,
    }),
  };
}

export function getShowcaseStageVersion(id: ShowcasePipelineStageId): ShowcaseStageVersionRecord {
  return SHOWCASE_STAGE_VERSIONS[id];
}

export function formatShowcaseContentManifestSummary(manifest: ShowcaseContentManifest): string {
  const { readiness, pipelineContentVersion, bottleneckMaturity, targetTier } = manifest;
  const tierLabel =
    targetTier === "beta_sales"
      ? "베타 판매"
      : targetTier === "commercial_launch"
        ? "상업 런칭"
        : "알파 데모";
  const status = readiness.ready ? "준비됨" : "미달";
  return `콘텐츠 v${pipelineContentVersion} · 목표 ${tierLabel} · 병목 ${bottleneckMaturity} · ${status}`;
}
