# Internal deployment (≤5 users)

Playbook for **one company, small team (about 5 people)**, VPN or corp network only.  
Not public B2C. Reuse the same codebase later for B2C — see [b2c-reuse.md](b2c-reuse.md).

## Target profile

| Item | Choice |
|------|--------|
| Users | ≤5, trusted colleagues |
| Network | Corp VPN, Zero Trust, or private URL (not indexed) |
| Auth | Shared `API_KEY` in web build + network boundary (no SSO required for pilot) |
| Gallery | `VITE_USE_SERVER_VAULT=true` on API disk volume |
| API scale | **Single Cloud Run instance** (`min=1`, `max=1`) while using file vault |
| Dev tools | `VITE_ENABLE_DEV_ASSET_BATCH=false`, `VITE_LOCALHOST_DEMO=false` |

## What you do *not* need yet

- Per-user login, billing, multi-tenant DB
- GCS / Supabase (until you scale past one API instance or need backup SLA)
- Public `allow-unauthenticated` without network restriction

Add those in the **B2C phase**; keep REST paths and `packages/shared` stable so the web app changes little.

## Environment files

Copy templates:

- API runtime: `deploy/internal/api.env.example` → store secrets in GCP Secret Manager or team vault (not git)
- Web build: `.env.internal.example` → `apps/web/.env.production.local` (gitignored)

## Step 1 — GCP (one project per company pilot)

1. Enable Vertex AI in `GOOGLE_CLOUD_LOCATION` (e.g. `asia-northeast3`).
2. Create service account `mbox-api` with **Vertex AI User**.
3. Create Artifact Registry repo `mbox`.
4. (Optional) Internal DNS: `mbox-api.corp.example.com`, `mbox.corp.example.com`.

## Step 2 — Build and push API image

From repo root:

```bash
docker build -f apps/api/Dockerfile -t mbox-api .
docker tag mbox-api REGION-docker.pkg.dev/PROJECT/mbox/api:latest
docker push REGION-docker.pkg.dev/PROJECT/mbox/api:latest
```

## Step 3 — Cloud Run (single instance + volume)

File vault requires **one instance** or a mounted volume:

```bash
gcloud run deploy mbox-api \
  --image REGION-docker.pkg.dev/PROJECT/mbox/api:latest \
  --region asia-northeast3 \
  --min-instances 1 \
  --max-instances 1 \
  --memory 1Gi \
  --cpu 1 \
  --no-allow-unauthenticated \
  --service-account mbox-api@PROJECT.iam.gserviceaccount.com \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=PROJECT,GOOGLE_CLOUD_LOCATION=asia-northeast3,CORS_ORIGIN=https://mbox.corp.example.com,API_KEY=...,RATE_LIMIT_PER_MINUTE=180,WORKSPACE_DATA_DIR=/var/lib/mbox/workspaces" \
  --add-volume name=workspace,type=cloud-storage,bucket=BUCKET_NAME \
  --add-volume-mount volume=workspace,mount-path=/var/lib/mbox/workspaces
```

**Simpler pilot:** one small **VM** + Docker Compose with `WORKSPACE_DATA_DIR` on a host folder and nightly backup — often easier than volumes for 5 users.

**Access:** grant `roles/run.invoker` only to a group `mbox-users@company.com`, or put **Cloudflare Access / IAP** in front. Do not rely on API key alone if the Run URL could leak.

## Step 4 — Build web (internal)

```bash
# PowerShell — load apps/web/.env.production.local first, or:
$env:VITE_API_BASE_URL="https://mbox-api.corp.example.com"
$env:VITE_API_KEY="<same-as-API_KEY>"
$env:VITE_WORKSPACE_ID="company-pilot"
$env:VITE_USE_SERVER_VAULT="true"
$env:VITE_LOCALHOST_DEMO="false"
$env:VITE_ENABLE_DEV_ASSET_BATCH="false"
npm run build --workspace @mbox/web
```

Host `apps/web/dist` on internal static hosting (Cloud Storage + LB, Firebase, or existing corp portal).

## Step 5 — Team onboarding (5 people)

1. Share **web URL** only on corp wiki / Slack (not public).
2. Share **API key** via password manager (1 entry per pilot).
3. Agree on `VITE_WORKSPACE_ID` (one per pilot program) or one workspace per event season.
4. Use **이벤트 / 프로젝트** panel for each shoot/campaign — same as local.
5. Weekly: export / backup `WORKSPACE_DATA_DIR` or GCS bucket prefix.

## Operations checklist

- [ ] `API_KEY` set on API and web build
- [ ] `CORS_ORIGIN` = internal web URL only
- [ ] Cloud Run `max-instances=1` (or VM) while using file vault
- [ ] Vertex quota alert in GCP
- [ ] Backup job for workspace data
- [ ] Dev batch button off in production build
- [ ] Document who may upload client photos (data policy)

## Local dry-run (before corp deploy)

```powershell
# API
$env:API_KEY="dev-internal-secret"
$env:WORKSPACE_DATA_DIR="./data/workspaces"
npm run dev --workspace @mbox/api

# Web (second terminal)
$env:VITE_API_BASE_URL="http://localhost:8787"
$env:VITE_API_KEY="dev-internal-secret"
$env:VITE_USE_SERVER_VAULT="true"
$env:VITE_LOCALHOST_DEMO="false"
$env:VITE_ENABLE_DEV_ASSET_BATCH="false"
npm run dev --workspace @mbox/web
```

Or run `deploy/scripts/build-internal.ps1` after filling `apps/web/.env.production.local`.

## When to upgrade (still internal, larger team)

| Signal | Action |
|--------|--------|
| >5 users or 2+ API instances | Move vault to GCS; keep `/workspace/*` API |
| Need per-person audit | IAP / SSO + log proxy |
| Larger images / quota errors | Raise limits, Tier 2/3 eval, cache tuning |

## Related

- [deploy.md](deploy.md) — general hosting reference
- [b2c-reuse.md](b2c-reuse.md) — what to keep for a future consumer product
