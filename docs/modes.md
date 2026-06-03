## 모드 구분: main / 간편모드 / wedding simple

이 문서는 `apps/web` 안에서 제공되는 **3가지 사용자 플로우**(main / 간편모드 / wedding simple)가
어떤 목적/기능 차이를 갖는지, 그리고 운영/테스트 포인트를 정리합니다.

### 1) main 모드 (통합 앱)

- **진입**: `http://localhost:5173/` (기본 탭/내비게이션)
- **목표**: 제작/디버깅/다양한 실험에 유리한 **풀 기능** 제공
- **특징**
  - 업로드 → 분석/크롭 → (선택) 누끼/배경생성/후처리 → 3D 큐브/내보내기
  - 누끼(배경 제거)는 **사용자가 선택 적용**(개별/배치) → 원본/누끼 혼재 가능
  - 기능 폭이 가장 넓고, 실험·검증용 패널/옵션이 상대적으로 많음

### 2) 간편모드 (웨딩 오퍼레이터 UX)

- **진입**: `http://localhost:5173` → UI에서 “결혼식장 간편 모드”
- **목표**: 현장 운영 흐름(업로드→AI 처리→MP4)에 맞춘 **단순한 위저드**
- **특징**
  - 성공률/속도/오퍼레이터 UX 우선 (옵션 폭은 main보다 제한)
  - 홀로그램/웨딩 프리셋 중심으로 기본값이 구성됨

### 3) wedding simple (초경량 원클릭 플로우)

- **진입(정적 단독 UI)**: `http://localhost:5173/wedding-simple/index.html`
  - 소스: `apps/web/public/wedding-simple/`
- **목표**: “현장용 원클릭 MP4”에 가까운 **최소 기능**
- **특징**
  - 기능은 최소화하되 “끝까지 가는 파이프라인”을 우선
  - 최근 변경: 자동 처리에서 **누끼를 시도하고 실패 시 원본으로 폴백**하여 파이프라인이 멈추지 않도록 구성

---

## 핵심 동작 차이: 누끼(배경 제거) 정책

| 모드 | 기본 정책 | 결과 |
|------|-----------|------|
| main | 사용자가 선택 적용(개별/배치) | 원본/누끼 혼재 가능 |
| 간편모드 | 자동 처리 파이프라인 내에서 최대한 처리 | 운영 흐름에서 끊김 최소화 |
| wedding simple | **누끼 시도 + 실패 시 원본 폴백** | “누끼가 엎어도” MP4까지 진행 |

폴백의 의미:
- 누끼(브라우저/서버)가 실패해도
  - 원본을 1024로 크롭
  - background plate / face composite 생성
  - `preprocessMode`는 `"original"`로 유지

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
# 다른 터미널:
npm run verify:bg-removal
npm run verify:cube-frames
npm run verify:wedding-simple
npm run verify:local
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

