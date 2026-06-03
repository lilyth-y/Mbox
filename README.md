# mbox

 이미지 분석·배경 편집·1024 크롭과 Three.js 큐브 시각화를 제공하는 웹 MVP입니다.

## 구조

- `apps/web` — React + Vite 프론트엔드
- `apps/api` — 프록시 API
- `docs` — 제품 목표와 아키텍처
- `experiments` — Tier 1/2/3 평가 자산
- `research` — 실험 보고서와 그림
- `scripts` — 재현 가능한 실험 스크립트
- `archive/example.html` — 이전 단일 파일 프로토타입 보관본

## 로컬 실행

1. 루트의 `.env.example`을 참고해 `apps/api/.env`와 `apps/web/.env`를 준비합니다. API는 Vertex AI를 사용하며 `GOOGLE_CLOUD_PROJECT`와 `gcloud auth application-default login`이 필요합니다.
2. 루트에서 시연용 dev 서버를 함께 실행합니다.

```bash
npm install
npm run dev
```

3. API만 또는 웹만 따로 실행할 수도 있습니다.

```bash
cd apps/api
npm install
npm run dev
```

```bash
cd apps/web
npm install
npm run dev
```

4. 브라우저에서 `http://localhost:5173`을 엽니다. `VITE_LOCALHOST_DEMO=true`이면 헤더에 Localhost Demo 배지가 표시됩니다.

## 결혼식장 간편 모드 / Wedding Simple

- **React 통합 탭**: `http://localhost:5173` → **결혼식장 간편 모드** (업로드 → AI 처리 → `marriage.mp4` 내보내기)
- **정적 단독 UI**: `http://localhost:5173/wedding-simple/index.html` (`apps/web/public/wedding-simple/`)
- 로컬 루트 `wedding-simple/` 폴더는 프로토타입 복사본이며, 배포 기준은 `apps/web/public/wedding-simple/`입니다.

### 로컬 검증 (API + web dev 서버 필요)

```bash
npm run dev
# 다른 터미널:
npm run verify:bg-removal      # 프로세싱 탭 → 배경 제거
npm run verify:cube-frames     # 3D 큐브 프레임 + MP4
npm run verify:wedding-simple  # /wedding-simple/ → marriage.mp4
npm run verify:local           # 위 3종 일괄
```

검증 스크립트는 API `/health`가 준비될 때까지 최대 120초 대기합니다 (`API_READY_TIMEOUT_MS`로 조정 가능).

## 스테이징 / 프로덕션

| 용도 | 문서 |
|------|------|
| **내부 팀 (5명 이내)** | [docs/deploy-internal.md](docs/deploy-internal.md), `.env.internal.example` |
| 일반 호스팅 참고 | [docs/deploy.md](docs/deploy.md), `.env.production.example` |
| **Cloud Build (API + web)** | [docs/deploy-cloud-build.md](docs/deploy-cloud-build.md), [cloudbuild.yaml](cloudbuild.yaml) |

내부 빌드: `apps/web/.env.production.local` 작성 후 `deploy/scripts/build-internal.ps1`

**KakaoTalk 소스 (20장):** `data/asset/temp_1778692001076.-1818431043/` · 빠른 큐브 미리보기: `npm run dev` 후 `python scripts/preview_kakao_cube_quick.py`

## 실험

Tier 1 스모크는 API 서버가 실행 중일 때 아래 명령으로 확인합니다. 기본 매니페스트는 `experiments/assets/original-sample-manifest.json`에 있는 원본 KakaoTalk JPG 3장을 사용합니다.

```bash
python scripts/fetch_web_assets.py
python scripts/run_experiment.py --tier tier1_smoke
python scripts/run_experiment.py --tier tier1_smoke --manifest experiments/assets/web-varied-manifest.json
python scripts/run_experiment.py --tier tier1_smoke --full-e2e
python scripts/verify_metrics.py
python scripts/verify_crop_bounds.py
```

## cs5 참조 에셋 (Git LFS)

Videohive 원본(`cs5/`, ~1.2GB)은 **Git LFS**로 버전 관리됩니다. 런타임은 이미 커밋된 `apps/web/public/cs5/`를 사용하며, 원본을 수정·재동기화할 때만 아래 절차가 필요합니다.

```bash
# 최초 clone (LFS 포함)
git lfs install
git clone <repo-url>
git lfs pull

# public/cs5 재생성 (VoluMax, box-logo, confetti 등)
npm run sync:cs5
```

- **원본**: `cs5/` — AE 프로젝트, PNG/MOV 등 전체 소스
- **배포용**: `apps/web/public/cs5/` — 웹에서 `/cs5/...`로 로드되는 서브셋
- LFS 없이 clone하면 `cs5/` 포인터만 받아집니다. `sync:cs5` 전에 `git lfs pull`을 실행하세요.

## 문서

- [docs/goals.md](docs/goals.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/modes.md](docs/modes.md)
- [TODO.md](TODO.md)
