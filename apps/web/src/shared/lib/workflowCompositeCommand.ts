import type { CubeBgmTrackId } from "@mbox/shared";
import type { PersistedWorkflowMedia } from "./workflowMediaSettings";

const BUILTIN_BGM_FILES: Partial<Record<Exclude<CubeBgmTrackId, "none" | "custom" | "workspace">, string>> = {
  cinematic_romantic: "cinematic-romantic.mp3",
  piano_slideshow: "piano-slideshow.mp3",
  romantic_wedding: "romantic-wedding.mp3",
  bridal_chorus: "bridal-chorus.mp3",
};

const BUILTIN_BGM_LABELS: Partial<Record<Exclude<CubeBgmTrackId, "none" | "custom" | "workspace">, string>> = {
  cinematic_romantic: "시네마 로맨틱",
  piano_slideshow: "피아노 슬라이드",
  romantic_wedding: "로맨틱 웨딩 피아노",
  bridal_chorus: "클래식 입장곡",
};

export type CompositeBlendMode = "ColorKey" | "Screen" | "Hybrid";

export interface WorkflowCompositeSettings {
  foregroundPath: string;
  outputPath: string;
  segmentSeconds: number;
  blendMode: CompositeBlendMode;
  hybridSwitchSec: number;
  /** When true, bg / bgm / cube scale come from workflow media (cube tab). */
  syncWorkflowMedia: boolean;
  cubeScale: number;
}

export const DEFAULT_WORKFLOW_COMPOSITE_SETTINGS: WorkflowCompositeSettings = {
  foregroundPath: String.raw`%USERPROFILE%\Downloads\mbox-cube_focus.mp4`,
  outputPath: String.raw`c:\startingup\Mbox\experiments\outputs\workflow_composite.mp4`,
  segmentSeconds: 120,
  blendMode: "Screen",
  hybridSwitchSec: 60,
  syncWorkflowMedia: true,
  cubeScale: 1.35,
};

const WORKFLOW_COMPOSITE_KEY = "mbox.workflowComposite";

export function loadWorkflowCompositeSettings(): WorkflowCompositeSettings {
  try {
    const raw = localStorage.getItem(WORKFLOW_COMPOSITE_KEY);
    if (!raw) return { ...DEFAULT_WORKFLOW_COMPOSITE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<WorkflowCompositeSettings>;
    return { ...DEFAULT_WORKFLOW_COMPOSITE_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_WORKFLOW_COMPOSITE_SETTINGS };
  }
}

export function saveWorkflowCompositeSettings(settings: WorkflowCompositeSettings): void {
  localStorage.setItem(WORKFLOW_COMPOSITE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("mbox:workflow-composite"));
}

function migrateFromRoseComposite(): Partial<WorkflowCompositeSettings> | null {
  try {
    const raw = localStorage.getItem("mbox.compositeRoseSettings");
    if (!raw) return null;
    const legacy = JSON.parse(raw) as {
      cubeScale?: number;
      segmentSeconds?: number;
      blendMode?: CompositeBlendMode;
      hybridSwitchSec?: number;
    };
    localStorage.removeItem("mbox.compositeRoseSettings");
    return {
      cubeScale: legacy.cubeScale,
      segmentSeconds: legacy.segmentSeconds,
      blendMode: legacy.blendMode,
      hybridSwitchSec: legacy.hybridSwitchSec,
    };
  } catch {
    return null;
  }
}

export function loadWorkflowCompositeSettingsWithMigration(): WorkflowCompositeSettings {
  const legacy = migrateFromRoseComposite();
  const current = loadWorkflowCompositeSettings();
  if (!legacy) return current;
  const merged = { ...current, ...legacy };
  saveWorkflowCompositeSettings(merged);
  return merged;
}

/** Basename for -BackgroundName / -BgmName (PS1 resolves under data/). */
export function backgroundCliName(assetPath: string | null | undefined): string | null {
  if (!assetPath) return null;
  const normalized = assetPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? null;
}

export function resolveCompositeCubeScale(
  settings: WorkflowCompositeSettings,
  media: PersistedWorkflowMedia
): number {
  return settings.syncWorkflowMedia ? media.cubeSizeScale : settings.cubeScale;
}

function bgmCliArgs(
  media: PersistedWorkflowMedia
): string[] {
  if (!media.bgmEnabled || media.bgmTrackId === "none") {
    return [];
  }
  if (media.bgmTrackId === "workspace" && media.bgmWorkspacePath) {
    const name = backgroundCliName(media.bgmWorkspacePath);
    return name ? ["-BgmName", quoteCli(name)] : [];
  }
  const builtinFile =
    media.bgmTrackId !== "custom" && media.bgmTrackId !== "workspace"
      ? BUILTIN_BGM_FILES[media.bgmTrackId]
      : undefined;
  if (builtinFile) {
    return [
      "-BgmPath",
      quoteCli(String.raw`c:\startingup\Mbox\apps\web\public\bgm\${builtinFile}`),
    ];
  }
  return [];
}

function quoteCli(value: string): string {
  if (/[\s"]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

export function buildWorkflowCompositeCommand(
  settings: WorkflowCompositeSettings,
  media: PersistedWorkflowMedia
): string {
  const cubeScale = resolveCompositeCubeScale(settings, media);
  const parts = [
    "npm run composite:video --",
    `-Foreground ${quoteCli(settings.foregroundPath)}`,
    `-Output ${quoteCli(settings.outputPath)}`,
    `-CubeScale ${cubeScale.toFixed(2)}`,
    `-SegmentSeconds ${settings.segmentSeconds}`,
    `-BlendMode ${settings.blendMode}`,
  ];

  if (settings.syncWorkflowMedia) {
    const bgName = backgroundCliName(media.viewportBackdropPath);
    if (bgName) {
      parts.push(`-BackgroundName ${quoteCli(bgName)}`);
    }
    parts.push(...bgmCliArgs(media));
  }

  if (settings.blendMode === "Hybrid") {
    parts.push(`-HybridSwitchSec ${settings.hybridSwitchSec}`);
  }

  return parts.join(" ");
}

export function describeWorkflowMediaSummary(media: PersistedWorkflowMedia): string {
  const bg = backgroundCliName(media.viewportBackdropPath) ?? "미설정 (3D 큐브 탭에서 배경 선택)";
  let bgm = "없음";
  if (media.bgmEnabled && media.bgmTrackId !== "none") {
    if (media.bgmTrackId === "workspace" && media.bgmWorkspacePath) {
      bgm = backgroundCliName(media.bgmWorkspacePath) ?? "워크스페이스 BGM";
    } else if (media.bgmTrackId === "custom") {
      bgm = "업로드 BGM";
    } else if (media.bgmTrackId in BUILTIN_BGM_LABELS) {
      bgm = BUILTIN_BGM_LABELS[media.bgmTrackId as keyof typeof BUILTIN_BGM_LABELS] ?? media.bgmTrackId;
    } else {
      bgm = media.bgmTrackId;
    }
  }
  return `배경 ${bg} · BGM ${bgm} · 큐브 ${media.cubeSizeScale.toFixed(2)}×`;
}
