# Deployment guide

This document covers moving from **Localhost Demo** to hosted staging/production.

**Internal team (≤5 users, one company):** use the focused playbook [deploy-internal.md](deploy-internal.md) and `.env.internal.example`.  
**Future B2C:** see [b2c-reuse.md](b2c-reuse.md) for what to keep vs replace.

## Architecture

| Component | Suggested host | Notes |
|-----------|----------------|-------|
| `apps/web` | Cloudflare Pages, S3+CloudFront, Firebase Hosting | Static `dist/` after `npm run build --workspace @mbox/web` |
| `apps/api` | Cloud Run, GKE, VM | Docker image from `apps/api/Dockerfile` |
| Workspace vault | API disk volume or GCS (future) | `WORKSPACE_DATA_DIR` on API |
| Gemini | Vertex AI | ADC on API via service account |

## 1. API (Cloud Run sketch)

```bash
# Build from repo root
docker build -f apps/api/Dockerfile -t mbox-api .

# Push to Artifact Registry, then deploy with:
# - Service account with Vertex AI User
# - Env: GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, CORS_ORIGIN, API_KEY
# - Volume mount for WORKSPACE_DATA_DIR (Cloud Run 2nd gen volume) OR single-instance VM
gcloud run deploy mbox-api \
  --image REGION-docker.pkg.dev/PROJECT/mbox/api:latest \
  --region asia-northeast3 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=...,CORS_ORIGIN=https://app.example.com,API_KEY=..." \
  --no-allow-unauthenticated
```

For **internal pilots**, prefer `--no-allow-unauthenticated` plus IAM invoker or IAP/VPN; see [deploy-internal.md](deploy-internal.md).

`GET /health` stays public when using API-key-only mode. When `API_KEY` is set, all other routes require header `X-API-Key: <secret>` (or `Authorization: Bearer <secret>`).

Rate limit: `RATE_LIMIT_PER_MINUTE` (default 120) per client IP.

## 2. Web

Set build-time variables (see `.env.production.example`):

```bash
export VITE_API_BASE_URL=https://api.example.com
export VITE_API_KEY=your-api-key
export VITE_USE_SERVER_VAULT=true
export VITE_LOCALHOST_DEMO=false
export VITE_ENABLE_DEV_ASSET_BATCH=false
# Optional: cloud MP4 render (requires render worker — see docs/cloud-render-spec.md)
# export VITE_RENDER_BACKEND=cloud
npm run build --workspace @mbox/web
```

Deploy `apps/web/dist` to your static host. Default entry `index.html` redirects to **Crystal** (`showcase.html`). Legacy studio: `studio.html`.

## 2b. Cloud render worker (optional)

See [cloud-render-spec.md](cloud-render-spec.md). Run `node scripts/render-worker.mjs` against API + web, or deploy `apps/render-worker/Dockerfile`.

```bash
export VITE_RENDER_BACKEND=cloud
```

## 3. Workspace API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/workspace/bootstrap` | Active event vault + meta |
| PUT | `/workspace/events/:id/vault` | Save processed gallery |
| POST | `/workspace/events` | Create event |
| DELETE | `/workspace/events/:id` | Delete event |

Header `X-Workspace-Id` (default `default`) isolates tenants on one API instance.

Web flag `VITE_USE_SERVER_VAULT=true` syncs events through these endpoints instead of browser `localStorage` only.

## 4. Supabase / object storage (next step)

Current server store writes JSON under `WORKSPACE_DATA_DIR`. For multi-instance Cloud Run:

1. Replace `workspaceStore.ts` backend with GCS or Supabase Storage blobs per event.
2. Keep the same REST paths so the web client unchanged.
3. Store only metadata in Postgres (event list, active id, assignments).

## 5. Security checklist

- [ ] Set `API_KEY` in production
- [ ] Restrict `CORS_ORIGIN` to your web domain(s)
- [ ] Do not commit `.env` or production secrets
- [ ] Use GCP service account for Vertex (not user ADC on server)
- [ ] Monitor Gemini quota and `RATE_LIMIT_PER_MINUTE`
- [ ] Plan backup for `WORKSPACE_DATA_DIR` or bucket

## Cloud Build (API + static web)

For **Google Cloud Build** driving Artifact Registry, Cloud Run (API), and GCS (web `dist/`), see [deploy-cloud-build.md](deploy-cloud-build.md) and the root [cloudbuild.yaml](../cloudbuild.yaml).

## 6. Local staging test

```bash
# Terminal 1 — API with key
API_KEY=dev-secret WORKSPACE_DATA_DIR=./data/workspaces npm run dev --workspace @mbox/api

# Terminal 2 — Web pointed at API
VITE_API_BASE_URL=http://localhost:8787 \
VITE_API_KEY=dev-secret \
VITE_USE_SERVER_VAULT=true \
VITE_LOCALHOST_DEMO=false \
npm run dev --workspace @mbox/web
```
