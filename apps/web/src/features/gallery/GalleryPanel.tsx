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
  background_removed: "누끼",
  volumax: "VoluMax",
};

function GalleryItem({
  item,
  selected,
  onSelect,
  enableFocusEditor,
  onFocusCenterCommit,
  onApplyAiRecommendedFocus,
  onCaptionChange,
}: {
  item: ProcessedImage;
  selected: boolean;
  onSelect: (id: number) => void;
  enableFocusEditor: boolean;
  onFocusCenterCommit?: (id: number, center: ImageCenter) => void;
  onApplyAiRecommendedFocus?: (id: number) => void;
  onCaptionChange?: (id: number, caption: string) => void;
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
          ? "border-mbox-gold ring-2 ring-mbox-gold/30"
          : "border-[rgba(223,179,134,0.18)] hover:border-mbox-gold/50"
      }`}
    >
      <div className="relative aspect-square touch-none overscroll-none bg-[rgba(18,14,24,0.85)]">
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
              className="rounded-full border border-mbox-gold/40 bg-mbox-gold/15 px-3 py-1 text-[11px] font-semibold text-mbox-gold transition hover:bg-mbox-gold/25"
            >
              AI 추천 포커스
            </button>
          </div>
        ) : null}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-mbox-text">
            {PREPROCESS_LABELS[item.preprocessMode]}
          </span>
          {backgroundSummary ? (
            <span className="rounded-full bg-mbox-gold/70 px-2 py-0.5 text-[10px] text-[#07060a]">
              {backgroundSummary}
            </span>
          ) : null}
        </div>
      </div>
      <div className="p-3 bg-[rgba(18,14,24,0.85)]">
        <div className="flex justify-between items-start mb-1">
          <h3 className="text-sm font-bold text-mbox-text truncate">{item.label}</h3>
          <span className="text-[10px] px-2 py-0.5 bg-[rgba(18,14,24,0.7)] text-mbox-muted rounded-full">
            {effectiveCategory}
          </span>
        </div>
        <p className="text-[11px] text-mbox-muted">1024 x 1024 PNG</p>
        {subjectSummary ? (
          <p className="mt-2 text-[10px] text-mbox-subtle leading-relaxed">{subjectSummary}</p>
        ) : null}
        <p className="mt-2 text-[10px] text-mbox-gold/80 leading-relaxed">
          AI 추천 포커스 ({Math.round(aiCenter.x)}%, {Math.round(aiCenter.y)}%)
        </p>
        {showAiCategoryHint ? (
          <p className="mt-1 text-[10px] text-mbox-rose-gold/90 leading-relaxed">
            AI 추천 카테고리: {item.aiSuggestedCategory} ({Math.round(item.categoryConfidence * 100)}%)
          </p>
        ) : null}
        <p className="mt-2 text-[10px] text-mbox-subtle leading-relaxed">{focusSummary}</p>
        <p className="mt-1 text-[10px] text-mbox-subtle/80 line-clamp-2">{focus.compositionNotes}</p>
        {selected && onCaptionChange ? (
          <label className="mt-3 block" onClick={(event) => event.stopPropagation()}>
            <span className="text-[10px] font-semibold text-mbox-muted">쇼케이스 자막 (한 줄)</span>
            <input
              type="text"
              value={item.caption ?? ""}
              maxLength={48}
              placeholder="예: 신랑 · 신부 첫 dance"
              onChange={(event) => onCaptionChange(item.id, event.target.value)}
              className="mt-1 w-full rounded-lg border border-[rgba(223,179,134,0.18)] bg-[rgba(18,14,24,0.75)] px-2.5 py-1.5 text-xs text-mbox-text placeholder:text-mbox-subtle/80 focus:border-mbox-gold focus:outline-none focus:ring-1 focus:ring-mbox-gold/30"
            />
          </label>
        ) : null}
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
  onCaptionChange?: (id: number, caption: string) => void;
}

export function GalleryPanel({
  processedImages,
  selectedImageId,
  onSelectImage,
  enableFocusEditor = false,
  onFocusCenterCommit,
  onApplyAiRecommendedFocus,
  onCaptionChange,
}: GalleryPanelProps) {
  const usedBytes = getPresentationTotalBytes(processedImages);

  return (
    <div className="lg:col-span-7">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Layout className="text-mbox-gold" size={24} />
          생성된 이미지 보관함
        </h2>
        <span className="text-sm text-mbox-subtle">
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
              onCaptionChange={onCaptionChange}
            />
          ))}
        </div>
      ) : (
        <div className="h-[400px] flex flex-col items-center justify-center bg-[rgba(18,14,24,0.55)] border-2 border-dashed border-[rgba(223,179,134,0.12)] rounded-2xl">
          <Layout className="text-mbox-subtle/50 mb-4" size={48} />
          <p className="text-mbox-subtle">생성된 이미지가 아직 없습니다.</p>
        </div>
      )}
    </div>
  );
}
