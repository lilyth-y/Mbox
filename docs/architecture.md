# Architecture

Crystal Showcase is the **primary product surface**. Legacy studio (Three.js cube) and wedding-simple remain for regression only. MP4 export moves to cloud workers when `VITE_RENDER_BACKEND=cloud`.

## Flow (Crystal-first)

1. User opens `showcase.html` (default `/` redirect).
2. `processShowcaseUpload` sends images to `apps/api` for optional analyze/edit.
3. `apps/api` calls Vertex AI Gemini for metadata; background removal via `/edit` when enabled.
4. Processed images stored in vault (local workspace dir or GCS when `VITE_USE_SERVER_VAULT=true`).
5. `ShowcaseDashboard` builds Babylon physics scene; pipeline director runs reveal → rotate → fall → bounce → morph.
6. Export:
   - **local** (default): browser `MediaRecorder` via `showcaseExportCapture.ts`
   - **cloud**: `POST /render/jobs` → headless worker → GCS MP4 → signed URL

## Legacy flow (studio / wedding-simple)

1. `studio.html` — full gallery + cube tabs (frozen feature set).
2. `wedding-simple` — one-click entrance MP4 using shared `apps/web/src/features/cube/` motion code.
3. cube_focus export: 30 FPS manual frame pump; optional FFmpeg composite for background plates.

See [legacy-cube.md](./legacy-cube.md) and [modes.md](./modes.md).

## Boundaries

| Package / app | Owns |
|---------------|------|
| `packages/shared` | API contracts, category policy, render job types, presentation defaults |
| `apps/api` | Prompts, model calls, vault, **render job API** |
| `apps/web` (Crystal) | Showcase UI, Babylon pipeline, local preview export |
| `apps/web` (legacy cube) | Three.js fan motion — **no new features** |
| Render worker | Headless Chromium capture, GCS upload, ffmpeg |
| `experiments` / `scripts` | Same API contract as web; verification tiers |

## Cloud components

| Component | Service | Doc |
|-----------|---------|-----|
| Static web | GCS + Cloudflare | [deploy-cloud-build.md](./deploy-cloud-build.md) |
| API | Cloud Run | [deploy-cloud-build.md](./deploy-cloud-build.md) |
| Vault / renders | GCS bucket | [cloud-render-spec.md](./cloud-render-spec.md) |
| Render workers | Cloud Run Jobs / VM + Chromium | [cloud-render-spec.md](./cloud-render-spec.md) |

## Security

- Vertex AI credentials stay on the API process (Application Default Credentials).
- `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` configure Vertex.
- Browser code never stores provider credentials.
- Render jobs require API key; output URLs are signed and time-limited.

## Related docs

- [crystal-architecture.md](./crystal-architecture.md) — Crystal module map
- [render-pipelines.md](./render-pipelines.md) — MP4 specs (Crystal vs cube_focus)
- [cloud-render-spec.md](./cloud-render-spec.md) — Job API and worker
- [legacy-cube.md](./legacy-cube.md) — Deprecation policy
- [b2c-reuse.md](./b2c-reuse.md) — Auth and tenancy path
