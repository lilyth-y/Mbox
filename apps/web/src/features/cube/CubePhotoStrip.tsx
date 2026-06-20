import { Trash2 } from "lucide-react";
import type { ProcessedImage } from "../../shared/types";

interface CubePhotoStripProps {
  images: ProcessedImage[];
  disabled?: boolean;
  onDelete?: (imageId: number) => void;
}

export function CubePhotoStrip({ images, disabled = false, onDelete }: CubePhotoStripProps) {
  if (images.length === 0) {
    return (
      <p className="text-xs text-mbox-subtle">
        프로세싱 탭에서 사진을 업로드한 뒤 이 탭으로 오세요.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-mbox-muted">
          큐브 사진 {images.length}장
        </p>
        {onDelete ? (
          <p className="text-[10px] text-mbox-subtle">삭제하려면 썸네일에 마우스를 올리세요</p>
        ) : null}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 pr-1">
        {images.map((image, index) => (
          <div
            key={image.id}
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[rgba(223,179,134,0.18)] bg-[rgba(18,14,24,0.85)]"
            title={image.label}
          >
            <img src={image.url} alt={image.label} className="h-full w-full object-cover" />
            <span className="absolute bottom-0 left-0 rounded-tr bg-black/70 px-1 text-[9px] font-bold text-white">
              {index + 1}
            </span>
            {onDelete ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onDelete(image.id)}
                className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/75 text-white opacity-0 transition hover:bg-mbox-gold/90 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`${image.label} 삭제`}
              >
                <Trash2 size={12} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
