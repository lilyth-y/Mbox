import { useEffect, useState } from "react";
import { ImageUpscale, Music, Sparkles } from "lucide-react";
import type { CubeBgmTrackId, CubeFramePresetId } from "@mbox/shared";
import {
  CUBE_FRAME_PRESETS,
  DEFAULT_CUBE_FRAME_PRESET_ID,
  type CubeFramePresetDefinition,
} from "./cubeFramePresets";
import { CUBE_BGM_TRACKS, probeBgmAvailability } from "./bgm/bgmTracks";
import type { ParticleThemeId } from "./cubeParticles";
import type { CubeRotationMode } from "./cubeTransitionRotation";
import type { PresentationEffectId } from "./presentationEffects";

export interface CubeFocusSettings {
  framePresetId: CubeFramePresetId;
  bgmEnabled: boolean;
  bgmTrackId: CubeBgmTrackId;
  bgmCustomUrl: string | null;
  bgmVolume: number;
  hologramMode: boolean;
  particleTheme: ParticleThemeId;
  voluMaxFxEnabled: boolean;
  voluMaxFxIntensity: "soft" | "medium" | "strong";
  /** VoluMax dual-layer depth split (fg/bg shader) on cube faces */
  voluMaxDepthEnabled: boolean;
  cs5BoxLogoEnabled: boolean;
  cs5FlareEnabled: boolean;
  cs5CloudsEnabled: boolean;
  cs5DirtEnabled: boolean;
  cs5DustEnabled: boolean;
  cs5ConfettiEnabled: boolean;
  cs5ConfettiVariant: number;
  cubeRotationMode: CubeRotationMode;
  gradientColorCycle: boolean;
}

const CUBE_ROTATION_OPTIONS: { id: CubeRotationMode; label: string }[] = [
  { id: "auto", label: "자동 (단계별 혼합)" },
  { id: "mixed", label: "혼합 스타일" },
  { id: "yaw_cw", label: "좌→우 회전" },
  { id: "yaw_ccw", label: "우→좌 회전" },
  { id: "pitch_up", label: "위로 기울기" },
  { id: "pitch_down", label: "아래로 기울기" },
  { id: "roll", label: "롤 회전" },
  { id: "corner_swing", label: "코너 스윙" },
];

export const DEFAULT_CUBE_FOCUS_SETTINGS: CubeFocusSettings = {
  framePresetId: DEFAULT_CUBE_FRAME_PRESET_ID,
  bgmEnabled: true,
  bgmTrackId: "cinematic_romantic",
  bgmCustomUrl: null,
  bgmVolume: 0.82,
  hologramMode: true,
  particleTheme: "gold_dust",
  voluMaxFxEnabled: true,
  voluMaxFxIntensity: "medium",
  voluMaxDepthEnabled: true,
  cs5BoxLogoEnabled: false,
  cs5FlareEnabled: false,
  cs5CloudsEnabled: false,
  cs5DirtEnabled: false,
  cs5DustEnabled: false,
  cs5ConfettiEnabled: false,
  cs5ConfettiVariant: 1,
  cubeRotationMode: "yaw_cw",
  gradientColorCycle: false,
};

interface CubeFocusPanelProps {
  settings: CubeFocusSettings;
  /** When set and not cube_focus, cube rotation controls are disabled (fan-only). */
  presentationEffectId?: PresentationEffectId;
  onSettingsChange: (settings: CubeFocusSettings) => void;
  disabled?: boolean;
  isEnhancingResolution?: boolean;
  enhancedCount?: number;
  totalCount?: number;
  onEnhanceResolution?: () => void;
}

