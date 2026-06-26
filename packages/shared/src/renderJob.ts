/** Where MP4 export runs: browser MediaRecorder or cloud render worker. */
export type RenderBackend = "local" | "cloud";

export type RenderJobKind = "crystal_showcase";

export type RenderJobStatus =
  | "queued"
  | "rendering"
  | "encoding"
  | "done"
  | "failed";

export type RenderOutputCodec = "h264" | "vp9";

export type RenderOutputProfile = {
  width: number;
  height: number;
  fps: number;
  codec: RenderOutputCodec;
  videoBitrate?: number;
};

/** In-store / booth playback — full quality. */
export const DEFAULT_CRYSTAL_OUTPUT_PROFILE: RenderOutputProfile = {
  width: 1080,
  height: 1080,
  fps: 60,
  codec: "h264",
  videoBitrate: 12_000_000,
};

/** Cloud worker — 30fps, native 1080 render, shorter encode wall time. */
export const CLOUD_CRYSTAL_OUTPUT_PROFILE: RenderOutputProfile = {
  width: 1080,
  height: 1080,
  fps: 30,
  codec: "h264",
  videoBitrate: 8_000_000,
};

export type ProcessedImageRef = {
  id: string;
  vaultPath?: string;
  url?: string;
};

/** Serializable showcase catalog for cloud workers (matches ShowcaseCatalogOptions). */
export type CrystalShowcaseCatalogOptions = Record<string, unknown>;

export type CrystalShowcaseJobSettings = {
  kind: "crystal_showcase";
  catalogOptions: CrystalShowcaseCatalogOptions;
  imageCount: number;
  fallPhysicsEnabled?: boolean;
  backdropMediaPath?: string | null;
};

export type RenderJobSettings = CrystalShowcaseJobSettings;

export type CreateRenderJobRequest = {
  kind: RenderJobKind;
  workspaceId?: string;
  processedImageRefs: ProcessedImageRef[];
  settings: RenderJobSettings;
  outputProfile?: Partial<RenderOutputProfile>;
};

export type RenderJobRecord = {
  id: string;
  kind: RenderJobKind;
  status: RenderJobStatus;
  workspaceId: string;
  processedImageRefs: ProcessedImageRef[];
  settings: RenderJobSettings;
  outputProfile: RenderOutputProfile;
  createdAt: number;
  updatedAt: number;
  outputUrl?: string;
  outputPath?: string;
  error?: string;
  progress?: number;
};

export type CreateRenderJobResponse = {
  job: RenderJobRecord;
};

export type GetRenderJobResponse = {
  job: RenderJobRecord;
};

export type ListRenderJobsResponse = {
  jobs: RenderJobRecord[];
};

export function resolveRenderOutputProfile(
  _kind: RenderJobKind,
  partial?: Partial<RenderOutputProfile>
): RenderOutputProfile {
  const base = DEFAULT_CRYSTAL_OUTPUT_PROFILE;
  return {
    ...base,
    ...partial,
    width: partial?.width ?? base.width,
    height: partial?.height ?? base.height,
    fps: partial?.fps ?? base.fps,
    codec: partial?.codec ?? base.codec,
  };
}

export function isTerminalRenderJobStatus(status: RenderJobStatus): boolean {
  return status === "done" || status === "failed";
}
