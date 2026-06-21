/**
 * Showcase content maturity — product gates for alpha demo → beta sales → commercial launch.
 * Stage-level versions live in apps/web showcaseStageVersions.ts.
 */

export type ShowcaseContentMaturityTier = "alpha_demo" | "beta_sales" | "commercial_launch";

export type ShowcaseStageMaturity = "alpha" | "beta" | "rc" | "commercial";

export type ShowcaseContentRequirement = {
  id: string;
  labelKo: string;
  descriptionKo: string;
};

export type ShowcaseContentTierSpec = {
  id: ShowcaseContentMaturityTier;
  labelKo: string;
  summaryKo: string;
  /** Minimum stage maturity allowed in active pipeline (inclusive). */
  minStageMaturity: ShowcaseStageMaturity;
  /** Random customer photo batch pass rate (0–1). */
  photoBatchPassRate: number;
  requirements: ShowcaseContentRequirement[];
  /** Export must match preview framing/brightness within tolerance. */
  wysiwygExport: boolean;
  /** All catalog presets must work without manual slider tuning. */
  presetOnlyWorkflow: boolean;
  /** Zero tolerance visual defect classes. */
  zeroToleranceDefects: string[];
};

const STAGE_MATURITY_ORDER: ShowcaseStageMaturity[] = [
  "alpha",
  "beta",
  "rc",
  "commercial",
];

export function compareStageMaturity(
  a: ShowcaseStageMaturity,
  b: ShowcaseStageMaturity
): number {
  return STAGE_MATURITY_ORDER.indexOf(a) - STAGE_MATURITY_ORDER.indexOf(b);
}

export function stageMeetsMaturity(
  stageMaturity: ShowcaseStageMaturity,
  minMaturity: ShowcaseStageMaturity
): boolean {
  return compareStageMaturity(stageMaturity, minMaturity) >= 0;
}

export const SHOWCASE_CONTENT_MATURITY_TIERS: Record<
  ShowcaseContentMaturityTier,
  ShowcaseContentTierSpec
> = {
  alpha_demo: {
    id: "alpha_demo",
    labelKo: "알파 데모",
    summaryKo: "내부·투자 데모 — 데모 사진·단일 형상·미리보기 중심",
    minStageMaturity: "alpha",
    photoBatchPassRate: 0,
    wysiwygExport: false,
    presetOnlyWorkflow: false,
    requirements: [
      {
        id: "demo-loop",
        labelKo: "데모 루프 재생",
        descriptionKo: "기본 3장 데모 사진으로 전체 파이프라인이 끊김 없이 한 바퀴 돈다.",
      },
      {
        id: "single-shape",
        labelKo: "대표 형상 1종",
        descriptionKo: "큐브(또는 지정 1종)에서 크리스탈·사진·배경이 동시에 보인다.",
      },
      {
        id: "no-shader-crash",
        labelKo: "셰이더 크래시 없음",
        descriptionKo: "WebGL 컴파일 실패·검은 화면 없이 미리보기가 유지된다.",
      },
    ],
    zeroToleranceDefects: ["shader_compile_fail", "blank_preview"],
  },
  beta_sales: {
    id: "beta_sales",
    labelKo: "베타 판매",
    summaryKo: "파일럿 고객·부스 시연 — WYSIWYG export + 프리셋 워크플로",
    minStageMaturity: "beta",
    photoBatchPassRate: 0.8,
    wysiwygExport: true,
    presetOnlyWorkflow: true,
    requirements: [
      {
        id: "wysiwyg-1080",
        labelKo: "1080×1080 WYSIWYG export",
        descriptionKo:
          "미리보기 composite와 MP4 첫 프레임의 중앙/모서리 luma·RGB가 자동 검증(Δluma≤35)을 통과한다.",
      },
      {
        id: "photo-batch-80",
        labelKo: "100장 중 80% 합격",
        descriptionKo: "세로/가로/역광/단체 혼합 100장 중 80장 이상이 슬라이더 없이 전시 가능하다.",
      },
      {
        id: "presets",
        labelKo: "프리셋만으로 완성 룩",
        descriptionKo: "로즈골드·클래식 등 프리셋만으로 구매욕이 생기는 톤이 나온다.",
      },
      {
        id: "no-stretch-snap",
        labelKo: "늘어짐·스냅 없음(베타)",
        descriptionKo: "정면 강조·모핑 구간에서 사진 늘어짐·각도 스냅이 눈에 띄지 않는다.",
      },
      {
        id: "fixed-export-fps",
        labelKo: "고정 60fps export",
        descriptionKo: "녹화는 60fps 고정 타임스텝으로 미리보기보다 끊김이 적다.",
      },
    ],
    zeroToleranceDefects: [
      "shader_compile_fail",
      "blank_preview",
      "photo_aspect_stretch",
      "export_wrong_resolution",
    ],
  },
  commercial_launch: {
    id: "commercial_launch",
    labelKo: "상업 런칭",
    summaryKo: "키오스크·LED·대량 납품 — 100% 합격·형상별 베스트샷·버그 제로",
    minStageMaturity: "commercial",
    photoBatchPassRate: 1,
    wysiwygExport: true,
    presetOnlyWorkflow: true,
    requirements: [
      {
        id: "photo-batch-100",
        labelKo: "100장 100% 합격",
        descriptionKo: "어떤 입력 사진이 와도 항상 카탈로그급 일관성(얼굴 안 잘림·과노출 없음).",
      },
      {
        id: "all-shapes",
        labelKo: "형상별 베스트샷",
        descriptionKo: "큐브·하트·구체 등 형상마다 최적 카메라·정면 강조·줌 타이밍이 검증된다.",
      },
      {
        id: "booth-color",
        labelKo: "부스/LED 색역",
        descriptionKo: "1:1·9:16·16:9 템플릿에서 밝기·반사가 현장 디스플레이와 동일하게 보인다.",
      },
      {
        id: "motion-smooth",
        labelKo: "모션 완전 매끄러움",
        descriptionKo: "줌 인/아웃·정면 정렬·복귀 구간에 끊김·스냅·등속 튐이 없다.",
      },
      {
        id: "stage-version-lock",
        labelKo: "스테이지 버전 잠금",
        descriptionKo: "활성 파이프라인의 모든 스테이지 maturity ≥ rc, export에 버전 매니페스트 포함.",
      },
    ],
    zeroToleranceDefects: [
      "shader_compile_fail",
      "blank_preview",
      "photo_aspect_stretch",
      "photo_duplicate_face",
      "yaw_snap",
      "zoom_out_jerk",
      "export_wrong_resolution",
      "wysiwyg_mismatch",
    ],
  },
};

