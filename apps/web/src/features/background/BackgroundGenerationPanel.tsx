import { Eraser, Loader2, Sparkles } from "lucide-react";
import { BACKGROUND_TEMPLATES } from "../background/backgroundTemplates";
import type { BackgroundTemplateId } from "../../shared/types";

interface BackgroundGenerationPanelProps {
  selectedImageLabel: string | null;
  templateId: BackgroundTemplateId;
  customPrompt: string;
  isProcessing: boolean;
  onTemplateChange: (templateId: BackgroundTemplateId) => void;
  onCustomPromptChange: (value: string) => void;
  onApplyRemoval: () => void;
  onApply: () => void;
}

export function BackgroundGenerationPanel({
  selectedImageLabel,
  templateId,
  customPrompt,
  isProcessing,
  onTemplateChange,
  onCustomPromptChange,
  onApplyRemoval,
  onApply,
}: BackgroundGenerationPanelProps) {
  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4 text-cyan-300">
          <Eraser size={20} />
          <h2 className="font-bold">2. 배경 제거</h2>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">
          분석·크롭이 끝난 이미지에 대해 배경 제거를 별도로 실행합니다.
        </p>
        <button
          type="button"
          disabled={!selectedImageLabel || isProcessing}
          onClick={onApplyRemoval}
          className="mt-4 w-full rounded-xl border border-cyan-500/40 bg-cyan-500/10 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isProcessing ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={16} />
              배경 제거 중...
            </span>
          ) : (
            "선택 이미지에 배경 제거"
          )}
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-4 text-violet-300">
          <Sparkles size={20} />
          <h2 className="font-bold">3. 배경 생성</h2>
        </div>

        <p className="text-sm text-slate-400 leading-relaxed">
          1·2단계로 1024x1024 포커싱이 끝난 이미지에 템플릿과 프롬프트로 배경을 생성합니다.
        </p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BACKGROUND_TEMPLATES.map((template) => {
            const selected = template.id === templateId;
            return (
              <button
                key={template.id}
                type="button"
                disabled={isProcessing}
                onClick={() => onTemplateChange(template.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  selected
                    ? "border-violet-500/60 bg-violet-500/10"
                    : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
                }`}
              >
                <p className="text-sm font-semibold text-slate-100">{template.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{template.description}</p>
              </button>
            );
          })}
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            추가 프롬프트
          </span>
          <textarea
            value={customPrompt}
            onChange={(event) => onCustomPromptChange(event.target.value)}
            rows={3}
            placeholder="예: 따뜻한 석양, 필름 느낌, 부드러운 보케"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-violet-500/60"
          />
        </label>

        <button
          type="button"
          disabled={!selectedImageLabel || isProcessing}
          onClick={onApply}
          className="mt-4 w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {isProcessing ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={16} />
              배경 생성 중...
            </span>
          ) : (
            "선택 이미지에 배경 생성"
          )}
        </button>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          {selectedImageLabel
            ? `현재 선택: ${selectedImageLabel}`
            : "갤러리에서 이미지를 선택한 뒤 배경 생성을 적용하세요."}
        </p>
      </div>
    </div>
  );
}
