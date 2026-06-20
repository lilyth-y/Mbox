import { useState } from "react";
import { ImageUpscale, Sparkles } from "lucide-react";
import type { MediaComboPreset, MediaComboPresetPatch } from "@mbox/shared";
import {
  DEFAULT_CUBE_PRESENTATION_OPTIONS,
  type CubeFrameFinishId,
  DEFAULT_PRESENTATION_MICRO_MODULE_STATE,
  ORBITAL_SHAPE_OPTIONS,
  PRESENTATION_MICRO_MODULE_SPECS,
  readMicroModuleEnabled,
  writeMicroModuleEnabled,
  type CubeBgmTrackId,
  type CubeFramePresetId,
  type PresentationMicroModuleState,
} from "@mbox/shared";
import {
  WEDDING_BACKGROUND_THEMES,
  type BackgroundPlateTheme,
} from "../../shared/lib/backgroundPlate";
import { DEFAULT_CUBE_FRAME_PRESET_ID } from "./cubeFramePresets";
import type { ParticleThemeId } from "./cubeParticles";
import type { CubeRotationMode } from "./cubeTransitionRotation";
import type { PresentationEffectId } from "./presentationEffects";
import { MediaSection } from "./media/MediaSection";
import { VoluMaxStatusHeader } from "./media/VoluMaxStatusHeader";
import type { VoluMaxReadinessSummary } from "../../shared/lib/voluMaxReadiness";
import {
  DEFAULT_FRAME_BORDER_WIDTH_ID,
  type FrameBorderWidthId,
} from "./frameBorderWidth";
import { FrameSettingsControls } from "./FrameSettingsControls";
import { CubeShowcaseStepsControls } from "./CubeShowcaseStepsControls";
import { CubeSizeControl } from "./CubeSizeControl";
import { patchVoluMaxDepthEnabled } from "./voluMaxDepthSettings";

export interface CubeFocusSettings {
  framePresetId: CubeFramePresetId;
  bgmEnabled: boolean;
  bgmTrackId: CubeBgmTrackId;
  bgmCustomUrl: string | null;
  /** Relative path under data/user-assets when bgmTrackId is workspace (e.g. bgm/song.mp3). */
  bgmWorkspacePath: string | null;
  bgmVolume: number;
  hologramMode: boolean;
  particleTheme: ParticleThemeId;
  voluMaxFxEnabled: boolean;
  voluMaxFxIntensity: "soft" | "medium" | "strong";
  /** VoluMax dual-layer depth split (fg/bg shader) on cube faces */
  voluMaxDepthEnabled: boolean;
  /** Auto-build bg plate + fg matte when cube tab opens (off = manual button) */
  voluMaxAutoPrepareLayers: boolean;
  /** Use browser AI cutout for VoluMax foreground matte (slower) */
  voluMaxAiForegroundCutout: boolean;
  backgroundPlateTheme: BackgroundPlateTheme;
  /** Full-viewport scene backdrop from data/background (behind the whole cube). */
  viewportBackdropPath: string | null;
  /** 0.35–1.0 strength for viewport backdrop (1 = full brightness). */
  viewportBackdropOpacity: number;
  cs5BoxLogoEnabled: boolean;
  cs5FlareEnabled: boolean;
  cs5CloudsEnabled: boolean;
  cs5DirtEnabled: boolean;
  cs5DustEnabled: boolean;
  cs5ConfettiEnabled: boolean;
  cs5ConfettiVariant: number;
  cubeRotationMode: CubeRotationMode;
  /** Angular-velocity integration for cube_focus spins (opt-in). */
  cubeAngularInertiaEnabled: boolean;
  /** Mesh size in 3D preview / MP4 (independent of fan zoom timeline). */
  cubeSizeScale: number;
  /** Lub-dub pulse during face showcase (cube_focus). */
  cubeHeartbeatEnabled: boolean;
  /** Camera + scale dolly on approach / retreat (cube_focus). */
  cubeShowcaseZoomEnabled: boolean;
  /** Pitch / roll tumble layered on yaw (cube_focus). */
  cubeComplexRotationEnabled: boolean;
  cubeZoomIntensity: number;
  cubeComplexRotationIntensity: number;
  cubeAcceleratedSpinIntensity: number;
  cubeSubjectPullIntensity: number;
  cubeHeartbeatIntensity: number;
  /** VoluMax fg-only pull; background plate fixed (cube_focus). */
  cubeSubjectPullEnabled: boolean;
  /** Yaw tempo follows zoom scale — fast when small, slow at peak (cube_focus). */
  cubeScaleCoupledSpinEnabled: boolean;
  /** Fan blade / cube spin tempo (cube_focus). */
  fanSpeed: number;
  /** Hex color override for cube face frame shader (e.g. #e5b3b3). Null = preset swatch only. */
  customFrameColor: string | null;
  frameBorderWidth: FrameBorderWidthId;
  /** Glossy lacquer vs wood grain — tints from photo core color in shader. */
  frameFinishId: CubeFrameFinishId;
  gradientColorCycle: boolean;
  /** Opt-in micro-modules (default all OFF). */
  microModules: PresentationMicroModuleState;
}