/** Active product target — bump when tier gate is cleared. */
export const SHOWCASE_CURRENT_CONTENT_TARGET: ShowcaseContentMaturityTier = "commercial_launch";

export function getShowcaseContentTierSpec(
  tier: ShowcaseContentMaturityTier = SHOWCASE_CURRENT_CONTENT_TARGET
): ShowcaseContentTierSpec {
  return SHOWCASE_CONTENT_MATURITY_TIERS[tier];
}

export type ShowcaseTierReadinessInput = {
  tier?: ShowcaseContentMaturityTier;
  stageMaturities: ShowcaseStageMaturity[];
  /** Measured 0–1 from QA batch (optional). */
  measuredPhotoPassRate?: number;
};

export type ShowcaseTierReadinessResult = {
  tier: ShowcaseContentMaturityTier;
  ready: boolean;
  blockers: string[];
  warnings: string[];
};

export function evaluateShowcaseTierReadiness(
  input: ShowcaseTierReadinessInput
): ShowcaseTierReadinessResult {
  const tier = input.tier ?? SHOWCASE_CURRENT_CONTENT_TARGET;
  const spec = SHOWCASE_CONTENT_MATURITY_TIERS[tier];
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const maturity of input.stageMaturities) {
    if (!stageMeetsMaturity(maturity, spec.minStageMaturity)) {
      blockers.push(
        `스테이지 maturity "${maturity}"가 ${spec.labelKo} 최소 "${spec.minStageMaturity}" 미만입니다.`
      );
    }
  }

  if (
    input.measuredPhotoPassRate !== undefined &&
    input.measuredPhotoPassRate < spec.photoBatchPassRate
  ) {
    blockers.push(
      `사진 배치 합격률 ${(input.measuredPhotoPassRate * 100).toFixed(0)}% < 목표 ${(spec.photoBatchPassRate * 100).toFixed(0)}%`
    );
  }

  if (tier === "beta_sales" || tier === "commercial_launch") {
    const belowRc = input.stageMaturities.filter(
      (m) => compareStageMaturity(m, "rc") < 0
    ).length;
    if (belowRc > 0 && tier === "commercial_launch") {
      blockers.push(`${belowRc}개 스테이지가 rc 미만 — 상업 런칭 전 스테이지 버전 업 필요`);
    } else if (belowRc > 0) {
      warnings.push(`${belowRc}개 스테이지가 rc 미만 — 베타는 허용, 런칭 전 상향 필요`);
    }
  }

  return {
    tier,
    ready: blockers.length === 0,
    blockers,
    warnings,
  };
}
