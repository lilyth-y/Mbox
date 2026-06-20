import {
  CUBE_SIZE_SCALE_MAX,
  CUBE_SIZE_SCALE_MIN,
  clampCubeSizeScale,
} from "@mbox/shared";

interface CubeSizeControlProps {
  value: number;
  onChange: (scale: number) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function CubeSizeControl({
  value,
  onChange,
  disabled = false,
  compact = false,
}: CubeSizeControlProps) {
  const clamped = clampCubeSizeScale(value);

  return (
    <label
      className={
        compact
          ? "flex min-w-[140px] flex-col gap-1 rounded-lg border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.5)] px-3 py-2"
          : "block"
      }
    >
      <span
        className={
          compact
            ? "text-[10px] font-semibold text-mbox-muted"
            : "text-xs font-semibold text-mbox-muted"
        }
      >
        큐브 크기 {clamped.toFixed(2)}×
      </span>
      <input
        type="range"
        min={CUBE_SIZE_SCALE_MIN}
        max={CUBE_SIZE_SCALE_MAX}
        step={0.05}
        disabled={disabled}
        value={clamped}
        onChange={(event) => onChange(clampCubeSizeScale(Number(event.target.value)))}
        className={compact ? "w-full accent-mbox-gold" : "mt-2 w-full accent-mbox-gold"}
      />
      {!compact ? (
        <p className="mt-1 text-[10px] leading-relaxed text-mbox-subtle">
          3D 미리보기·MP4에 적용됩니다. 연출 줌(멀리→가까이)과 별도로 큐브 자체 크기만 조절합니다.
        </p>
      ) : null}
    </label>
  );
}