export const DEFAULT_CUBE_FOCUS_SETTINGS: CubeFocusSettings = {
  framePresetId: DEFAULT_CUBE_FRAME_PRESET_ID,
  bgmEnabled: DEFAULT_CUBE_PRESENTATION_OPTIONS.bgmEnabled,
  bgmTrackId: "none",
  bgmCustomUrl: null,
  bgmWorkspacePath: null,
  bgmVolume: 0.82,
  hologramMode: DEFAULT_CUBE_PRESENTATION_OPTIONS.hologramMode,
  particleTheme: DEFAULT_CUBE_PRESENTATION_OPTIONS.particleTheme as ParticleThemeId,
  voluMaxFxEnabled: DEFAULT_CUBE_PRESENTATION_OPTIONS.voluMaxFxEnabled,
  voluMaxFxIntensity: "medium",
  voluMaxDepthEnabled: DEFAULT_CUBE_PRESENTATION_OPTIONS.voluMaxDepthEnabled,
  voluMaxAutoPrepareLayers: DEFAULT_CUBE_PRESENTATION_OPTIONS.voluMaxAutoPrepareLayers,
  voluMaxAiForegroundCutout: DEFAULT_CUBE_PRESENTATION_OPTIONS.voluMaxAiForegroundCutout,
  backgroundPlateTheme: DEFAULT_CUBE_PRESENTATION_OPTIONS.backgroundPlateTheme,
  viewportBackdropPath: null,
  viewportBackdropOpacity: 1,
  cs5BoxLogoEnabled: false,
  cs5FlareEnabled: false,
  cs5CloudsEnabled: false,
  cs5DirtEnabled: false,
  cs5DustEnabled: false,
  cs5ConfettiEnabled: false,
  cs5ConfettiVariant: 1,
  cubeRotationMode: DEFAULT_CUBE_PRESENTATION_OPTIONS.cubeRotationMode as CubeRotationMode,
  cubeAngularInertiaEnabled: DEFAULT_CUBE_PRESENTATION_OPTIONS.cubeAngularInertiaEnabled,
  cubeSizeScale: DEFAULT_CUBE_PRESENTATION_OPTIONS.cubeSizeScale,
  cubeHeartbeatEnabled: DEFAULT_CUBE_PRESENTATION_OPTIONS.cubeHeartbeatEnabled,
  cubeShowcaseZoomEnabled: DEFAULT_CUBE_PRESENTATION_OPTIONS.cubeShowcaseZoomEnabled,
  cubeComplexRotationEnabled: DEFAULT_CUBE_PRESENTATION_OPTIONS.cubeComplexRotationEnabled,
  cubeZoomIntensity: DEFAULT_CUBE_PRESENTATION_OPTIONS.cubeZoomIntensity,
  cubeComplexRotationIntensity: DEFAULT_CUBE_PRESENTATION_OPTIONS.cubeComplexRotationIntensity,
  cubeAcceleratedSpinIntensity: DEFAULT_CUBE_PRESENTATION_OPTIONS.cubeAcceleratedSpinIntensity,
  cubeSubjectPullIntensity: DEFAULT_CUBE_PRESENTATION_OPTIONS.cubeSubjectPullIntensity,
  cubeHeartbeatIntensity: DEFAULT_CUBE_PRESENTATION_OPTIONS.cubeHeartbeatIntensity,
  cubeSubjectPullEnabled: DEFAULT_CUBE_PRESENTATION_OPTIONS.cubeSubjectPullEnabled,
  cubeScaleCoupledSpinEnabled:
    DEFAULT_CUBE_PRESENTATION_OPTIONS.cubeScaleCoupledSpinEnabled,
  fanSpeed: DEFAULT_CUBE_PRESENTATION_OPTIONS.fanSpeed,
  customFrameColor: null,
  frameBorderWidth: DEFAULT_FRAME_BORDER_WIDTH_ID,
  frameFinishId: DEFAULT_CUBE_PRESENTATION_OPTIONS.frameFinishId,
  gradientColorCycle: false,
  microModules: { ...DEFAULT_PRESENTATION_MICRO_MODULE_STATE },
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
  isPreparingPlates?: boolean;
  preparedVoluMaxFaceCount?: number;
  voluMaxReadiness?: VoluMaxReadinessSummary;
  onPrepareVoluMaxLayers?: () => void;
  /** 레이어 준비 + 깊이 분리 ON (한 번에) */
  onVoluMaxOneClickSetup?: () => void;
  /** Frame controls rendered in CubeView toolbar */
  hideFrameSection?: boolean;
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
  isPreparingPlates = false,
  preparedVoluMaxFaceCount = 0,
  voluMaxReadiness,
  onPrepareVoluMaxLayers,
  onVoluMaxOneClickSetup,
  hideFrameSection = false,
}: CubeFocusPanelProps) {
  const [activeComboPresetId, setActiveComboPresetId] = useState<string | null>(null);

  const patch = (partial: Partial<CubeFocusSettings>) => {
    onSettingsChange({ ...settings, ...partial });
  };

  const setVoluMaxDepthEnabled = (voluMaxDepthEnabled: boolean) => {
    patch(patchVoluMaxDepthEnabled(voluMaxDepthEnabled));
  };

  const handleApplyComboPreset = (_preset: MediaComboPreset, presetPatch: MediaComboPresetPatch) => {
    const settingsPatch: Partial<CubeFocusSettings> = {};
    if (presetPatch.backgroundPlateTheme !== undefined) {
      settingsPatch.backgroundPlateTheme = presetPatch.backgroundPlateTheme;
    }
    if (presetPatch.particleTheme !== undefined) {
      settingsPatch.particleTheme = presetPatch.particleTheme as CubeFocusSettings["particleTheme"];
    }
    if (Object.keys(settingsPatch).length > 0) {
      patch(settingsPatch);
    }
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
    patch({
      bgmCustomUrl: URL.createObjectURL(file),
      bgmTrackId: "custom",
      bgmWorkspacePath: null,
    });
  };

  return (
    <div className="space-y-5">
      {!hideFrameSection ? (
        <section>
          <div className="flex items-center gap-2 text-mbox-gold/90">
            <Sparkles size={16} />
            <h3 className="text-sm font-bold text-mbox-text">큐브 면 프레임 (3D 셰이더)</h3>
          </div>
          <div className="mt-3">
            <FrameSettingsControls
              value={{
                framePresetId: settings.framePresetId,
                frameFinishId: settings.frameFinishId,
                frameBorderWidth: settings.frameBorderWidth,
                customFrameColor: settings.customFrameColor,
                gradientColorCycle: settings.gradientColorCycle,
              }}
              onChange={(next) => patch(next)}
              disabled={disabled}
            />
          </div>
        </section>
      ) : null}

      <section className={hideFrameSection ? "" : "border-t border-[rgba(223,179,134,0.12)] pt-4"}>
        <div className="flex items-center gap-2 text-mbox-gold/90">
          <Sparkles size={16} />
          <h3 className="text-sm font-bold text-mbox-text">마이크로 모듈 (실험)</h3>
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-mbox-subtle">
          레지스트리(`presentationMicroModuleRegistry`) 기준. CubeView는 호스트만 사용 — 모듈 직접
          연결 금지. 기본값 OFF.
        </p>
        <div className="mt-3 space-y-3">
          {PRESENTATION_MICRO_MODULE_SPECS.map((module) => {
            const enabled = readMicroModuleEnabled(settings.microModules, module.id);
            return (
              <label
                key={module.id}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.45)] px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  checked={
                    presentationEffectId === "cube_focus" && module.id === "orbital_showcase"
                      ? false
                      : enabled
                  }
                  disabled={
                    disabled ||
                    (presentationEffectId === "cube_focus" && module.id === "orbital_showcase")
                  }
                  onChange={(event) =>
                    patch({
                      microModules: writeMicroModuleEnabled(
                        settings.microModules,
                        module.id,
                        event.target.checked
                      ),
                    })
                  }
                  className="mt-0.5 rounded border-[rgba(223,179,134,0.18)] bg-[rgba(18,14,24,0.75)] text-mbox-gold focus:ring-mbox-gold"
                />
                <span>
                  <span className="block text-xs font-semibold text-mbox-text">{module.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-mbox-subtle">
                    {module.description}
                  </span>
                  {module.qualityUpgrades.length > 0 ? (
                    <span className="mt-1 block text-[9px] text-mbox-gold/80">
                      퀄리티 로드맵 {module.qualityUpgrades.length}건 — docs/micro-modules.md
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
          {settings.microModules.orbitalShowcase ? (
            <div>
              <label className="block text-[11px] font-semibold text-mbox-muted">궤도 도형</label>
              <div className="mt-2 flex gap-2">
                {ORBITAL_SHAPE_OPTIONS.map((shape) => (
                  <button
                    key={shape.id}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      patch({
                        microModules: {
                          ...settings.microModules,
                          orbitalShapeId: shape.id,
                        },
                      })
                    }
                    className={`flex-1 rounded-lg border py-1.5 text-xs transition ${
                      settings.microModules.orbitalShapeId === shape.id
                        ? "border-mbox-gold/50 bg-mbox-gold/10 text-mbox-gold"
                        : "border-[rgba(223,179,134,0.12)] text-mbox-muted hover:border-[rgba(223,179,134,0.18)]"
                    }`}
                  >
                    {shape.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <MediaSection
        settings={settings}
        disabled={disabled}
        backgroundPlateTheme={settings.backgroundPlateTheme}
        particleTheme={settings.particleTheme}
        activeComboPresetId={activeComboPresetId}
        showComboPresets
        showOverlapHints
        onPatch={(partial) => {
          setActiveComboPresetId(null);
          patch(partial);
        }}
        onCustomBgmFile={handleCustomBgm}
        onApplyComboPreset={(preset, presetPatch) => {
          setActiveComboPresetId(preset.id);
          handleApplyComboPreset(preset, presetPatch);
        }}
      />

      <section className="border-t border-[rgba(223,179,134,0.12)] pt-4 space-y-3">
        <a
          href="./showcase.html"
          className="flex items-center gap-2 rounded-xl border border-[rgba(180,220,255,0.28)] bg-[rgba(120,180,255,0.08)] px-4 py-3 text-sm font-semibold text-sky-100 hover:border-sky-200/50 transition-colors"
        >
          <Sparkles size={16} className="text-sky-200" />
          크리스털 쇼케이스 (보석 큐브)
        </a>
        <p className="text-[10px] leading-relaxed text-mbox-subtle">
          큐브 6면에 보석 크리스털 프레임 + 스파클 — 새 연출 패러다임.
        </p>
        <a
          href="./premium.html"
          className="flex items-center gap-2 rounded-xl border border-[rgba(223,179,134,0.25)] bg-[rgba(223,179,134,0.06)] px-4 py-3 text-sm font-semibold text-mbox-gold hover:border-mbox-gold/50 transition-colors"
        >
          <Sparkles size={16} className="text-mbox-gold" />
          프리미엄 물리 연출 (Babylon.js)
        </a>
        <p className="text-[10px] leading-relaxed text-mbox-subtle">
          중력·바운스·큐브 충돌 등 물리 시뮬레이션 tier — Three.js 큐브와 별도 페이지.
        </p>
      </section>

      <section className="border-t border-[rgba(223,179,134,0.12)] pt-4 space-y-3">
        <VoluMaxStatusHeader
          preparedFaceCount={preparedVoluMaxFaceCount}
          totalFaceCount={totalCount}
          isPreparing={isPreparingPlates}
          backgroundPlateTheme={settings.backgroundPlateTheme}
          depthEnabled={settings.voluMaxDepthEnabled}
          onDepthEnabledChange={setVoluMaxDepthEnabled}
          depthToggleDisabled={disabled}
          readiness={voluMaxReadiness}
        />
        <p className="text-[10px] leading-relaxed text-mbox-subtle">
          원클릭으로 레이어 준비와 깊이 분리를 한 번에 켭니다. 스위치나 5단계에서 VoluMax를 끌 수
          있습니다.
        </p>
        <div className="space-y-3">
          {onVoluMaxOneClickSetup ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={disabled || isPreparingPlates || totalCount === 0}
                onClick={onVoluMaxOneClickSetup}
                className="flex-1 rounded-xl border-2 border-mbox-gold/50 bg-gradient-to-r from-mbox-gold/30 to-mbox-rose-gold/20 px-4 py-3 text-sm font-bold text-[#140f09] shadow-lg shadow-black/40 hover:from-mbox-gold/45 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPreparingPlates
                  ? "VoluMax 입체감 적용 중…"
                  : settings.voluMaxDepthEnabled
                    ? "VoluMax 레이어 다시 준비"
                    : "VoluMax 입체감 원클릭 (레이어 + 깊이 ON)"}
              </button>
              {settings.voluMaxDepthEnabled ? (
                <button
                  type="button"
                  disabled={disabled || isPreparingPlates}
                  onClick={() => setVoluMaxDepthEnabled(false)}
                  className="rounded-xl border border-[rgba(223,179,134,0.22)] bg-[rgba(18,14,24,0.65)] px-4 py-3 text-sm font-semibold text-mbox-muted hover:border-amber-500/35 hover:text-mbox-text disabled:cursor-not-allowed disabled:opacity-50 sm:shrink-0"
                >
                  VoluMax 끄기
                </button>
              ) : null}
            </div>
          ) : null}
          <label className="block text-[11px] font-semibold text-mbox-muted">
            누끼 뒤 배경 (VoluMax 유지)
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {WEDDING_BACKGROUND_THEMES.map((themeOption) => {
              const selected = settings.backgroundPlateTheme === themeOption.id;
              return (
                <button
                  key={themeOption.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => patch({ backgroundPlateTheme: themeOption.id })}
                  className={`rounded-lg border py-1.5 px-2 text-left text-xs transition ${
                    selected
                      ? "border-mbox-gold/50 bg-mbox-gold/10 text-mbox-gold"
                      : "border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.45)] text-mbox-muted hover:border-[rgba(223,179,134,0.18)]"
                  }`}
                >
                  {themeOption.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-mbox-subtle leading-relaxed">
            「원본 사진 배경」은 업로드 원본을 선명하게 누끼 뒤에 붙입니다. 블러가 필요하면
            「블러 배경」을 선택하세요. 테마 변경 시 배경 플레이트만 다시 생성됩니다.
          </p>
          {onPrepareVoluMaxLayers ? (
            <button
              type="button"
              disabled={disabled || isPreparingPlates || totalCount === 0}
              onClick={onPrepareVoluMaxLayers}
              className="w-full rounded-lg border border-[rgba(223,179,134,0.18)] bg-[rgba(18,14,24,0.65)] px-3 py-2 text-xs font-semibold text-mbox-muted hover:border-mbox-gold/30 hover:text-mbox-text disabled:opacity-50"
            >
              {isPreparingPlates ? "준비 중…" : "지금 VoluMax 레이어만 준비 (깊이 설정 유지)"}
            </button>
          ) : null}
          {settings.voluMaxDepthEnabled ? (
            <div className="pl-5 space-y-2">
              <label className="flex items-center gap-2 text-xs text-mbox-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.voluMaxAutoPrepareLayers}
                  disabled={disabled}
                  onChange={(event) => patch({ voluMaxAutoPrepareLayers: event.target.checked })}
                  className="rounded border-[rgba(223,179,134,0.18)] bg-[rgba(18,14,24,0.75)] text-[#140f09]0 focus:ring-mbox-gold"
                />
                <span>큐브 탭 진입 시 레이어 자동 준비</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-mbox-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.voluMaxAiForegroundCutout}
                  disabled={disabled}
                  onChange={(event) => patch({ voluMaxAiForegroundCutout: event.target.checked })}
                  className="rounded border-[rgba(223,179,134,0.18)] bg-[rgba(18,14,24,0.75)] text-[#140f09]0 focus:ring-mbox-gold"
                />
                <span>인물 AI 누끼 (VoluMax 실루엣·테두리 시차에 필수)</span>
              </label>
            </div>
          ) : null}
        </div>
      </section>

      <section className="border-t border-mbox-gold/20 pt-4">
        <div className="flex items-center gap-2 text-mbox-gold">
          <Sparkles size={16} />
          <h3 className="text-sm font-bold text-mbox-text">연출 파티클</h3>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-mbox-subtle">
          사각 3D 미리보기·MP4에 적용됩니다. 원형 팬블레이드 디스크 마스크는 제품에서 제외했습니다.
        </p>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                    ? "border-mbox-gold/50 bg-mbox-gold/10 text-mbox-gold"
                    : "border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.45)] text-mbox-muted hover:border-[rgba(223,179,134,0.18)]"
                }`}
              >
                {themeOption.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="border-t border-mbox-gold/20 pt-4">
        <div className="flex items-center gap-2 text-mbox-gold">
          <Sparkles size={16} />
          <h3 className="text-sm font-bold text-mbox-text">3D 쇼케이스 연출 (단계별)</h3>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-mbox-subtle">
          1단계 기본 회전부터 순서대로 켜세요. 5단계 VoluMax·6~7단계는 독립 옵션입니다.
        </p>
        {!rotationControlsEnabled ? (
          <p className="mt-1 text-[10px] leading-relaxed text-mbox-subtle">
            정육면체(팬) 연출에서만 적용됩니다. 다른 연출 템플릿은 자체 회전 타임라인을 사용합니다.
          </p>
        ) : null}
        <div className="mt-3">
          <CubeShowcaseStepsControls
            settings={settings}
            onPatch={patch}
            disabled={disabled}
            rotationControlsEnabled={rotationControlsEnabled}
          />
        </div>
      </section>

      <section className="border-t border-[rgba(223,179,134,0.12)] pt-4">
        <CubeSizeControl
          value={settings.cubeSizeScale}
          disabled={disabled}
          onChange={(cubeSizeScale) => patch({ cubeSizeScale })}
        />
      </section>

      <section>
        <div className="flex items-center gap-2 text-mbox-gold/90">
          <ImageUpscale size={16} />
          <h3 className="text-sm font-bold text-mbox-text">해상도 향상 (2×)</h3>
        </div>
        <p className="mt-1 text-xs text-mbox-subtle leading-relaxed">
          보관함 사진을 최대 2048px 클래스로 업스케일·샤프닝합니다.
          {enhancedCount > 0 ? ` · 적용됨 ${enhancedCount}/${totalCount}장` : null}
        </p>
        <button
          type="button"
          disabled={disabled || isEnhancingResolution || totalCount === 0}
          onClick={onEnhanceResolution}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-mbox-gold/40 bg-mbox-gold/10 px-4 py-2 text-sm font-semibold text-mbox-gold hover:bg-mbox-gold/20 disabled:opacity-50"
        >
          <ImageUpscale size={16} className={isEnhancingResolution ? "animate-pulse" : ""} />
          {isEnhancingResolution ? "해상도 향상 중..." : "보관함 전체 2× 향상"}
        </button>
      </section>
    </div>
  );
}