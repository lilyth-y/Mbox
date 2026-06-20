import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

interface AssetDropZoneProps {
  accept: string;
  hint: string;
  disabled?: boolean;
  busy?: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
}

export function AssetDropZone({
  accept,
  hint,
  disabled = false,
  busy = false,
  onFiles,
}: AssetDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length || disabled || busy) return;
    await onFiles(Array.from(list));
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        void handleFiles(event.dataTransfer.files);
      }}
      onClick={() => !disabled && !busy && inputRef.current?.click()}
      className={`rounded-xl border-2 border-dashed px-3 py-4 text-center transition cursor-pointer ${
        dragOver
          ? "border-mbox-gold/60 bg-mbox-gold/10"
          : "border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.4)] hover:border-mbox-gold/30"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        disabled={disabled || busy}
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <div className="flex flex-col items-center gap-2 text-mbox-muted">
        {busy ? (
          <Loader2 size={20} className="animate-spin text-mbox-gold" />
        ) : (
          <Upload size={20} className="text-mbox-gold" />
        )}
        <p className="text-[11px] leading-relaxed">{busy ? "업로드 중…" : hint}</p>
      </div>
    </div>
  );
}
