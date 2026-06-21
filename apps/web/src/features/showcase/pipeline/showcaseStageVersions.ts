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
    version: "1.1.0",
    maturity: "rc",
    labelKo: "표출",
    summaryKo: "홀로 전원 ON · L0–L3 ramp · 큐브 스폰 · integral spin",
    acceptanceKo: [
      "450ms 이내 콘텐츠 power ramp",
      "스폰 직후 셰이더·사진·셸 동시 가시",
      "revealHold integral ease-in/out spin",
    ],
    changelog: [
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
    version: "1.1.0",
    maturity: "rc",
    labelKo: "회전",
    summaryKo: "Y축 ease-in/out 회전 + 부유 + 호흡 줌",
    acceptanceKo: [
      "3.4s 단일 방향 spin — 총 각도 등속 구간과 동일(적분 매핑)",
      "ease-in/out 각속도 — 구간 경계 스냅 없음",
      "카메라 presentation follow 유지",
    ],
    changelog: [
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
  fall: {
    id: "fall",
    version: "1.0.0",
    maturity: "alpha",
    labelKo: "낙하",
    summaryKo: "Havok 낙하 + 바닥 접근 카메라",
    acceptanceKo: ["낙하 물리 ON 파이프라인에서만 활성"],
    knownIssuesKo: ["export 시 결정론적 스폰 offset"],
    changelog: [
      {
        version: "1.0.0",
        date: "2026-06-01",
        notesKo: ["낙하 물리 스테이지"],
      },
    ],
  },
  bounce: {
    id: "bounce",
    version: "1.0.0",
    maturity: "alpha",
    labelKo: "튕김",
    summaryKo: "안착 대기 + bounce 카메라",
    acceptanceKo: ["settleHoldMs 후 morph 전환"],
    changelog: [
      {
        version: "1.0.0",
        date: "2026-06-01",
        notesKo: ["바닥 안착 스테이지"],
      },
    ],
  },
  morph: {
    id: "morph",
    version: "1.2.0",
    maturity: "rc",
    labelKo: "사진 모핑",
    summaryKo: "L2 dual-layer crossfade + integral spin",
    acceptanceKo: [
      "smootherstep 대칭 crossfade",
      "모핑 중 integral ease spin·부유 유지",
      "프레임·aspect shape별 유지",
    ],
    changelog: [
      {
        version: "1.2.0",
        date: "2026-06-21",
        notesKo: ["computeIntegralEaseSpinSpeedY morph spin", "maturity rc"],
      },
      {
        version: "1.1.0",
        date: "2026-06-18",
        notesKo: ["dual-sided framed photo", "sphere disc branch"],
      },
      {
        version: "1.0.0",
        date: "2026-06-01",
        notesKo: ["bg A/B crossfade"],
      },
    ],
  },
  swap: {
    id: "swap",
    version: "1.1.0",
    maturity: "beta",
    labelKo: "사진 교체",
    summaryKo: "morph alias — 동일 1.1.0 계약",
    acceptanceKo: ["morphStage와 동일 동작"],
    changelog: [
      {
        version: "1.1.0",
        date: "2026-06-18",
        notesKo: ["morph와 버전 동기"],
      },
    ],
  },
  pull: {
    id: "pull",
    version: "1.3.0",
    maturity: "rc",
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
    version: "1.1.0",
    maturity: "rc",
    labelKo: "상승",
    summaryKo: "hero → presentation ease-in-out zoom-out + integral spin ramp",
    acceptanceKo: [
      "pullReturnMs 대칭 easeInOutCubic 카메라 복귀",
      "스프링 vel 리셋 — 이중 추적 없음",
      "repositionJewelCube 없이 integral spin ramp",
    ],
    changelog: [
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
