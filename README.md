# mbox

크리스탈 쇼케이스(Crystal Showcase) 중심 이미지 분석·배경 편집·MP4 렌더 파이프라인.

## 제품 진입점

| URL | 설명 |
|-----|------|
| **`http://localhost:5173/`** | **Crystal** (기본 — `showcase.html`로 이동) |
| `http://localhost:5173/showcase.html` | 크리스털 쇼케이스 대시보드 |
| `http://localhost:5173/studio.html` | Legacy 스튜디오 (Three.js cube, 동결) |
| `http://localhost:5173/wedding-simple/` | Legacy 웨딩 원클릭 MP4 (동결) |

## 구조

- `apps/web` — React + Vite (Crystal MPA + legacy studio)
- `apps/api` — API + render job 엔드포인트
- `packages/shared` — 계약 타입 (render job 포함)
- `docs` — [crystal-architecture.md](docs/crystal-architecture.md), [cloud-render-spec.md](docs/cloud-render-spec.md)
- `scripts` — 검증·클라우드 렌더 워커

## 로컬 실행

1. `.env.example` 참고 → `apps/api/.env`, `apps/web/.env`
2. Vertex: `GOOGLE_CLOUD_PROJECT` + `gcloud auth application-default login`

```bash
npm install
npm run dev
```

3. 브라우저: `http://localhost:5173` → Crystal (`npm run dev:urls`로 포트 확인)

포트: [docs/ports.md](docs/ports.md) — 웹 **5173**, API **8787**

## 검증

### Crystal (메인 CI)

```bash
npm run dev
npm run verify:showcase-commercial
npm run verify:showcase-shapes
```

### Legacy cube (회귀)

```bash
npm run verify:cube-frames
npm run verify:wedding-simple
```

### 클라우드 렌더

```bash
npm run verify:render-job-crystal
npm run verify:render-job-cube
```

## 스테이징 / 프로덕션

| 용도 | 문서 |
|------|------|
| 내부 팀 (5명 이내) | [docs/deploy-internal.md](docs/deploy-internal.md) |
| Cloud Build | [docs/deploy-cloud-build.md](docs/deploy-cloud-build.md) |
| 클라우드 MP4 | [docs/cloud-render-spec.md](docs/cloud-render-spec.md) |

클라우드 export: `VITE_RENDER_BACKEND=cloud` (워커 배포 후)

## 문서

- [docs/crystal-architecture.md](docs/crystal-architecture.md) — Crystal 모듈 맵
- [docs/render-pipelines.md](docs/render-pipelines.md) — MP4 스펙
- [docs/legacy-cube.md](docs/legacy-cube.md) — 폐기 정책
- [docs/architecture.md](docs/architecture.md)
- [docs/modes.md](docs/modes.md)
- [TODO.md](TODO.md)
