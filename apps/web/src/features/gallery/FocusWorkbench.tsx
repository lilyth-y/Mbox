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

function releaseScrollLock() {
  document.body.style.overflow = "";
  document.body.style.touchAction = "";
}

function applyScrollLock() {
  document.body.style.overflow = "hidden";
  document.body.style.touchAction = "none";
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
  const surfaceRef = useRef<HTMLDivElement>(null);
  const scrollLockedRef = useRef(false);
  const aiCenter = image.aiRecommendedCenter ?? image.center;
  const previewUrl = image.preCropSourceUrl ?? image.preparedUrl ?? image.url;

  useEffect(() => {
    setDraftCenter(image.center);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [image.id, image.center.x, image.center.y]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      setZoom((current) => clampZoom(current * factor));
    };

    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => surface.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollLockedRef.current) {
        releaseScrollLock();
        scrollLockedRef.current = false;
      }
    };
  }, []);

  const endPointerInteraction = (target: HTMLElement, pointerId: number) => {
    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
    if (scrollLockedRef.current) {
      releaseScrollLock();
      scrollLockedRef.current = false;
    }
    panStartRef.current = null;
  };

  const isLarge = variant === "large";

  return (
    <div
      className={`relative overflow-hidden overscroll-none bg-[rgba(18,14,24,0.75)] ${isLarge ? "aspect-square rounded-2xl border border-[rgba(223,179,134,0.12)]" : "absolute inset-0"} ${className}`}
    >
      <div
        ref={surfaceRef}
        className="absolute inset-0 cursor-crosshair touch-none overscroll-none"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!scrollLockedRef.current) {
            applyScrollLock();
            scrollLockedRef.current = true;
          }
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
          event.preventDefault();
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
          event.preventDefault();
          const wasPanning = Boolean(panStartRef.current);
          endPointerInteraction(event.currentTarget, event.pointerId);
          if (wasPanning) {
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
        onPointerCancel={(event) => {
          event.preventDefault();
          endPointerInteraction(event.currentTarget, event.pointerId);
        }}
        onLostPointerCapture={() => {
          if (scrollLockedRef.current) {
            releaseScrollLock();
            scrollLockedRef.current = false;
          }
          panStartRef.current = null;
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
              className="absolute border border-mbox-gold/50 bg-mbox-gold/10"
              style={{
                left: `${image.subject.bounds.x0}%`,
                top: `${image.subject.bounds.y0}%`,
                width: `${image.subject.bounds.x1 - image.subject.bounds.x0}%`,
                height: `${image.subject.bounds.y1 - image.subject.bounds.y0}%`,
              }}
            />
            <div
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-mbox-rose-gold bg-mbox-gold/80"
              style={{ left: `${aiCenter.x}%`, top: `${aiCenter.y}%` }}
              title="AI 추천 포커스"
            />
            <div
              className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-mbox-gold bg-mbox-gold shadow-lg shadow-mbox-gold/30"
              style={{ left: `${draftCenter.x}%`, top: `${draftCenter.y}%` }}
              title="사용자 포커스"
            />
          </div>
        </div>
      </div>

      <div
        className={`pointer-events-none absolute z-10 rounded-lg bg-black/65 px-2 py-1 text-[10px] text-mbox-text ${
          isLarge ? "bottom-3 left-3" : "bottom-1 left-1 max-w-[90%] leading-tight"
        }`}
      >
        스크롤 확대/축소 · Alt+드래그 이동 · 드래그 포커스
        {zoom > 1.01 ? ` · ${Math.round(zoom * 100)}%` : ""}
      </div>
    </div>
  );
}
