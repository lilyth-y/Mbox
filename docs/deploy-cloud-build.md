# Cloud Build CD (API + Web)

This playbook wires **Google Cloud Build** to:

1. **Build** the Vite web app (`@mbox/web`) with production `VITE_*` env vars.
2. **Sync** `apps/web/dist` to a **Google Cloud Storage** bucket (static hosting).
3. **Build & push** the API Docker image to **Artifact Registry**.
4. **Deploy** that image to **Cloud Run** with Vertex-friendly env + **Secret Manager** for `API_KEY`.

The pipeline definition lives at the repo root: [`cloudbuild.yaml`](../cloudbuild.yaml).

## 0. Prerequisites

- Billing enabled on the GCP project (e.g. `newmedia-496107`).
- [Repository root `cloudbuild.yaml`](../cloudbuild.yaml) is the config you submit or attach to a trigger.

## 1. Enable APIs

```bash
gcloud config set project YOUR_PROJECT_ID

gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com
```

## 2. Artifact Registry (API images)

```bash
export REGION=asia-northeast3   # same as cloudbuild _REGION

gcloud artifacts repositories create mbox \
  --repository-format=docker \
  --location="$REGION" \
  --description="mbox API images"
```

## 3. GCS bucket (web static files)

Pick a globally unique bucket name, e.g. `mbox-web-YOUR_PROJECT_ID`.

