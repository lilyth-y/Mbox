import { Loader2, Sparkles } from "lucide-react";
import type { PostProcessingSettings, ProcessedImage } from "../../shared/types";
import { buildCssFilter } from "../../shared/lib/imagePostProcess";
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
  onApply,
  onApplyAll,
  onReset,
  onRecommend,
}: AfterEffectsPanelProps) {
  const previewFilter = buildCssFilter(settings);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4 text-emerald-300">
          <Sparkles size={20} />
          <h2 className="font-bold">영상 후처리 추천</h2>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">
          3D 큐브와 MP4 녹화 전에 명암·그림자·색채를 다듬습니다. 아래 항목은 모두 슬라이더로 직접 조정할 수
          있습니다.
        </p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {AFTER_EFFECT_RECOMMENDATIONS.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3"
            >
              <p className="text-sm font-semibold text-slate-100">{item.label}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{item.description}</p>
              <p className="mt-2 text-[10px] text-emerald-300">
                {item.adjustable ? "사용자 조정 가능" : "자동 적용"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="lg:w-1/2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              미리보기
            </p>
            <div className="mt-3 aspect-square overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
              {selectedImage ? (
                <img
                  src={selectedImage.preparedUrl}
                  alt={selectedImage.label}
                  className="h-full w-full object-cover"
                  style={{ filter: previewFilter }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  갤러리에서 이미지를 선택하세요.
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {selectedImage
                ? `${selectedImage.label} · AI 추천 포커스 (${Math.round(
                    (selectedImage.aiRecommendedCenter ?? selectedImage.center).x
                  )}%, ${Math.round((selectedImage.aiRecommendedCenter ?? selectedImage.center).y)}%)`
                : "선택한 이미지의 포커스는 갤러리에서 드래그로 조정할 수 있습니다."}
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
                  className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-left transition hover:border-emerald-500/40"
                >
                  <p className="text-sm font-semibold text-slate-100">{preset.label}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{preset.description}</p>
                </button>
              ))}
            </div>

            {AFTER_EFFECT_RECOMMENDATIONS.map((item) => {
              const settingKey = item.id;
              const limits = SETTING_LIMITS[settingKey];
              return (
                <label key={settingKey} className="block">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
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
                    className="w-full accent-emerald-400"
                  />
                </label>
              );
            })}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                disabled={!selectedImage || isProcessing}
                onClick={onRecommend}
                className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                AI 추천 설정
              </button>
              <button
                type="button"
                disabled={!selectedImage || isProcessing}
                onClick={onApply}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700"
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
                className="rounded-xl border border-emerald-500/40 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                전체 이미지에 적용
              </button>
              <button
                type="button"
                disabled={!selectedImage || isProcessing}
                onClick={onReset}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
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
