import { useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2, Music, RefreshCw } from "lucide-react";
import type { CubeBgmTrackId, MediaComboPreset, MediaComboPresetPatch } from "@mbox/shared";
import { VIEWPORT_BACKDROP_OPACITY_DEFAULT, VIEWPORT_BACKDROP_OPACITY_MIN } from "@mbox/shared";
import {
  deleteUserAssetViaApi,
  uploadUserAssetViaApi,
} from "../../../shared/api/userAssetsClient";
import { resolveBackgroundCatalogAssetPath } from "../../../shared/lib/backgroundAssetCatalog";
import type { BackgroundPlateTheme } from "../../../shared/lib/backgroundPlate";
import { BackgroundAssetPicker } from "../BackgroundAssetPicker";
import { BgmAssetPicker, probeBuiltinBgmAvailability } from "../BgmAssetPicker";
import type { ParticleThemeId } from "../cubeParticles";
import type { CubeFocusSettings } from "../CubeFocusPanel";
import { AssetDropZone } from "./AssetDropZone";
import { MediaComboPresets } from "./MediaComboPresets";
import { MediaOverlapHint } from "./MediaOverlapHint";
import { MediaSummaryBar } from "./MediaSummaryBar";
import { useMediaCatalogRefresh } from "./useMediaCatalogRefresh";

type BackgroundTab = "none" | "mine" | "builtin";
type BgmTab = "mine" | "builtin" | "upload";

interface MediaSectionProps {
  settings: Pick<
    CubeFocusSettings,
    | "viewportBackdropPath"
    | "viewportBackdropOpacity"
    | "bgmEnabled"
    | "bgmTrackId"
    | "bgmWorkspacePath"
    | "bgmCustomUrl"
    | "bgmVolume"
  >;
  disabled?: boolean;
  compact?: boolean;
  /** Face plate theme + particles for overlap hints and presets. */
  backgroundPlateTheme?: BackgroundPlateTheme;
  particleTheme?: ParticleThemeId;
  activeComboPresetId?: string | null;
  showComboPresets?: boolean;
  showOverlapHints?: boolean;
  onPatch: (partial: Partial<CubeFocusSettings>) => void;
  onCustomBgmFile?: (file: File | null) => void;
  /** Parent applies face theme / particles; MediaSection applies backdrop + BGM fields. */
  onApplyComboPreset?: (preset: MediaComboPreset, patch: MediaComboPresetPatch) => void;
}

function inferBackgroundTab(path: string | null): BackgroundTab {
  if (!path) return "none";
  if (path.startsWith("user-assets/")) return "mine";
  return "builtin";
}

function inferBgmTab(trackId: CubeBgmTrackId): BgmTab {
  if (trackId === "workspace") return "mine";
  if (trackId === "custom") return "upload";
  return "builtin";
}

