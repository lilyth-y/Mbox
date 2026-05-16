import { Layout } from "lucide-react";
import { BACKGROUND_TEMPLATES } from "../background/backgroundTemplates";
import type { ImageCenter, ProcessedImage } from "../../shared/types";
import {
  formatPresentationBytes,
  getPresentationTotalBytes,
  MAX_PRESENTATION_BYTES,
} from "../../shared/lib/mediaLimits";
import { FocusEditorOverlay } from "./FocusEditorOverlay";
import { getEffectiveCategory } from "./recommendImageCategory";

const CENTERING_LABELS: Record<ProcessedImage["focus"]["centering"], string> = {
  centered: "중심",
  rule_of_thirds: "삼분할",
  offset: "오프셋",
  edge_weighted: "가장자리",
};

const PREPROCESS_LABELS: Record<ProcessedImage["preprocessMode"], string> = {
  original: "원본",
  background_removed: "배경 제거",
};

function GalleryItem({
  item,
  selected,
  onSelect,
  enableFocusEditor,
  onFocusCenterCommit,
  onApplyAiRecommendedFocus,
}: {
  item: ProcessedImage;
  selected: boolean;
  onSelect: (id: number) => void;
  enableFocusEditor: boolean;
  onFocusCenterCommit?: (id: number, center: ImageCenter) => void;
  onApplyAiRecommendedFocus?: (id: number) => void;
}) {
  const focus = item.focus;
  const focusSummary = focus.onPrimarySubject
    ? `주요 피사체 초점 · ${CENTERING_LABELS[focus.centering]} · 심미 ${focus.aestheticScore}/5`
    : `초점 보정 필요 · ${CENTERING_LABELS[focus.centering]} · 심미 ${focus.aestheticScore}/5`;
  const subjectSummary = item.subject
    ? item.subject.detected
      ? `대상 ${item.subject.detectedLabel} · 신뢰도 ${Math.round(item.subject.confidence * 100)}%`
      : `요청 ${item.subject.requestedTarget} · 미검출`
    : null;
  const backgroundSummary = item.backgroundGeneration?.applied
    ? BACKGROUND_TEMPLATES.find((template) => template.id === item.backgroundGeneration?.templateId)
        ?.label ?? "배경 생성"
    : null;
  const aiCenter = item.aiRecommendedCenter ?? item.center;
  const effectiveCategory = getEffectiveCategory(item);
  const showAiCategoryHint = !item.userCategory || item.userCategory !== item.aiSuggestedCategory;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item.id);
        }
      }}
      className={`rounded-xl overflow-hidden border text-left transition-all shadow-lg cursor-pointer ${
        selected
          ? "border-violet-500 ring-2 ring-violet-500/30"
          : "border-slate-700 hover:border-blue-500"
      }`}
    >
      <div className="relative aspect-square bg-slate-800">
        {selected && enableFocusEditor && onFocusCenterCommit ? (
          <FocusEditorOverlay
            image={item}
            onCenterCommit={(center) => onFocusCenterCommit(item.id, center)}
          />
        ) : (
          <img src={item.url} alt={item.label} className="w-full h-full object-cover" />
        )}
        {selected && enableFocusEditor && onApplyAiRecommendedFocus ? (
          <div className="absolute bottom-2 right-2 z-10">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onApplyAiRecommendedFocus(item.id);
              }}
              className="rounded-full border border-cyan-400/50 bg-cyan-500/20 px-3 py-1 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-500/30"
            >
              AI 추천 포커스
            </button>
          </div>
        ) : null}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-slate-200">
            {PREPROCESS_LABELS[item.preprocessMode]}
          </span>
          {backgroundSummary ? (
            <span className="rounded-full bg-violet-600/80 px-2 py-0.5 text-[10px] text-white">
              {backgroundSummary}
            </span>
          ) : null}
        </div>
      </div>
      <div className="p-3 bg-slate-800">
        <div className="flex justify-between items-start mb-1">
          <h3 className="text-sm font-bold text-slate-100 truncate">{item.label}</h3>
          <span className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full">
            {effectiveCategory}
          </span>
        </div>
        <p className="text-[11px] text-slate-400">1024 x 1024 PNG</p>
        {subjectSummary ? (
          <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">{subjectSummary}</p>
        ) : null}
        <p className="mt-2 text-[10px] text-cyan-300/80 leading-relaxed">
          AI 추천 포커스 ({Math.round(aiCenter.x)}%, {Math.round(aiCenter.y)}%)
        </p>
        {showAiCategoryHint ? (
          <p className="mt-1 text-[10px] text-indigo-300/80 leading-relaxed">
            AI 추천 카테고리: {item.aiSuggestedCategory} ({Math.round(item.categoryConfidence * 100)}%)
          </p>
        ) : null}
        <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">{focusSummary}</p>
        <p className="mt-1 text-[10px] text-slate-600 line-clamp-2">{focus.compositionNotes}</p>
      </div>
    </div>
  );
}

interface GalleryPanelProps {
  processedImages: ProcessedImage[];
  selectedImageId: number | null;
  onSelectImage: (id: number) => void;
  enableFocusEditor?: boolean;
  onFocusCenterCommit?: (id: number, center: ImageCenter) => void;
  onApplyAiRecommendedFocus?: (id: number) => void;
}

export function GalleryPanel({
  processedImages,
  selectedImageId,
  onSelectImage,
  enableFocusEditor = false,
  onFocusCenterCommit,
  onApplyAiRecommendedFocus,
}: GalleryPanelProps) {
  const usedBytes = getPresentationTotalBytes(processedImages);

  return (
    <div className="lg:col-span-7">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Layout className="text-blue-400" size={24} />
          생성된 이미지 보관함
        </h2>
        <span className="text-sm text-slate-500">
          {processedImages.length}개 · {formatPresentationBytes(usedBytes)} /{" "}
          {formatPresentationBytes(MAX_PRESENTATION_BYTES)}
        </span>
      </div>

      {processedImages.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {processedImages.map((image) => (
            <GalleryItem
              key={image.id}
              item={image}
              selected={selectedImageId === image.id}
              onSelect={onSelectImage}
              enableFocusEditor={enableFocusEditor}
              onFocusCenterCommit={onFocusCenterCommit}
              onApplyAiRecommendedFocus={onApplyAiRecommendedFocus}
            />
          ))}
        </div>
      ) : (
        <div className="h-[400px] flex flex-col items-center justify-center bg-slate-900/50 border-2 border-dashed border-slate-800 rounded-2xl">
          <Layout className="text-slate-700 mb-4" size={48} />
          <p className="text-slate-500">생성된 이미지가 아직 없습니다.</p>
        </div>
      )}
    </div>
  );
}
