import { useState } from "react";
import { FolderPlus, Sparkles } from "lucide-react";
import type { ProcessedImage } from "../../shared/types";
import {
  getCategoryCounts,
  getEffectiveCategory,
  UNASSIGNED_CATEGORY_LABEL,
} from "./recommendImageCategory";

interface CategoryPanelProps {
  categories: string[];
  processedImages: ProcessedImage[];
  selectedImage: ProcessedImage | null;
  onAddCategory: (category: string) => void;
  onAssignCategory: (imageId: number, category: string) => void;
  onApplyAiSuggestedCategory: (imageId: number) => void;
}

export function CategoryPanel({
  categories,
  processedImages,
  selectedImage,
  onAddCategory,
  onAssignCategory,
  onApplyAiSuggestedCategory,
}: CategoryPanelProps) {
  const [newCategory, setNewCategory] = useState("");
  const counts = getCategoryCounts(categories, processedImages);
  const selectedEffectiveCategory = selectedImage ? getEffectiveCategory(selectedImage) : null;

  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) {
      return;
    }
    onAddCategory(trimmed);
    setNewCategory("");
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2 text-indigo-400">
          <FolderPlus size={20} />
          <h2 className="font-bold">생성 이미지 카테고리</h2>
        </div>
      </div>

      <p className="text-sm text-slate-400 leading-relaxed">
        인물·커플·음식처럼 대상별로 생성 이미지를 묶습니다. AI 추천을 확인한 뒤 적용 버튼으로 확정
        카테고리를 지정하세요.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {counts.map(({ category, count }) => (
          <span
            key={category}
            className={`px-3 py-1 rounded-md text-xs border ${
              category === UNASSIGNED_CATEGORY_LABEL
                ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                : "border-slate-700 bg-slate-800 text-slate-300"
            }`}
          >
            {category} · {count}
          </span>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={newCategory}
          onChange={(event) => setNewCategory(event.target.value)}
          placeholder="새 카테고리 (예: 음식, 커플)"
          className="flex-1 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-indigo-500/60"
        />
        <button
          type="button"
          onClick={handleAddCategory}
          className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
        >
          추가
        </button>
      </div>

      {selectedImage ? (
        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <p className="text-sm font-semibold text-slate-100">{selectedImage.label}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            확정 카테고리: {selectedEffectiveCategory}
            {selectedImage.userCategory ? "" : " (미지정)"}
          </p>
          <p className="mt-1 text-[11px] text-cyan-300/80">
            AI 추천: {selectedImage.aiSuggestedCategory} · 신뢰도{" "}
            {Math.round(selectedImage.categoryConfidence * 100)}%
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => onAssignCategory(selectedImage.id, category)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedImage.userCategory === category
                    ? "bg-indigo-600 text-white"
                    : "border border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-500/40"
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onApplyAiSuggestedCategory(selectedImage.id)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
          >
            <Sparkles size={16} />
            AI 추천 카테고리 적용
          </button>
        </div>
      ) : (
        <p className="mt-5 text-xs text-slate-500">갤러리에서 이미지를 선택하면 카테고리를 지정할 수 있습니다.</p>
      )}
    </div>
  );
}
