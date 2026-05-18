import { useEffect, useState } from "react";
import { ImageUpscale, Music, Sparkles } from "lucide-react";
import type { CubeBgmTrackId, CubeFramePresetId } from "@mbox/shared";
import {
  CUBE_FRAME_PRESETS,
  DEFAULT_CUBE_FRAME_PRESET_ID,
  type CubeFramePresetDefinition,
} from "./cubeFramePresets";
import { CUBE_BGM_TRACKS, probeBgmAvailability } from "./bgm/bgmTracks";

export interface CubeFocusSettings {
  framePresetId: CubeFramePresetId;
  bgmEnabled: boolean;
  bgmTrackId: CubeBgmTrackId;
  bgmCustomUrl: string | null;
  bgmVolume: number;
}

export const DEFAULT_CUBE_FOCUS_SETTINGS: CubeFocusSettings = {
  framePresetId: DEFAULT_CUBE_FRAME_PRESET_ID,
  bgmEnabled: true,
  bgmTrackId: "cinematic_romantic",
  bgmCustomUrl: null,
  bgmVolume: 0.82,
};

interface CubeFocusPanelProps {
  settings: CubeFocusSettings;
  onSettingsChange: (settings: CubeFocusSettings) => void;
  disabled?: boolean;
  isEnhancingResolution?: boolean;
  enhancedCount?: number;
  totalCount?: number;
  onEnhanceResolution?: () => void;
}

export function CubeFocusPanel({
  settings,
  onSettingsChange,
  disabled = false,
  isEnhancingResolution = false,
  enhancedCount = 0,
  totalCount = 0,
  onEnhanceResolution,
}: CubeFocusPanelProps) {
  const [bgmAvailable, setBgmAvailable] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        CUBE_BGM_TRACKS.map(async (track) => [
          track.id,
          await probeBgmAvailability(track.publicPath),
        ] as const)
      );
      if (!cancelled) {
        setBgmAvailable(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (partial: Partial<CubeFocusSettings>) => {
    onSettingsChange({ ...settings, ...partial });
  };

  const handleCustomBgm = (file: File | null) => {
    if (settings.bgmCustomUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(settings.bgmCustomUrl);
    }
    if (!file) {
      patch({ bgmCustomUrl: null, bgmTrackId: "cinematic_romantic" });
      return;
    }
    patch({ bgmCustomUrl: URL.createObjectURL(file), bgmTrackId: "custom" });
  };

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center gap-2 text-rose-200/90">
          <Sparkles size={16} />
          <h3 className="text-sm font-bold text-slate-100">프레임 스타일 (5종)</h3>
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
          {CUBE_FRAME_PRESETS.map((preset: CubeFramePresetDefinition) => {
            const selected = settings.framePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                onClick={() => patch({ framePresetId: preset.id })}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  selected
                    ? "border-rose-400/60 bg-rose-500/15"
                    : "border-slate-800 bg-slate-950/50 hover:border-slate-600"
                }`}
              >
                <div
                  className={`mb-2 h-2 rounded-full bg-gradient-to-r ${preset.swatchClass}`}
                />
                <p className="text-xs font-semibold text-slate-100">{preset.label}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 text-emerald-300/90">
          <Music size={16} />
          <h3 className="text-sm font-bold text-slate-100">BGM 자동 합성</h3>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={settings.bgmEnabled}
            disabled={disabled}
            onChange={(event) => patch({ bgmEnabled: event.target.checked })}
          />
          MP4 생성 시 배경음악 포함
        </label>
        {settings.bgmEnabled ? (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CUBE_BGM_TRACKS.map((track) => {
                const available = bgmAvailable[track.id] ?? false;
                const selected = settings.bgmTrackId === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    disabled={disabled || !available}
                    onClick={() => patch({ bgmTrackId: track.id })}
                    className={`rounded-xl border px-3 py-2 text-left text-xs ${
                      selected
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : available
                          ? "border-slate-800 hover:border-slate-600"
                          : "border-slate-800 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <p className="font-semibold text-slate-100">{track.label}</p>
                    <p className="text-slate-500">{track.description}</p>
                    {!available ? (
                      <p className="mt-1 text-amber-400/90">파일 없음 · public/bgm/README.md</p>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <label className="block text-xs text-slate-400">
              직접 업로드 (MP3)
              <input
                type="file"
                accept="audio/mpeg,audio/mp3"
                disabled={disabled}
                className="mt-1 block w-full text-slate-300"
                onChange={(event) => handleCustomBgm(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="block text-xs text-slate-400">
              볼륨 {(settings.bgmVolume * 100).toFixed(0)}%
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                disabled={disabled}
                value={settings.bgmVolume}
                onChange={(event) => patch({ bgmVolume: Number(event.target.value) })}
                className="mt-1 w-full"
              />
            </label>
            <button
              type="button"
              disabled={disabled}
              onClick={() => patch({ bgmTrackId: "none", bgmEnabled: false })}
              className="text-[11px] text-slate-500 underline"
            >
              BGM 없이 녹화
            </button>
          </div>
        ) : null}
      </section>

      <section>
        <div className="flex items-center gap-2 text-sky-300/90">
          <ImageUpscale size={16} />
          <h3 className="text-sm font-bold text-slate-100">해상도 향상 (2×)</h3>
        </div>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
          보관함 사진을 최대 2048px 클래스로 업스케일·샤프닝합니다.
          {enhancedCount > 0 ? ` · 적용됨 ${enhancedCount}/${totalCount}장` : null}
        </p>
        <button
          type="button"
          disabled={disabled || isEnhancingResolution || totalCount === 0}
          onClick={onEnhanceResolution}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"
        >
          <ImageUpscale size={16} className={isEnhancingResolution ? "animate-pulse" : ""} />
          {isEnhancingResolution ? "해상도 향상 중..." : "보관함 전체 2× 향상"}
        </button>
      </section>
    </div>
  );
}