```bash
export WEB_BUCKET=mbox-web-YOUR_PROJECT_ID

gcloud storage buckets create "gs://${WEB_BUCKET}" \
  --location="$REGION" \
  --uniform-bucket-level-access

# Public read for static site (adjust if you front with HTTPS LB + IAP instead)
gcloud storage buckets add-iam-policy-binding "gs://${WEB_BUCKET}" \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

**SPA routing:** point website / 404 to `index.html` (exact commands vary; one option):

```bash
gsutil web set -m index.html -e index.html "gs://${WEB_BUCKET}"
```

**CORS on the bucket** is *not* the same as API `CORS_ORIGIN`. The API env `CORS_ORIGIN` must match the **Origin** header the browser sends when calling your API (see step 6).

## 4. Secret Manager (`API_KEY`)

```bash
printf '%s' 'your-long-random-api-key' | gcloud secrets create mbox-api-key --data-file=-
```

Cloud Run’s **runtime** service account (by default the project **Compute Engine default service account**) must read the secret:

```bash
export PROJECT_ID=$(gcloud config get-value project)
export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
export RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding mbox-api-key \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role=roles/secretmanager.secretAccessor
```

## 5. IAM for Cloud Build

Cloud Build runs as **`${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com`**. Grant:

| Role | Purpose |
|------|---------|
| `roles/artifactregistry.writer` | `docker push` to Artifact Registry |
| `roles/run.admin` | `gcloud run deploy` |
| `roles/iam.serviceAccountUser` | Act as the Cloud Run runtime SA when deploying |
| `roles/storage.objectAdmin` | `gcloud storage rsync` to the web bucket |

```bash
export CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

for ROLE in artifactregistry.writer run.admin iam.serviceAccountUser storage.objectAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${CB_SA}" \
    --role="roles/${ROLE}"
done
```

Vertex: grant the **runtime** SA `roles/aiplatform.user` on the project (same SA as in internal deploy docs).

## 6. Substitutions (important)

Trigger or manual `gcloud builds submit` should pass **substitutions** (see defaults in `cloudbuild.yaml`).

| Variable | Meaning |
|----------|---------|
| `_REGION` | Artifact Registry + Cloud Run region (default `asia-northeast3`) |
| `_AR_REPO` | Artifact Registry repository id (default `mbox`) |
| `_API_IMAGE_NAME` | Docker image name inside the repo (default `api`) |
| `_CLOUD_RUN_SERVICE` | Cloud Run service id (default `mbox-api`) |
| `_WEB_BUCKET` | GCS bucket **name** only (empty = skip upload, still builds web) |
| `_VITE_WORKSPACE_ID` | Passed to Vite as `VITE_WORKSPACE_ID` |
| `_VITE_USE_SERVER_VAULT` | `VITE_USE_SERVER_VAULT` |
| `_VITE_LOCALHOST_DEMO` | `VITE_LOCALHOST_DEMO` |
| `_VITE_ENABLE_DEV_ASSET_BATCH` | `VITE_ENABLE_DEV_ASSET_BATCH` |
| `_VITE_API_BASE_URL` | Public HTTPS URL of the Cloud Run API (often filled after first API deploy) |
| `_VITE_API_KEY` | Same value as `API_KEY` (embedded in the web bundle at build time) |
| `_CORS_ORIGIN` | **Single** origin allowed by the API (must match the browser’s `Origin` when calling the API — check DevTools → Network on a failing request; GCS website often looks like `https://BUCKET_NAME.storage.googleapis.com`) |
| `_API_KEY_SECRET` | Secret **id** (default `mbox-api-key`) |
| `_RUN_ALLOW_UNAUTHENTICATED` | `true` = `--allow-unauthenticated` on Run (IAM still applies for locking down later) |

**First-time bootstrap:** deploy API once with a placeholder web origin, read the Cloud Run URL, then set `_VITE_API_BASE_URL` and `_CORS_ORIGIN` to real values and rebuild the web (second pipeline run or a dedicated trigger).

## 7. Manual run

From the repo root (after `gcloud` auth and project set):

```bash
export REGION=asia-northeast3
export WEB_BUCKET=mbox-web-$(gcloud config get-value project)

gcloud builds submit --region="$REGION" --config=cloudbuild.yaml \
  --substitutions=_WEB_BUCKET="${WEB_BUCKET}",_VITE_API_BASE_URL=https://mbox-api-xxxxx.run.app,_VITE_API_KEY='your-key',_CORS_ORIGIN=https://${WEB_BUCKET}.storage.googleapis.com
```

Adjust `_CORS_ORIGIN` to whatever the browser sends (custom domain vs `storage.googleapis.com`).

## 8. GitHub trigger (optional)

Connect the repo in **Cloud Build → Repositories**, then create a trigger that uses **Cloud Build configuration file** `cloudbuild.yaml` and set the same substitutions in the trigger UI (use Secret Manager for `_VITE_API_KEY` in production via [substitutions from secrets](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values#using_secret_manager)).

## 9. Limits (same as other deploy docs)

- `WORKSPACE_DATA_DIR` on Cloud Run is **ephemeral** unless you attach a volume / use GCS for vault (see `docs/deploy-internal.md`).
- Multi-line or comma-heavy `CORS_ORIGIN` may need `gcloud`’s `#` delimiter; keep one origin per build for simplicity.

## 10. Troubleshooting

**Docker build fails with “Could not find a declaration file for module `@mbox/shared`” inside Cloud Build:** the upload often **excludes** `packages/*/dist` via `.gcloudignore` but can still include `**/tsconfig.tsbuildinfo`. TypeScript then thinks outputs are up to date and **emits nothing**. This repo ignores `**/*.tsbuildinfo` in `.gcloudignore` and runs `rm -f …tsbuildinfo` in `apps/api/Dockerfile` before `npm run build`. Local `@mbox/shared` and `@mbox/api` builds also delete `tsconfig.tsbuildinfo` before `tsc` so a missing `dist/` cannot strand the workspace.

**Cloud Run returns HTML `403 Forbidden` for `/health`:** some projects need an explicit **invoker** grant. The pipeline runs `gcloud run services add-iam-policy-binding … allUsers roles/run.invoker` when `_RUN_ALLOW_UNAUTHENTICATED=true`. If your org **blocks public access**, keep `_RUN_ALLOW_UNAUTHENTICATED=false` and use IAP / authenticated invoke instead.

## 11. Local consistency check

From repo root:

```bash
npm run check:cloudbuild
```

This verifies substitution docs, `.gcloudignore` / Dockerfile guards, and runs `npm run build`.
