/**
 * Single registry for presentation micro-modules + quality roadmap.
 * All new visual effects MUST register here before touching CubeView / presentationScene.
 */

import type { OrbitalShapeId, PresentationMicroModuleId } from "./presentationMicroModules.js";

export type MicroModuleQualityPriority = "p0" | "p1" | "p2";
export type MicroModuleEffort = "S" | "M" | "L";

/** Research-backed upgrade item (Exa / Three.js community / product refs). */
export interface MicroModuleQualityUpgrade {
  id: string;
  title: string;
  description: string;
  priority: MicroModuleQualityPriority;
  effort: MicroModuleEffort;
  /** Module to extend, or "new" for a future module id. */
  moduleTarget: PresentationMicroModuleId | "hologram_fresnel_rim" | "selective_bloom" | "new";
  sources: string[];
}

export interface PresentationMicroModuleSpec {
  id: PresentationMicroModuleId;
  label: string;
  description: string;
  requiresHologram?: boolean;
  replacesCubeMotion?: boolean;
  /** Key on PresentationMicroModuleState (boolean toggles). */
  stateKey:
    | "galaxyBackground"
    | "orbitalShowcase"
    | "hologramFresnelRim"
    | "selectiveBloom";
  qualityUpgrades: MicroModuleQualityUpgrade[];
}

export const PRESENTATION_MICRO_MODULE_SPECS: PresentationMicroModuleSpec[] = [
  {
    id: "galaxy_background",
    stateKey: "galaxyBackground",
    label: "은하수 · 우주 배경",
    description: "움직이는 성운·별 필드 배경 (VoluMax·큐브 앞 레이어).",
    qualityUpgrades: [
      {
        id: "galaxy-fbm-layers",
        title: "FBM 성운 2~3 레이어",
        description:
          "단일 sin 노이즈 대신 FBM(octaves) + additive blending으로 깊이감 있는 nebula.",
        priority: "p0",
        effort: "M",
        moduleTarget: "galaxy_background",
        sources: [
          "https://threejsroadmap.com/blog/raytracing-a-black-hole-with-webgpu",
          "https://digitalstrategyforce.com/journal/how-do-you-create-custom-glsl-shaders-for-web-experiences/",
        ],
      },
      {
        id: "galaxy-star-layers",
        title: "별 3레이어 + twinkle",
        description: "서로 다른 parallax 속도·깜빡임(snoise)으로 입체 별 필드.",
        priority: "p0",
        effort: "S",
        moduleTarget: "galaxy_background",
        sources: [
          "https://threejs-journey.com/lessons/animated-galaxy",
          "https://gist.github.com/BonsaiDen/ad7075c9bc415da9393a",
        ],
      },
      {
        id: "galaxy-milky-band",
        title: "은하수 밴드 강화",
        description: "적색 H-alpha / 청색 OIII 톤 분리(선택) + band curvature.",
        priority: "p1",
        effort: "M",
        moduleTarget: "galaxy_background",
        sources: ["https://github.com/CK42BB/procedural-stars-threejs"],
      },
    ],
  },
  {
    id: "orbital_showcase",
    stateKey: "orbitalShowcase",
    label: "궤도 쇼케이스 (비큐브)",
    description: "팔면체 등이 궤도·자전하며 정면에서 확대 → 2초 정지(ω=0) → 재가속.",
    replacesCubeMotion: true,
    qualityUpgrades: [
      {
        id: "orbital-dual-pivot",
        title: "공전·자전 그룹 분리",
        description: "orbitGroup + spinGroup 이중 pivot으로 물리적으로 명확한 ω=0 홀드.",
        priority: "p0",
        effort: "M",
        moduleTarget: "orbital_showcase",
        sources: ["https://exa.ai/docs/reference/search-best-practices"],
      },
      {
        id: "orbital-easing-profile",
        title: "가속/감속 프로파일 튜닝",
        description: "hold 전후 jerk limit + camera dolly 동기화.",
        priority: "p1",
        effort: "S",
        moduleTarget: "orbital_showcase",
        sources: [],
      },
    ],
  },
  {
    id: "hologram_fresnel_rim",
    stateKey: "hologramFresnelRim",
    label: "홀로그램 Fresnel rim",
    description: "면 가장자리 rim glow + scanline (홀로그램 모드 전용).",
    requiresHologram: true,
    qualityUpgrades: [],
  },
  {
    id: "selective_bloom",
    stateKey: "selectiveBloom",
    label: "Selective bloom",
    description: "밝은 rim/엣지만 bloom — 전체 과노출 방지 (홀로그램 모드).",
    requiresHologram: true,
    qualityUpgrades: [],
  },
];

/** Cross-cutting upgrades → future dedicated modules (register before implement). */
export const CROSS_CUTTING_QUALITY_UPGRADES: MicroModuleQualityUpgrade[] = [
  {
    id: "hologram-fresnel-rim",
    title: "홀로그램 Fresnel rim + scanline",
    description:
      "면 가장자리 rim glow, subtractive scanline — Codrops/Three.js Journey hologram 패턴.",
    priority: "p0",
    effort: "M",
    moduleTarget: "hologram_fresnel_rim",
    sources: [
      "https://threejs-journey.com/lessons/hologram-shader",
      "https://tympanus.net/codrops/2026/03/23/building-a-dual-scene-fluid-x-ray-reveal-effect-in-three-js/",
      "https://threejsroadmap.com/blog/rim-lighting-shader",
    ],
  },
  {
    id: "selective-bloom",
    title: "Selective bloom (홀로그램만)",
    description: "pmndrs/postprocessing layer bloom — 전체 과노출 방지.",
    priority: "p1",
    effort: "L",
    moduleTarget: "selective_bloom",
    sources: [
      "https://www.utsubo.com/blog/threejs-best-practices-100-tips",
      "https://discourse.threejs.org/t/selective-bloom-in-three-js/35345",
    ],
  },
  {
    id: "export-background-parity",
    title: "MP4 export 배경 parity",
    description: "galaxy / fan backdrop가 녹화 프레임과 preview 일치.",
    priority: "p1",
    effort: "M",
    moduleTarget: "galaxy_background",
    sources: [],
  },
];

export function listQualityUpgradesForModule(
  moduleId: PresentationMicroModuleId
): MicroModuleQualityUpgrade[] {
  const spec = PRESENTATION_MICRO_MODULE_SPECS.find((entry) => entry.id === moduleId);
  return spec?.qualityUpgrades ?? [];
}

export function listAllQualityUpgrades(): MicroModuleQualityUpgrade[] {
  return [
    ...PRESENTATION_MICRO_MODULE_SPECS.flatMap((spec) => spec.qualityUpgrades),
    ...CROSS_CUTTING_QUALITY_UPGRADES,
  ];
}

export type OrbitalShapeOption = { id: OrbitalShapeId; label: string };

export const ORBITAL_SHAPE_OPTIONS: OrbitalShapeOption[] = [
  { id: "octahedron", label: "팔면체" },
  { id: "icosahedron", label: "12면체" },
];
