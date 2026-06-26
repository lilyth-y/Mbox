import { probeGpuSupport } from "../../../features/showcase/babylon/babylonCanvasGuard";
import { isEmbeddedIdeShell, isGpuRelaySourceSession } from "../gpuSession";
import type { GpuPresentationMode } from "./types";

/**
 * Cursor/VS Code shell — no in-tab WebGL. Preview runs in RTX Chrome (strategy B).
 */
export function usesChromeCompanionShell(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (isGpuRelaySourceSession()) {
    return false;
  }
  return import.meta.env.DEV && isEmbeddedIdeShell() && !probeGpuSupport().usable;
}

export function resolvePresentationMode(): GpuPresentationMode {
  if (typeof window === "undefined") {
    return "native";
  }
  if (isGpuRelaySourceSession()) {
    return "native";
  }
  return "native";
}

/** @deprecated MJPEG relay removed — always false. */
export function usesLocalGpuWorker(): boolean {
  return false;
}

export function usesCloudGpuPresentation(): boolean {
  return false;
}
