# 비용 0 + WebGL 프리뷰 (로컬 전용)

클라우드에 **웹 정적 파일만** 올려도 WebGL 문제는 **사라지지 않습니다**. 3D는 항상 **사용자 PC GPU + 브라우저**에서 돌아갑니다.

비용을 **0에 가깝게** 하려면 **GCP에서 돈 나가는 컴퓨트를 끄고**, 프리뷰는 **로컬 dev**만 쓰세요.

## 돈이 나가는 것 vs 필요한 것

| 구성 | 월 비용 | 프리뷰에 필요? | 비용 0 조치 |
|------|---------|----------------|-------------|
| **render-worker** (`min-instances=1`, 4CPU 8Gi) | **가장 큼 (상시)** | 아니오 (로컬 Export) | `min-instances=0` 또는 서비스 삭제 |
| **mbox-api** (Cloud Run) | 요청 시만 | 아니오 (로컬 API) | 그대로 두면 무요청 시 0 |
| **Vertex AI** (`/analyze`) | 호출당 | 아니오 | `VITE_SHOWCASE_LOCAL_ONLY=true` |
| **GCS** (웹·vault·렌더) | 저장/전송 소액 | 아니오 | 버킷 비우거나 유지 (정지 불가, 소액) |
| **로컬 `npm run dev`** | 0 | **예** | 아래 설정 |

## 로컬만 쓸 때 설정 (`apps/web/.env.development`)

```env
VITE_API_BASE_URL=http://localhost:8787
VITE_USE_SERVER_VAULT=false
VITE_RENDER_BACKEND=local
VITE_SHOWCASE_LOCAL_ONLY=true
VITE_LOCALHOST_DEMO=true
```

## Cursor / VS Code — 전략 B (RTX Chrome 동반)

Cursor 탭에는 **WebGL이 없습니다** (`probe=g2-g1-(!)`). MJPEG 중계 대신 **시스템 Chrome(RTX)가 3D를 담당**합니다.

| 역할 | 어디서 |
|------|--------|
| 업로드·카탈로그·MP4 요청 | Cursor 탭 (편집 shell) |
| Babylon 3D 미리보기 | **RTX Chrome** (`companionTarget=1&noPhysics=1`) |
| 상태 동기화 | `BroadcastChannel` (실시간) |
| MP4 렌더 | RTX Chrome 탭 (Cursor에서 Export → Chrome에서 실행) |

### 워크플로

1. `npm run dev --workspace @mbox/web`
2. Cursor에서 `http://localhost:5173/showcase.html` 열기
3. **RTX Chrome이 자동으로 열림** (최초 1회). 안 열리면 「RTX Chrome에서 열기」
4. Cursor에서 사진·카탈로그 변경 → Chrome 탭에 실시간 반영
5. MP4 Export → Chrome 탭에서 렌더 후 Cursor에 완료 알림

검증: `npm run verify:chrome-companion` · URL 확인: `npm run dev:urls`

제목 옆 **「RTX Chrome 동반」** 배지가 보이면 shell 모드입니다.

### Chrome만 단독 사용

```bash
npm run open:showcase-gpu
```

native GPU, MJPEG/중계 없음. Cursor 없이 개발할 때 권장.

### MJPEG Worker (진단용만)

`?forceGpuRelay=1` — headless Chrome → MJPEG. 기본 경로 아님.

## WebGL이 깨질 때 (시스템 Chrome)

1. **터미널에 `npm run dev` 하나만** — 5173~5176 좀비 `node` 제거 (`npm run dev:stop`)
2. **chrome://gpu** — WebGL2 Enabled, 하드웨어 가속 On
3. GCS URL로 프리뷰 기대하지 않기 — `http://localhost:5173/showcase.html`

## GCP 비용 즉시 내리기

```bash
npm run gcp:scale-to-zero
```

## 한 줄 요약

- **Cursor** → 편집 shell + **RTX Chrome 동반** (0원, WebGL 우회)
- **Chrome 단독** → native RTX (`open:showcase-gpu`)
- **비용** → render-worker `min-instances=0`
- **향후** → 로컬 전용 앱(Tauri/Electron+GPU) 검토