export function MediaSection({
  settings,
  disabled = false,
  compact = false,
  backgroundPlateTheme = "original",
  particleTheme = "none",
  activeComboPresetId = null,
  showComboPresets = true,
  showOverlapHints = true,
  onPatch,
  onCustomBgmFile,
  onApplyComboPreset,
}: MediaSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { reloadToken, refreshing, refreshError, refreshCatalogs } = useMediaCatalogRefresh();
  const [bgTab, setBgTab] = useState<BackgroundTab>(() => inferBackgroundTab(settings.viewportBackdropPath));
  const [bgmTab, setBgmTab] = useState<BgmTab>(() => inferBgmTab(settings.bgmTrackId));
  const [bgmAvailable, setBgmAvailable] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    void probeBuiltinBgmAvailability().then(setBgmAvailable);
  }, []);

  const handleDeleteBackground = async (relativeFile: string) => {
    await deleteUserAssetViaApi(relativeFile);
    await refreshCatalogs();
    if (settings.viewportBackdropPath?.includes(relativeFile.split("/").pop() ?? "___")) {
      onPatch({ viewportBackdropPath: null });
    }
  };

  const handleDeleteBgm = async (publicPath: string) => {
    await deleteUserAssetViaApi(publicPath);
    await refreshCatalogs();
    if (settings.bgmWorkspacePath === publicPath) {
      onPatch({ bgmTrackId: "none", bgmWorkspacePath: null, bgmEnabled: false });
    }
  };

  const uploadBackgroundFiles = async (files: File[]) => {
    setUploading(true);
    setUploadError(null);
    try {
      let lastPath: string | null = null;
      for (const file of files) {
        const kind = file.type.startsWith("video/") ? "video" : "image";
        const { relativePath } = await uploadUserAssetViaApi(kind, file);
        const collectionId = kind === "video" ? "사용자_동영상" : "사용자_이미지";
        lastPath = resolveBackgroundCatalogAssetPath(collectionId, relativePath);
      }
      await refreshCatalogs();
      if (lastPath) {
        onPatch({ viewportBackdropPath: lastPath });
        setBgTab("mine");
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };

  const uploadBgmFiles = async (files: File[]) => {
    setUploading(true);
    setUploadError(null);
    try {
      let lastPublic: string | null = null;
      for (const file of files) {
        const { relativePath } = await uploadUserAssetViaApi("bgm", file);
        lastPublic = relativePath;
      }
      await refreshCatalogs();
      if (lastPublic) {
        onPatch({
          bgmEnabled: true,
          bgmTrackId: "workspace",
          bgmWorkspacePath: lastPublic,
          bgmCustomUrl: null,
        });
        setBgmTab("mine");
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };

  const tabClass = (active: boolean) =>
    `rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition ${
      active
        ? "border-mbox-gold/50 bg-mbox-gold/10 text-mbox-gold"
        : "border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.65)] text-mbox-muted hover:border-[rgba(223,179,134,0.18)]"
    }`;

  const handlePresetApply = (preset: MediaComboPreset, patch: MediaComboPresetPatch) => {
    const cubePatch: Partial<CubeFocusSettings> = {};
    if (patch.viewportBackdropPath !== undefined) {
      cubePatch.viewportBackdropPath = patch.viewportBackdropPath;
    }
    if (patch.bgmEnabled !== undefined) cubePatch.bgmEnabled = patch.bgmEnabled;
    if (patch.bgmTrackId !== undefined) cubePatch.bgmTrackId = patch.bgmTrackId as CubeBgmTrackId;
    if (patch.bgmWorkspacePath !== undefined) cubePatch.bgmWorkspacePath = patch.bgmWorkspacePath;
    if (patch.bgmCustomUrl !== undefined) cubePatch.bgmCustomUrl = patch.bgmCustomUrl;
    if (Object.keys(cubePatch).length > 0) {
      onPatch(cubePatch);
    }
    if (patch.viewportBackdropPath !== undefined) {
      setBgTab(patch.viewportBackdropPath ? (patch.viewportBackdropPath.startsWith("user-assets/") ? "mine" : "builtin") : "none");
    }
    if (patch.bgmTrackId !== undefined) {
      setBgmTab(inferBgmTab(patch.bgmTrackId as CubeBgmTrackId));
    }
    onApplyComboPreset?.(preset, patch);
  };

  return (
    <div ref={sectionRef} className="space-y-4">
      {showComboPresets && onApplyComboPreset ? (
        <MediaComboPresets
          compact={compact}
          disabled={disabled}
          activePresetId={activeComboPresetId}
          onApply={handlePresetApply}
        />
      ) : null}

      {showOverlapHints ? (
        <MediaOverlapHint
          compact={compact}
          state={{
            viewportBackdropPath: settings.viewportBackdropPath,
            viewportBackdropOpacity: settings.viewportBackdropOpacity,
            backgroundPlateTheme,
            particleTheme,
            bgmEnabled: settings.bgmEnabled,
            bgmTrackId: settings.bgmTrackId,
          }}
        />
      ) : null}

      <MediaSummaryBar
        viewportBackdropPath={settings.viewportBackdropPath}
        bgmEnabled={settings.bgmEnabled}
        bgmTrackId={settings.bgmTrackId}
        bgmWorkspacePath={settings.bgmWorkspacePath}
        onJumpToMedia={() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || refreshing}
          onClick={() => void refreshCatalogs()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.6)] px-2.5 py-1 text-[10px] font-semibold text-mbox-muted hover:border-mbox-gold/30 disabled:opacity-50"
        >
          {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          목록 새로고침
        </button>
        {refreshError ? (
          <span className="text-[10px] text-amber-400/90 truncate max-w-full">
            API 없음 — 터미널에서 npm run sync:user-assets 후 새로고침
          </span>
        ) : null}
        {uploadError ? (
          <span className="text-[10px] text-mbox-gold/90 truncate max-w-full">{uploadError}</span>
        ) : null}
      </div>

      <section className={compact ? "space-y-2" : "border-t border-[rgba(223,179,134,0.12)] pt-4 space-y-3"}>
        <div className="flex items-center gap-2 text-mbox-gold/90">
          <ImageIcon size={compact ? 14 : 16} />
          <h3 className={`font-bold text-mbox-text ${compact ? "text-xs" : "text-sm"}`}>화면 전체 배경</h3>
        </div>
        {!compact ? (
          <p className="text-[10px] leading-relaxed text-mbox-subtle">
            큐브 뒤·화면 전체를 채우는 밑배경입니다. 내 파일에 넣거나 기본 제공에서 고릅니다.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["none", "없음"],
              ["mine", "내 파일"],
              ["builtin", "기본 제공"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              disabled={disabled}
              className={tabClass(bgTab === id)}
              onClick={() => {
                setBgTab(id);
                if (id === "none") onPatch({ viewportBackdropPath: null });
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {bgTab === "mine" ? (
          <div className="space-y-2 rounded-xl border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.5)] p-3">
            <AssetDropZone
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              hint="이미지·동영상을 끌어다 놓거나 클릭 (JPG, PNG, MP4…)"
              disabled={disabled}
              busy={uploading}
              onFiles={uploadBackgroundFiles}
            />
            <BackgroundAssetPicker
              source="mine"
              selectedAssetPath={settings.viewportBackdropPath}
              disabled={disabled}
              reloadToken={reloadToken}
              onSelect={(path) => onPatch({ viewportBackdropPath: path || null })}
              onDeleteUserFile={handleDeleteBackground}
            />
          </div>
        ) : null}

        {bgTab === "builtin" ? (
          <div className="rounded-xl border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.5)] p-3">
            <BackgroundAssetPicker
              source="builtin"
              selectedAssetPath={settings.viewportBackdropPath}
              disabled={disabled}
              reloadToken={reloadToken}
              onSelect={(path) => onPatch({ viewportBackdropPath: path || null })}
            />
          </div>
        ) : null}

        {settings.viewportBackdropPath ? (
          <label className="block text-[10px] text-mbox-muted">
            배경 밝기 {(settings.viewportBackdropOpacity * 100).toFixed(0)}%
            <span className="text-mbox-subtle/80"> · 낮출수록 큐브·인물이 더 돋보입니다</span>
            <input
              type="range"
              min={VIEWPORT_BACKDROP_OPACITY_MIN}
              max={1}
              step={0.05}
              disabled={disabled}
              value={settings.viewportBackdropOpacity ?? VIEWPORT_BACKDROP_OPACITY_DEFAULT}
              onChange={(event) =>
                onPatch({ viewportBackdropOpacity: Number(event.target.value) })
              }
              className="mt-1 w-full"
            />
          </label>
        ) : null}
      </section>

      <section className={compact ? "space-y-2" : "border-t border-[rgba(223,179,134,0.12)] pt-4 space-y-3"}>
        <div className="flex items-center gap-2 text-mbox-gold/90">
          <Music size={compact ? 14 : 16} />
          <h3 className={`font-bold text-mbox-text ${compact ? "text-xs" : "text-sm"}`}>BGM</h3>
        </div>
        <label className="flex items-center gap-2 text-xs text-mbox-muted">
          <input
            type="checkbox"
            checked={settings.bgmEnabled}
            disabled={disabled}
            onChange={(event) => onPatch({ bgmEnabled: event.target.checked })}
          />
          MP4 생성 시 배경음악 포함
        </label>

        {settings.bgmEnabled ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["mine", "내 MP3"],
                  ["builtin", "기본 제공"],
                  ["upload", "이번만 업로드"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  className={tabClass(bgmTab === id)}
                  onClick={() => setBgmTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {bgmTab === "mine" ? (
              <div className="space-y-2 rounded-xl border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.5)] p-3">
                <AssetDropZone
                  accept="audio/mpeg,audio/mp3,audio/mp4,audio/wav"
                  hint="MP3를 끌어다 놓거나 클릭"
                  disabled={disabled}
                  busy={uploading}
                  onFiles={uploadBgmFiles}
                />
                <BgmAssetPicker
                  mode="mine"
                  selectedTrackId={settings.bgmTrackId}
                  selectedWorkspacePath={settings.bgmWorkspacePath}
                  disabled={disabled}
                  reloadToken={reloadToken}
                  bgmAvailable={bgmAvailable}
                  onSelectBuiltin={(id) =>
                    onPatch({ bgmTrackId: id, bgmWorkspacePath: null, bgmCustomUrl: null })
                  }
                  onSelectWorkspace={(publicPath) =>
                    onPatch({
                      bgmEnabled: true,
                      bgmTrackId: publicPath ? "workspace" : "none",
                      bgmWorkspacePath: publicPath || null,
                      bgmCustomUrl: null,
                    })
                  }
                  onDeleteWorkspaceFile={handleDeleteBgm}
                />
              </div>
            ) : null}

            {bgmTab === "builtin" ? (
              <BgmAssetPicker
                mode="builtin"
                selectedTrackId={settings.bgmTrackId}
                selectedWorkspacePath={settings.bgmWorkspacePath}
                disabled={disabled}
                reloadToken={reloadToken}
                bgmAvailable={bgmAvailable}
                onSelectBuiltin={(id) =>
                  onPatch({ bgmTrackId: id, bgmWorkspacePath: null, bgmCustomUrl: null })
                }
                onSelectWorkspace={() => undefined}
              />
            ) : null}

            {bgmTab === "upload" ? (
              <BgmAssetPicker
                mode="upload"
                selectedTrackId={settings.bgmTrackId}
                selectedWorkspacePath={settings.bgmWorkspacePath}
                disabled={disabled}
                reloadToken={reloadToken}
                bgmAvailable={bgmAvailable}
                onSelectBuiltin={() => undefined}
                onSelectWorkspace={() => undefined}
                uploadSlot={
                  <label className="block text-xs text-mbox-muted">
                    브라우저에만 임시 저장 (다음에 다시 업로드 필요)
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3"
                      disabled={disabled}
                      className="mt-1 block w-full text-mbox-muted"
                      onChange={(event) => onCustomBgmFile?.(event.target.files?.[0] ?? null)}
                    />
                  </label>
                }
              />
            ) : null}

            <label className="block text-xs text-mbox-muted">
              볼륨 {(settings.bgmVolume * 100).toFixed(0)}%
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                disabled={disabled}
                value={settings.bgmVolume}
                onChange={(event) => onPatch({ bgmVolume: Number(event.target.value) })}
                className="mt-1 w-full"
              />
            </label>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPatch({ bgmTrackId: "none", bgmEnabled: false, bgmWorkspacePath: null })}
              className="text-[11px] text-mbox-subtle underline"
            >
              BGM 없이 녹화
            </button>
          </>
        ) : null}
      </section>
    </div>
  );
}
