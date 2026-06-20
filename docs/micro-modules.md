# Presentation micro-modules

모든 **새 연출·배경·포스트 FX** 는 반드시 마이크로 모듈로 등록합니다. `CubeView` / `presentationScene` 에 효과를 직접 붙이지 않습니다.

## 아키텍처 (유지보수 규칙)

```
packages/shared/
  presentationMicroModules.ts      # id, state, effect routing
  presentationMicroModuleRegistry.ts # spec + quality roadmap (Exa/업계 조사)
  orbitalShowcaseMotion.ts           # orbital 전용 순수 타임라인

apps/web/src/features/cube/microModules/
  types.ts                           # PresentationMicroModuleRuntime 계약
  presentationMicroModuleHost.ts     # 유일한 mount/update/dispose 진입점
  galaxyBackgroundModule.ts          # 모듈 구현
  orbitalShowcaseModule.ts           # effect override
  index.ts

CubeView.tsx  → PresentationMicroModuleHost ONLY
CubeFocusPanel → PRESENTATION_MICRO_MODULE_SPECS ONLY
```

### 새 모듈 체크리스트

1. `presentationMicroModuleRegistry.ts` 에 spec + `qualityUpgrades` 추가
2. `presentationMicroModules.ts` 에 `PresentationMicroModuleId` / state 필드 추가
3. `microModules/<name>Module.ts` — `PresentationMicroModuleRuntime` 구현
4. `presentationMicroModuleHost.ts` 의 `runtimes` 배열에 등록
5. (필요 시) `presentationScene` / `presentationFrame` — **모듈 id로 분기**, CubeView 직접 수정 금지
6. `scripts/verify-micro-module-registry.mjs` 통과

기본값 **OFF** (`DEFAULT_PRESENTATION_MICRO_MODULE_STATE`).

---

## Exa / 업계 조사 — 퀄리티 고도화 방향

Exa API는 `type: "deep"` / `deep-reasoning` 으로 멀티 쿼리·요약 검색에 적합합니다.  
로컬 스크립트: `node scripts/research/exa-presentation-quality.mjs` (`EXA_API_KEY` 필요).

| 우선순위 | 대상 모듈 | 개선 | 근거 |
|---------|-----------|------|------|
| **P0** | `galaxy_background` | FBM 성운 2~3 레이어, additive star layers + twinkle | [Three.js Journey galaxy](https://threejs-journey.com/lessons/animated-galaxy), [FBM nebula](https://threejsroadmap.com/blog/raytracing-a-black-hole-with-webgpu) |
| **P0** | (신규) `hologram_fresnel_rim` | Fresnel rim + subtractive scanline | [Hologram shader](https://threejs-journey.com/lessons/hologram-shader), [Codrops dual-scene](https://tympanus.net/codrops/2026/03/23/building-a-dual-scene-fluid-x-ray-reveal-effect-in-three-js/) |
| **P0** | `orbital_showcase` | orbitGroup / spinGroup 분리, hold 시 ω=0 보장 | 내부 `orbitalShowcaseMotion.ts` |
| **P1** | (신규) `selective_bloom` | pmndrs selective bloom, 홀로그램 rim만 glow | [Three.js tips #77](https://www.utsubo.com/blog/threejs-best-practices-100-tips) |
| **P1** | `galaxy_background` | MP4 export 배경 parity | product gap |
| **P2** | `galaxy_background` | WebGPU/TSL nebula raymarch (fallback WebGL) | [procedural-stars-threejs](https://github.com/CK42BB/procedural-stars-threejs) |

### 공통 원칙 (안전성 7 : 퀄리티 3)

- 퀄리티 knob 은 `cubeEffectFramework` 상한 안에서만
- opt-in UI, 자동 ON 금지
- MP4/export 경로와 preview 동일 모듈 호스트 사용

---

## 현재 등록 모듈

| id | 역할 |
|----|------|
| `galaxy_background` | 씬 skydome — 성운·별·은하수 밴드 (animated shader) |
| `orbital_showcase` | `cube_focus` → `orbital_showcase` effect, 2s hold @ ω=0 |

로드맵 상세는 `listAllQualityUpgrades()` (`@mbox/shared`).