export function CubeFocusPanel({
  settings,
  presentationEffectId = "cube_focus",
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

  const rotationControlsEnabled = presentationEffectId === "cube_focus";

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

      <section className="border-t border-rose-500/20 pt-4">
        <div className="flex items-center gap-2 text-rose-300">
          <Sparkles size={16} />
          <h3 className="text-sm font-bold text-slate-100">3D 홀로그램 팬 최적화 (결혼식/전시장)</h3>
        </div>
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.hologramMode}
              disabled={disabled}
              onChange={(event) => patch({ hologramMode: event.target.checked })}
              className="rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-rose-500"
            />
            <span>
              3D 홀로그램 팬 모드 (1:1 · 원형 디스크 마스크 — 팬블레이드 실제 표시 영역)
            </span>
          </label>
          {settings.hologramMode ? (
            <div className="pl-5 space-y-2">
              <label className="block text-[11px] font-semibold text-slate-400">
                웨딩 파티클 필터 효과
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "none", label: "없음" },
                  { id: "gold_dust", label: "금가루 (Gold)" },
                  { id: "white_petals", label: "꽃잎 (Petal)" },
                  { id: "floating_hearts", label: "하트 (Heart)" },
                  { id: "confetti", label: "컨페티 (Confetti)" },
                ].map((themeOption) => {
                  const selected = settings.particleTheme === themeOption.id;
                  return (
                    <button
                      key={themeOption.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => patch({ particleTheme: themeOption.id as ParticleThemeId })}
                      className={`rounded-lg border py-1.5 text-center text-xs transition ${
                        selected
                          ? "border-rose-400/50 bg-rose-500/10 text-rose-200"
                          : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      {themeOption.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.voluMaxDepthEnabled}
                    disabled={disabled}
                    onChange={(event) => patch({ voluMaxDepthEnabled: event.target.checked })}
                    className="rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-rose-500"
                  />
                  <span>VoluMax 깊이 분리 (인물·배경 시차 · AI depth)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.voluMaxFxEnabled}
                    disabled={disabled}
                    onChange={(event) => patch({ voluMaxFxEnabled: event.target.checked })}
                    className="rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-rose-500"
                  />
                  <span>VoluMax 무드 FX (스캔 링 · 글로우)</span>
                </label>
                {settings.voluMaxFxEnabled ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "soft", label: "Soft" },
                      { id: "medium", label: "Medium" },
                      { id: "strong", label: "Strong" },
                    ].map((opt) => {
                      const selected = settings.voluMaxFxIntensity === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => patch({ voluMaxFxIntensity: opt.id as "soft" | "medium" | "strong" })}
                          className={`rounded-lg border py-1.5 text-center text-xs transition ${
                            selected
                              ? "border-rose-400/50 bg-rose-500/10 text-rose-200"
                              : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className="mt-3 space-y-2">
                <p className="text-[11px] font-semibold text-slate-400">CS5 레퍼런스 에셋 (VoluMax · Box Logo · Confetti)</p>
                {[
                  { key: "cs5BoxLogoEnabled" as const, label: "Box Logo — Lens / 바" },
                  { key: "cs5FlareEnabled" as const, label: "VoluMax — Flare (FLARE.png)" },
                  { key: "cs5CloudsEnabled" as const, label: "VoluMax — Clouds" },
                  { key: "cs5DirtEnabled" as const, label: "VoluMax — Dirt" },
                  { key: "cs5DustEnabled" as const, label: "VoluMax — Dust particles" },
                  { key: "cs5ConfettiEnabled" as const, label: "Confetti Pack — 비디오 오버레이" },
                ].map((row) => (
                  <label
                    key={row.key}
                    className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={settings[row.key]}
                      disabled={disabled}
                      onChange={(event) => patch({ [row.key]: event.target.checked })}
                      className="rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-rose-500"
                    />
                    <span>{row.label}</span>
                  </label>
                ))}
                {settings.cs5ConfettiEnabled ? (
                  <div className="grid grid-cols-5 gap-1 pl-5">
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((v) => {
                      const selected = settings.cs5ConfettiVariant === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          disabled={disabled}
                          onClick={() => patch({ cs5ConfettiVariant: v })}
                          className={`rounded border py-1 text-center text-[10px] transition ${
                            selected
                              ? "border-rose-400/50 bg-rose-500/10 text-rose-200"
                              : "border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-700"
                          }`}
                        >
                          #{v}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <p className="text-[10px] leading-relaxed text-slate-500">
                  cs5 원본 PNG·MOV를 그대로 로드합니다. 기본값 OFF — 기존 연출 유지.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="border-t border-slate-800 pt-4">
        <div className="flex items-center gap-2 text-violet-300/90">
          <Sparkles size={16} />
          <h3 className="text-sm font-bold text-slate-100">큐브 회전 방향</h3>
        </div>
        {!rotationControlsEnabled ? (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            정육면체(팬) 연출에서만 적용됩니다. 다른 베타 템플릿은 자체 회전 타임라인을 사용합니다.
          </p>
        ) : null}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CUBE_ROTATION_OPTIONS.map((option) => {
            const selected = settings.cubeRotationMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled || !rotationControlsEnabled}
                onClick={() => patch({ cubeRotationMode: option.id })}
                className={`rounded-lg border py-2 px-2 text-center text-[11px] font-semibold transition ${
                  selected
                    ? "border-violet-400/50 bg-violet-500/15 text-violet-100"
                    : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-600"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="border-t border-slate-800 pt-4">
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.gradientColorCycle}
            disabled={disabled}
            onChange={(event) => patch({ gradientColorCycle: event.target.checked })}
            className="rounded border-slate-700 bg-slate-950 text-violet-500 focus:ring-violet-500"
          />
          <span>액자·장면 색상 그라데이션 순환 (연속 변화)</span>
        </label>
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