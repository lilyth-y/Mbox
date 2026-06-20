import { loadEnvLocal } from "./load-env-local.mjs";

loadEnvLocal();

/** @see packages/shared/src/devPorts.ts */
export const MBOX_WEB_DEV_PORT = Number(process.env.MBOX_WEB_DEV_PORT ?? 5173);
export const MBOX_WEB_PREVIEW_PORT = Number(process.env.MBOX_WEB_PREVIEW_PORT ?? 4173);
export const MBOX_API_DEV_PORT = Number(
  process.env.API_PORT ?? process.env.MBOX_API_DEV_PORT ?? 8787
);

export const WEB_URL = (process.env.WEB_URL ?? `http://localhost:${MBOX_WEB_DEV_PORT}`).replace(
  /\/$/,
  ""
);

export const API_URL = (process.env.API_URL ?? `http://127.0.0.1:${MBOX_API_DEV_PORT}`).replace(
  /\/$/,
  ""
);
