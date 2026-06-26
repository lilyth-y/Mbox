import type { RenderBackend } from "@mbox/shared";

/** MP4 export target: browser MediaRecorder (default) or cloud render worker. */
export function resolveRenderBackend(): RenderBackend {
  if (typeof window !== "undefined") {
    const w = window as unknown as { __MBOX_RENDER_BACKEND__?: unknown };
    const override = typeof w.__MBOX_RENDER_BACKEND__ === "string" ? w.__MBOX_RENDER_BACKEND__ : "";
    const o = override.trim().toLowerCase();
    if (o === "cloud" || o === "local") {
      return o as RenderBackend;
    }
  }
  const raw = import.meta.env.VITE_RENDER_BACKEND?.trim().toLowerCase();
  if (raw === "cloud") return "cloud";
  if (raw === "local") return "local";
  // Default: cloud in production, local in development/testing
  return import.meta.env.PROD ? "cloud" : "local";
}

export function isCloudRenderBackend(): boolean {
  return resolveRenderBackend() === "cloud";
}
