# Presentation safety framework (안전성 7 : 퀄리티 3)

큐브·VoluMax·홀로그램 연출은 **기본 구조(타임라인, flat 면, opt-in 기본값)** 를 유지한 채, **정해진 틀 안에서만** 시각 효과를 올린다.

| 비중 | 의미 | 구현 위치 |
|------|------|-----------|
| **안전성 7** | 기본 OFF, depth OFF → flat, 레이어는 준비만 가능, 시차는 허용 phase만, Z·회전 보정 금지, 상한 캡 | `packages/shared/src/cubePresentationDefaults.ts`, `cubeEffectFramework.ts` |
| **퀄리티 3** | 블러 플레이트, showcase 홀드 XY 시차, focus pulse (캡 이하) | `fanPhases.ts`, `applyPresentationPrepare.ts` |

## 신규 효과 체크리스트 (반드시 순서)

1. `cubeEffectFramework.ts`에 **허용 phase·상한** 추가 (없으면 효과 금지).
2. `cubePresentationDefaults.ts` 기본값 **OFF** 유지.
3. UI 체크박스/버튼으로만 켜기 (자동 ON 금지).
4. `presentationScene` / `hasVoluMaxMatte` 게이트로 depth OFF 시 **flat** 강제.
5. wedding-simple 동기화: `node scripts/sync-cube-config.mjs`.
6. **마이크로 모듈**: `docs/micro-modules.md` — 새 FX는 registry + host만.

## VoluMax 현재 틀 (예시)

- **시차 허용**: fan `showcase_hold` 만 (`PARALLAX_ALLOWED_FAN_PHASES`).
- **접근/퇴장/핸드오프**: `parallaxAmount = 0`.
- **면 Z**: `CUBE_FACE_PHOTO_Z` / `CUBE_FACE_BG_Z` (프레임에서 떠 보이지 않게).
- **금지**: 큐브 회전 각도에 fg/bg 레이어 추가 밀기 (`updateRotationParallax` 미사용).
- **상한**: `CUBE_PARALLAX_PEAK_MAX`, fg/bg mul max — framework 상수 초과 금지.
- **면 클리핑**: `cubeDualLayerParallaxMaterial` (`uFaceUvInset` discard + `CUBE_PARALLAX_UV_WARP_MAX`) 또는 mesh fallback (`cubeFaceClipMaterial`).
- **VoluMax 마운트**: AI 누끼+플레이트 준비 시 **`volumax_mesh`** (fg matte + bg plate, 동일 UV·스케일, Z-only 시차). `volumax_disp`는 비-누끼 실험용; 누끼는 `resolveVoluMaxMountMode`가 mesh로 고정.
- **depth OFF**: 시차·focus pulse 비활성(모션 게이트). 면 **리마운트**나 matte-only flat으로 되돌리지 않음 — 준비된 레이어는 유지.

## 검증

```bash
npm run build --workspace @mbox/shared
npm run build --workspace @mbox/web
node scripts/verify-cube-effect-framework.mjs
node scripts/verify-cube-presentation-defaults.mjs
node scripts/verify-volumax-on-demand.mjs
node scripts/verify-volumax-face-clip.mjs
```
