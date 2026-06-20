# Local port map

| Service | Env var | Default | URL |
|---------|---------|---------|-----|
| Web (Vite dev) | `MBOX_WEB_DEV_PORT` | **5173** | `http://localhost:5173` |
| Web (Vite preview) | `MBOX_WEB_PREVIEW_PORT` | **4173** | `http://localhost:4173` |
| API (`npm run dev`) | `API_PORT` | **8787** | `http://127.0.0.1:8787` |

Production API containers listen on **8080** (`MBOX_API_CONTAINER_PORT` in `@mbox/shared`).

## Configure

Root `.env` / `.env.local` (see `.env.example`):

```env
MBOX_WEB_DEV_PORT=5173
MBOX_WEB_PREVIEW_PORT=4173
API_PORT=8787
CORS_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=http://localhost:8787
```

`npm run dev` starts API + web together. Print resolved URLs:

```bash
npm run dev:urls
```

## Scripts & E2E

Verification scripts read `WEB_URL` and `API_URL` (from `scripts/lib/dev-ports.mjs`). Override per run:

```bash
WEB_URL=http://localhost:5174 API_URL=http://127.0.0.1:8787 npm run verify:local
```

In development the API allows any `http://localhost:*` / `http://127.0.0.1:*` origin, so Vite can fall back to 5174+ when 5173 is busy.

## LAN / mobile

Open the web UI via your machine IP (e.g. `http://192.168.0.10:5173`). Static wedding-simple JS maps API to `http://<same-host>:8787` unless `?api_url=` is set.
