import { DEFAULT_LOCAL_API_URL } from "@mbox/shared";

export const LOCALHOST_DEMO = import.meta.env.VITE_LOCALHOST_DEMO === "true";

export const API_PUBLIC_URL =
  import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") || DEFAULT_LOCAL_API_URL;

export const USE_SERVER_VAULT = import.meta.env.VITE_USE_SERVER_VAULT === "true";

/** Dev-only data/asset manifest batch (hidden when false). */
export const ENABLE_DEV_ASSET_BATCH =
  import.meta.env.VITE_ENABLE_DEV_ASSET_BATCH === "true" || LOCALHOST_DEMO;

export const WORKSPACE_ID = import.meta.env.VITE_WORKSPACE_ID?.trim() || "default";
