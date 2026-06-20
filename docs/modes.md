## 모드 구분: main / wedding simple

이 문서는 `apps/web` 안에서 제공되는 **2가지 사용자 플로우**(main / wedding simple)가
어떤 목적/기능 차이를 갖는지, 그리고 운영/테스트 포인트를 정리합니다.

### 1) main 모드 (통합 앱)

- **진입**: `http://localhost:5173/` (기본 탭/내비게이션)
- **목표**: 제작/디버깅/다양한 실험에 유리한 **풀 기능** 제공
- **특징**
  - 업로드 → 분석/크롭 → (선택) 누끼/배경생성/후처리 → 3D 큐브/내보내기
  - 누끼(배경 제거)는 **사용자가 선택 적용**(개별/배치) → 원본/누끼 혼재 가능
  - 기능 폭이 가장 넓고, 실험·검증용 패널/옵션이 상대적으로 많음
  - **VoluMax·홀로그램·파티클·BGM 기본값 OFF** — 사용자가 패널에서 켜야 적용
  - 기본값 단일 출처: `packages/shared/src/cubePresentationDefaults.ts` → wedding-simple은 `cube-config.js`로 동기화 (`node scripts/sync-cube-config.mjs`)
  - **cube_focus 팬 모션**(면 정면, 6면 마운트, 회전)은 main / wedding-simple **동일 코드** (`apps/web/src/features/cube/`). 모드별로 분기하지 않음.
  - **안전성 7 : 퀄리티 3** — 신규 연출은 `docs/presentation-safety.md` · `cubeEffectFramework.ts` 틀 안에서만 추가

### 2) wedding simple (초경량 원클릭 플로우, 단독 URL)

- **진입(정적 단독 UI)**: `http://localhost:5173/wedding-simple/index.html`
  - 소스: `apps/web/public/wedding-simple/`
- **목표**: “현장용 원클릭 MP4”에 가까운 **최소 기능**
- **특징**
  - 기능은 최소화하되 “끝까지 가는 파이프라인”을 우선
  - main과 동일한 **옵션 기본값** (`cube-config.js`) — VoluMax·AI 누끼·자동 레이어 준비는 기본 OFF

---

## 핵심 동작 차이: 누끼(배경 제거) 정책

| 모드 | 기본 정책 | 결과 |
|------|-----------|------|
| main | 사용자가 선택 적용(개별/배치) | 원본/누끼 혼재 가능 |
| wedding simple | **원본 배경 유지** (누끼 없음) | “누끼 없이” MP4까지 진행 |

폴백 정책(과거): wedding simple에서 누끼 실패 시 원본 폴백을 쓰던 시기가 있었으나, **현재는 wedding/간편 모드 모두 누끼를 시도하지 않고 원본을 유지**합니다. main 모드에서만 사용자가 선택적으로 누끼를 적용할 수 있습니다.

---

## 렌더링/내보내기(홀로그램) 관련 합의

- **사진은 원형으로 자르지 않는다**
- **프레임은 남기고(색을 입혀) 큐브 면 경계가 느껴지게 한다**
- 홀로그램(팬) 모드에서 PNG 알파/플레이어 처리 차이로 “빈 영상”처럼 보이지 않도록,
  셰이더 출력 알파는 홀로그램에서 **불투명(1.0) 기준**으로 유지한다.

---

## 테스트 (권장 순서)

### 로컬(dev 서버 필요)

```bash
npm run dev
# 다른 터미널 (원본 배경 유지 — wedding/cube 연출 검증):
npm run verify:cube-frames
npm run verify:wedding-simple
# main 모드 누끼(선택 기능)만 별도:
npm run verify:bg-removal
```

### Cloud Build 정합성 (CI/배포 전)

```bash
npm run check:cloudbuild
```

### 호스팅 스모크(배포 후)

```bash
# 브라우저 E2E 없이 web asset + API health + CORS만 확인
MBOX_SKIP_BROWSER=1 node scripts/verify-hosted-deploy.mjs
```

