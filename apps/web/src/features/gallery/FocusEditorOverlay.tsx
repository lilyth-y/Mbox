import { useEffect, useRef, useState } from "react";
import type { ImageCenter, ProcessedImage } from "../../shared/types";

interface FocusEditorOverlayProps {
  image: ProcessedImage;
  onCenterCommit: (center: ImageCenter) => void;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function FocusEditorOverlay({ image, onCenterCommit }: FocusEditorOverlayProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [draftCenter, setDraftCenter] = useState<ImageCenter>(image.center);
  const aiCenter = image.aiRecommendedCenter ?? image.center;

  useEffect(() => {
    setDraftCenter(image.center);
  }, [image.id, image.center.x, image.center.y]);

  const updateDraftFromPointer = (clientX: number, clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }
    const rect = surface.getBoundingClientRect();
    setDraftCenter({
      x: clampPercent(((clientX - rect.left) / rect.width) * 100),
      y: clampPercent(((clientY - rect.top) / rect.height) * 100),
    });
  };

  return (
    <div
      ref={surfaceRef}
      className="absolute inset-0 touch-none"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        updateDraftFromPointer(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          return;
        }
        updateDraftFromPointer(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          return;
        }
        event.currentTarget.releasePointerCapture(event.pointerId);
        const surface = surfaceRef.current;
        if (!surface) {
          return;
        }
        const rect = surface.getBoundingClientRect();
        const center = {
          x: clampPercent(((event.clientX - rect.left) / rect.width) * 100),
          y: clampPercent(((event.clientY - rect.top) / rect.height) * 100),
        };
        setDraftCenter(center);
        onCenterCommit(center);
      }}
    >
      <div
        className="absolute border border-cyan-300/70 bg-cyan-400/10"
        style={{
          left: `${image.subject.bounds.x0}%`,
          top: `${image.subject.bounds.y0}%`,
          width: `${image.subject.bounds.x1 - image.subject.bounds.x0}%`,
          height: `${image.subject.bounds.y1 - image.subject.bounds.y0}%`,
        }}
      />
      <div
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-200 bg-cyan-300/80"
        style={{ left: `${aiCenter.x}%`, top: `${aiCenter.y}%` }}
        title="AI 추천 포커스"
      />
      <div
        className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-200 bg-amber-400 shadow-lg shadow-amber-500/30"
        style={{ left: `${draftCenter.x}%`, top: `${draftCenter.y}%` }}
        title="사용자 포커스"
      />
    </div>
  );
}
