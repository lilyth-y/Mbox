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

```bash
gsutil web set -m index.html -e index.html "gs://${WEB_BUCKET}"
```

**Static asset URLs:** `gsutil web` only sets the default object. Vite defaults to absolute `/assets/...`, which on `https://storage.googleapis.com/BUCKET_NAME/index.html` resolve to the **wrong host path** (`/assets` at the domain root → white screen). This repo sets `base: "./"` in `apps/web/vite.config.ts` so bundles load from `.../BUCKET_NAME/assets/...`.

**CORS on the bucket** is *not* the same as API `CORS_ORIGIN`. The API env `CORS_ORIGIN` must match the **Origin** header the browser sends when calling your API (see step 6).

**`index.html` caching:** after `gcloud storage rsync`, the pipeline re-uploads `index.html` with `Cache-Control: no-cache, must-revalidate` so browsers pick up new hashed JS/CSS after each deploy. Hashed files under `assets/` can stay long-lived.

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
| `_CORS_ORIGIN` | Allowed browser **Origins** for the API (comma-separated). Must match the `Origin` header on API requests. **Virtual-hosted GCS URL** `https://BUCKET_NAME.storage.googleapis.com` is what browsers send; path-style `https://storage.googleapis.com/BUCKET_NAME/...` sends `Origin: https://storage.googleapis.com`. Include **both** if you use both URLs. Example: `https://storage.googleapis.com,https://mbox-web-PROJECT_ID.storage.googleapis.com` |
| `_API_KEY_SECRET` | Secret **id** (default `mbox-api-key`) |
| `_RUN_ALLOW_UNAUTHENTICATED` | `true` = `--allow-unauthenticated` on Run (IAM still applies for locking down later) |

**`VITE_API_KEY`:** loaded from Secret Manager (`mbox-api-key`) during the `web-build` step — not a substitution.

**First-time bootstrap:** deploy API once with a placeholder web origin, read the Cloud Run URL, then set `_VITE_API_BASE_URL` and `_CORS_ORIGIN` to real values and rebuild the web (second pipeline run or a dedicated trigger).

## 7. Manual run

From the repo root (after `gcloud` auth and project set):

```bash
export REGION=asia-northeast3
export WEB_BUCKET=mbox-web-$(gcloud config get-value project)

gcloud builds submit --region="$REGION" --config=cloudbuild.yaml \
  --substitutions="^;^_WEB_BUCKET=${WEB_BUCKET};_VITE_API_BASE_URL=https://mbox-api-xxxxx.run.app;_CORS_ORIGIN=https://storage.googleapis.com,https://${WEB_BUCKET}.storage.googleapis.com"
```

Adjust `_CORS_ORIGIN` to match every **Origin** your users hit (custom domain, path-style vs virtual-hosted GCS). If a manual `gcloud run services update` fails on commas inside `CORS_ORIGIN`, use `gcloud`’s alternate delimiter (see [escaping](https://cloud.google.com/sdk/gcloud/reference/topic/escaping)), e.g. `--update-env-vars="^;^CORS_ORIGIN=https://a,https://b"` — **do not** pass a one-key `--env-vars-file` unless the file lists **all** non-secret variables, or Cloud Run will drop the rest.

## 8. GitHub trigger (`lilyth-y/Mbox`)

Production repo: **https://github.com/lilyth-y/Mbox**

`cloudbuild.yaml` loads **`VITE_API_KEY` from Secret Manager** (`mbox-api-key`) at web build time — do not put the API key in trigger substitutions.

### 8.1 One-time (project `newmedia-496107`)

1. Grant the Cloud Build service account `roles/secretmanager.secretAccessor` on `mbox-api-key` (see step 4).
2. Create the GitHub connection (browser OAuth + install the Cloud Build GitHub App):

```bash
gcloud builds connections create github mbox-github \
  --region=asia-northeast3 --project=newmedia-496107
```

Open the URL printed by the command (or Cloud Console → Cloud Build → Repositories → Link repository). Wait until:

```bash
gcloud builds connections describe mbox-github --region=asia-northeast3 --format='value(installationState.stage)'
```

returns **`COMPLETE`** (not `PENDING_USER_OAUTH`).

If connection create fails on Secret Manager, grant `roles/secretmanager.admin` to  
`service-PROJECT_NUMBER@gcp-sa-cloudbuild.iam.gserviceaccount.com` once, then retry.

### 8.2 Link repo + create trigger

From the repo root (defaults: `lilyth-y` / `Mbox`):

```powershell
.\scripts\setup_github_cloudbuild_trigger.ps1
```

Or push code first, then run the script:

```bash
git remote add origin https://github.com/lilyth-y/Mbox.git
git push -u origin master
```

Trigger **`mbox-deploy-master`** runs `cloudbuild.yaml` on push to **`master`** or **`main`**. Defaults in `cloudbuild.yaml` already point at `mbox-web-newmedia-496107` and the Cloud Run API URL.

## 9. Limits (same as other deploy docs)

- `WORKSPACE_DATA_DIR` on Cloud Run is **ephemeral** unless you attach a volume / use GCS for vault (see `docs/deploy-internal.md`).
- **`CORS_ORIGIN` with commas:** `cloudbuild.yaml` deploy uses `gcloud`’s `^;^` / `;` delimiter so multiple origins work. For ad-hoc CLI fixes, use `--update-env-vars="^;^CORS_ORIGIN=https://origin1,https://origin2"` (see [gcloud escaping](https://cloud.google.com/sdk/gcloud/reference/topic/escaping)).

## 10. Troubleshooting

**Blank (white) page on GCS but `index.html` loads:** often a bad JS chunk URL (`base` / caching) or a **failed API** call blocked by CORS (check DevTools → Console / Network). Prefer **`https://BUCKET_NAME.storage.googleapis.com/`** and ensure `CORS_ORIGIN` on Cloud Run includes exactly that origin string.

**Docker build fails with “Could not find a declaration file for module `@mbox/shared`” inside Cloud Build:** the upload often **excludes** `packages/*/dist` via `.gcloudignore` but can still include `**/tsconfig.tsbuildinfo`. TypeScript then thinks outputs are up to date and **emits nothing**. This repo ignores `**/*.tsbuildinfo` in `.gcloudignore` and runs `rm -f …tsbuildinfo` in `apps/api/Dockerfile` before `npm run build`. Local `@mbox/shared` and `@mbox/api` builds also delete `tsconfig.tsbuildinfo` before `tsc` so a missing `dist/` cannot strand the workspace.

**Cloud Run returns HTML `403 Forbidden` for `/health`:** some projects need an explicit **invoker** grant. The pipeline runs `gcloud run services add-iam-policy-binding … allUsers roles/run.invoker` when `_RUN_ALLOW_UNAUTHENTICATED=true`. If your org **blocks public access**, keep `_RUN_ALLOW_UNAUTHENTICATED=false` and use IAP / authenticated invoke instead.

## 11. Local consistency check

From repo root:

```bash
npm run check:cloudbuild
```

This verifies substitution docs, `.gcloudignore` / Dockerfile guards, and runs `npm run build`.
