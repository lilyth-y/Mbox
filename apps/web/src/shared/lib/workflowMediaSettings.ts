import type { CubeBgmTrackId } from "@mbox/shared";

const WORKFLOW_MEDIA_KEY = "mbox.workflowMedia";
const LEGACY_ROSE_COMPOSITE_KEY = "mbox.compositeRoseSettings";

/** Fields shared across tabs: cube media + FFmpeg composite inputs. */
export interface PersistedWorkflowMedia {
  viewportBackdropPath: string | null;
  bgmEnabled: boolean;
  bgmTrackId: CubeBgmTrackId;
  bgmWorkspacePath: string | null;
  cubeSizeScale: number;
}

export const DEFAULT_WORKFLOW_MEDIA: PersistedWorkflowMedia = {
  viewportBackdropPath: null,
  bgmEnabled: true,
  bgmTrackId: "none",
  bgmWorkspacePath: null,
  cubeSizeScale: 1,
};

export function loadWorkflowMedia(): PersistedWorkflowMedia {
  try {
    const raw = localStorage.getItem(WORKFLOW_MEDIA_KEY);
    if (!raw) return { ...DEFAULT_WORKFLOW_MEDIA };
    return { ...DEFAULT_WORKFLOW_MEDIA, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_WORKFLOW_MEDIA };
  }
}

export function saveWorkflowMedia(media: PersistedWorkflowMedia): void {
  localStorage.setItem(WORKFLOW_MEDIA_KEY, JSON.stringify(media));
  window.dispatchEvent(new CustomEvent("mbox:workflow-media"));
}

export function workflowMediaFromCubeSettings(settings: {
  viewportBackdropPath: string | null;
  bgmEnabled: boolean;
  bgmTrackId: CubeBgmTrackId;
  bgmWorkspacePath: string | null;
  cubeSizeScale: number;
}): PersistedWorkflowMedia {
  return {
    viewportBackdropPath: settings.viewportBackdropPath,
    bgmEnabled: settings.bgmEnabled,
    bgmTrackId: settings.bgmTrackId,
    bgmWorkspacePath: settings.bgmWorkspacePath,
    cubeSizeScale: settings.cubeSizeScale,
  };
}

/** Merge persisted media into cube focus defaults (3D tab). */
export function applyWorkflowMediaToCubeDefaults<T extends PersistedWorkflowMedia>(
  defaults: T
): T {
  const media = loadWorkflowMedia();
  return {
    ...defaults,
    viewportBackdropPath: media.viewportBackdropPath,
    bgmEnabled: media.bgmEnabled,
    bgmTrackId: media.bgmTrackId,
    bgmWorkspacePath: media.bgmWorkspacePath,
    cubeSizeScale: media.cubeSizeScale,
  };
}

/** One-time migration from rose-only composite localStorage. */
export function migrateLegacyRoseCompositeSettings(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_ROSE_COMPOSITE_KEY);
    if (!legacy) return;
    const parsed = JSON.parse(legacy) as { cubeScale?: number };
    if (typeof parsed.cubeScale === "number") {
      const media = loadWorkflowMedia();
      saveWorkflowMedia({ ...media, cubeSizeScale: parsed.cubeScale });
    }
    localStorage.removeItem(LEGACY_ROSE_COMPOSITE_KEY);
  } catch {
    /* ignore */
  }
}
