import { useEffect, useRef, useState } from "react";
import type { ImageCenter, ProcessedImage } from "../../shared/types";

export interface FocusWorkbenchProps {
  image: ProcessedImage;
  onCenterCommit: (center: ImageCenter) => void;
  /** Large preview (후처리 탭) vs 갤러리 썸네일 */
  variant?: "compact" | "large";
  className?: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function clientToImagePercent(
  clientX: number,
  clientY: number,
  surface: HTMLElement,
  zoom: number,
  panX: number,
  panY: number
): ImageCenter {
  const rect = surface.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = clientX - cx - panX;
  let dy = clientY - cy - panY;
  dx /= zoom;
  dy /= zoom;
  const localX = dx + rect.width / 2;
  const localY = dy + rect.height / 2;
  return {
    x: clampPercent((localX / rect.width) * 100),
    y: clampPercent((localY / rect.height) * 100),
  };
}

export function FocusWorkbench({
  image,
  onCenterCommit,
  variant = "compact",
  className = "",
}: FocusWorkbenchProps) {
  const [draftCenter, setDraftCenter] = useState<ImageCenter>(image.center);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const aiCenter = image.aiRecommendedCenter ?? image.center;
  const previewUrl = image.preCropSourceUrl ?? image.preparedUrl ?? image.url;

  useEffect(() => {
    setDraftCenter(image.center);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [image.id, image.center.x, image.center.y]);

  const isLarge = variant === "large";

  return (
    <div
      className={`relative overflow-hidden bg-slate-950 ${isLarge ? "aspect-square rounded-2xl border border-slate-800" : "absolute inset-0"} ${className}`}
    >
      <div
        className="absolute inset-0 touch-none cursor-crosshair"
        onWheel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const factor = event.deltaY > 0 ? 0.9 : 1.1;
          setZoom((current) => clampZoom(current * factor));
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          if (event.altKey || event.button === 1) {
            panStartRef.current = {
              x: event.clientX,
              y: event.clientY,
              panX: pan.x,
              panY: pan.y,
            };
            return;
          }
          panStartRef.current = null;
          setDraftCenter(
            clientToImagePercent(event.clientX, event.clientY, event.currentTarget, zoom, pan.x, pan.y)
          );
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            return;
          }
          if (panStartRef.current) {
            setPan({
              x: panStartRef.current.panX + (event.clientX - panStartRef.current.x),
              y: panStartRef.current.panY + (event.clientY - panStartRef.current.y),
            });
            return;
          }
          setDraftCenter(
            clientToImagePercent(event.clientX, event.clientY, event.currentTarget, zoom, pan.x, pan.y)
          );
        }}
        onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            return;
          }
          event.currentTarget.releasePointerCapture(event.pointerId);
          if (panStartRef.current) {
            panStartRef.current = null;
            return;
          }
          const center = clientToImagePercent(
            event.clientX,
            event.clientY,
            event.currentTarget,
            zoom,
            pan.x,
            pan.y
          );
          setDraftCenter(center);
          onCenterCommit(center);
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        >
          <img
            src={previewUrl}
            alt={image.label}
            className={`h-full w-full select-none pointer-events-none ${isLarge ? "object-contain" : "object-cover"}`}
            draggable={false}
          />
          <div className="absolute inset-0 pointer-events-none">
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
        </div>
      </div>

      <div
        className={`pointer-events-none absolute z-10 rounded-lg bg-black/65 px-2 py-1 text-[10px] text-slate-200 ${
          isLarge ? "bottom-3 left-3" : "bottom-1 left-1 max-w-[90%] leading-tight"
        }`}
      >
        스크롤 확대/축소 · Alt+드래그 이동 · 드래그 포커스
        {zoom > 1.01 ? ` · ${Math.round(zoom * 100)}%` : ""}
      </div>
    </div>
  );
}
