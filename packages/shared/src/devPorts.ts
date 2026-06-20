/** Local dev port map — keep `scripts/lib/dev-ports.mjs` defaults aligned. */

export const MBOX_WEB_DEV_PORT = 5173;
export const MBOX_WEB_PREVIEW_PORT = 4173;
export const MBOX_API_DEV_PORT = 8787;

/** Cloud Run / container listen port (not used for `npm run dev`). */
export const MBOX_API_CONTAINER_PORT = 8080;

export function localWebOrigin(port = MBOX_WEB_DEV_PORT): string {
  return `http://localhost:${port}`;
}

export function localApiBaseUrl(port = MBOX_API_DEV_PORT): string {
  return `http://127.0.0.1:${port}`;
}

export const DEFAULT_LOCAL_WEB_URL = localWebOrigin();
export const DEFAULT_LOCAL_API_URL = localApiBaseUrl();
