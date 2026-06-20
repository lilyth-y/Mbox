import { Loader2, Sparkles } from "lucide-react";
import type { ImageCenter, PostProcessingSettings, ProcessedImage } from "../../shared/types";
import { buildCssFilter } from "../../shared/lib/imagePostProcess";
import { isPortraitSubject } from "../../shared/lib/subjectPortrait";
import { FocusWorkbench } from "../gallery/FocusWorkbench";
import {
  AFTER_EFFECT_PRESETS,
  AFTER_EFFECT_RECOMMENDATIONS,
  DEFAULT_POST_PROCESSING,
} from "./afterEffectCatalog";

interface AfterEffectsPanelProps {
  selectedImage: ProcessedImage | null;
  settings: PostProcessingSettings;
  isProcessing: boolean;
  onSettingsChange: (settings: PostProcessingSettings) => void;
  onFocusCenterCommit?: (center: ImageCenter) => void;
  onApply: () => void;
  onApplyAll: () => void;
  onReset: () => void;
  onRecommend: () => void;
}

const SETTING_LIMITS: Record<keyof PostProcessingSettings, { min: number; max: number }> = {
  brightness: { min: -40, max: 40 },
  contrast: { min: -40, max: 40 },
  saturation: { min: -50, max: 50 },
  warmth: { min: -40, max: 40 },
  shadowLift: { min: 0, max: 40 },
  vignette: { min: 0, max: 60 },
  sharpness: { min: 0, max: 40 },
};

export function AfterEffectsPanel({
  selectedImage,
  settings,
  isProcessing,
  onSettingsChange,
  onFocusCenterCommit,
  onApply,
  onApplyAll,
  onReset,
  onRecommend,
}: AfterEffectsPanelProps) {
  const previewFilter = buildCssFilter(settings);

  return (
    <div className="space-y-6">
      <div className="mbox-card">
        <div className="flex items-center gap-2 mb-4 text-mbox-gold">
          <Sparkles size={20} />
          <h2 className="font-bold">영상 후처리 추천</h2>
        </div>
        <p className="text-sm text-mbox-muted leading-relaxed">
          3D 큐브와 MP4 녹화 전에 명암·그림자·색채를 다듬습니다. 아래 항목은 모두 슬라이더로 직접 조정할 수
          있습니다.
        </p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {AFTER_EFFECT_RECOMMENDATIONS.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.45)] px-4 py-3"
            >
              <p className="text-sm font-semibold text-mbox-text">{item.label}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-mbox-subtle">{item.description}</p>
              <p className="mt-2 text-[10px] text-mbox-gold">
                {item.adjustable ? "사용자 조정 가능" : "자동 적용"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mbox-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="lg:w-1/2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mbox-muted">
              포커싱 · 미리보기
            </p>
            <div className="mt-3 relative">
              {selectedImage && onFocusCenterCommit ? (
                <div className="relative" style={{ filter: previewFilter }}>
                  <FocusWorkbench
                    image={selectedImage}
                    variant="large"
                    onCenterCommit={onFocusCenterCommit}
                  />
                </div>
              ) : (
                <div className="aspect-square overflow-hidden rounded-2xl border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.75)] flex items-center justify-center text-sm text-mbox-subtle">
                  갤러리에서 이미지를 선택하세요.
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] text-mbox-subtle leading-relaxed">
              {selectedImage
                ? `${selectedImage.label} · 스크롤로 확대/축소, 드래그로 포커스(크롭 중심) 조정. Alt+드래그로 화면 이동.${
                    isPortraitSubject(selectedImage)
                      ? " 인물 사진은 3D 큐브에서 전경 확대·배경 후퇴 패럴랙스가 강화됩니다."
                      : ""
                  }`
                : "후처리 탭에서 선택한 이미지의 포커스와 슬라이더를 함께 조정합니다."}
            </p>
          </div>

          <div className="lg:w-1/2 space-y-4">
            <div className="grid grid-cols-1 gap-2">
              {AFTER_EFFECT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={!selectedImage || isProcessing}
                  onClick={() => onSettingsChange(preset.settings)}
                  className="rounded-2xl border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.45)] px-4 py-3 text-left transition hover:border-mbox-gold/40"
                >
                  <p className="text-sm font-semibold text-mbox-text">{preset.label}</p>
                  <p className="mt-1 text-[11px] text-mbox-subtle">{preset.description}</p>
                </button>
              ))}
            </div>

            {AFTER_EFFECT_RECOMMENDATIONS.map((item) => {
              const settingKey = item.id;
              const limits = SETTING_LIMITS[settingKey];
              return (
                <label key={settingKey} className="block">
                  <div className="mb-2 flex items-center justify-between text-xs text-mbox-muted">
                    <span>{item.label}</span>
                    <span>{settings[settingKey]}</span>
                  </div>
                  <input
                    type="range"
                    min={limits.min}
                    max={limits.max}
                    value={settings[settingKey]}
                    disabled={!selectedImage || isProcessing}
                    onChange={(event) =>
                      onSettingsChange({
                        ...settings,
                        [settingKey]: Number(event.target.value),
                      })
                    }
                    className="w-full accent-mbox-gold"
                  />
                </label>
              );
            })}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                disabled={!selectedImage || isProcessing}
                onClick={onRecommend}
                className="rounded-xl border border-mbox-gold/40 bg-mbox-gold/10 px-4 py-2 text-sm font-semibold text-mbox-gold transition hover:bg-mbox-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                AI 추천 설정
              </button>
              <button
                type="button"
                disabled={!selectedImage || isProcessing}
                onClick={onApply}
                className="gold-btn rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isProcessing ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="animate-spin" size={16} />
                    적용 중...
                  </span>
                ) : (
                  "선택 이미지에 적용"
                )}
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={onApplyAll}
                className="rounded-xl border border-mbox-gold/40 px-4 py-2 text-sm font-semibold text-mbox-gold transition hover:bg-mbox-gold/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                전체 이미지에 적용
              </button>
              <button
                type="button"
                disabled={!selectedImage || isProcessing}
                onClick={onReset}
                className="rounded-xl border border-[rgba(223,179,134,0.18)] px-4 py-2 text-sm font-semibold text-mbox-muted transition hover:bg-[rgba(18,14,24,0.85)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { DEFAULT_POST_PROCESSING };
