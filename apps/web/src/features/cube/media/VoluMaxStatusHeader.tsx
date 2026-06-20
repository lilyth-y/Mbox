import { Layers, Loader2 } from "lucide-react";
import type { CubeBackgroundPlateTheme } from "@mbox/shared";
import { WEDDING_BACKGROUND_THEMES } from "../../../shared/lib/backgroundPlate";
import type { VoluMaxReadinessSummary } from "../../../shared/lib/voluMaxReadiness";

export interface VoluMaxStatusHeaderProps {
  preparedFaceCount: number;
  totalFaceCount: number;
  isPreparing?: boolean;
  backgroundPlateTheme?: CubeBackgroundPlateTheme | string;
  depthEnabled?: boolean;
  /** When set, shows a master ON/OFF switch for VoluMax depth split. */
  onDepthEnabledChange?: (enabled: boolean) => void;
  depthToggleDisabled?: boolean;
  compact?: boolean;
  /** Wedding preview badge vs cube panel section header */
  variant?: "panel" | "preview";
  readiness?: VoluMaxReadinessSummary;
}

function resolveThemeLabel(theme: string | undefined): string {
  if (!theme) return "—";
  const match = WEDDING_BACKGROUND_THEMES.find((item) => item.id === theme);
  return match?.label ?? theme;
}

function VoluMaxFaceIssues({
  readiness,
  className = "text-[10px] text-amber-200/90 leading-relaxed mt-2",
}: {
  readiness: VoluMaxReadinessSummary;
  className?: string;
}) {
  const lines: string[] = [];
  if (readiness.softMatteOnlyLabels.length > 0) {
    lines.push(`사각 matte만(시차 미적용): ${readiness.softMatteOnlyLabels.join(", ")}`);
  }
  if (readiness.plateOnlyLabels.length > 0) {
    lines.push(`배경 plate만: ${readiness.plateOnlyLabels.join(", ")}`);
  }
  if (readiness.missingLayersLabels.length > 0) {
    lines.push(`미준비: ${readiness.missingLayersLabels.join(", ")}`);
  }
  if (lines.length === 0) {
    return null;
  }
  return (
    <ul className={`space-y-1 ${className}`} data-testid="volumax-face-issues">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function DepthToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <label
      className={`relative inline-flex shrink-0 select-none ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      title={checked ? "VoluMax 끄기" : "VoluMax 켜기"}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div className="h-6 w-11 rounded-full bg-[rgba(18,14,24,0.85)] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-mbox-gold peer-checked:after:translate-x-full peer-disabled:cursor-not-allowed" />
    </label>
  );
}

export function VoluMaxStatusHeader({
  preparedFaceCount,
  totalFaceCount,
  isPreparing = false,
  backgroundPlateTheme,
  depthEnabled = false,
  onDepthEnabledChange,
  depthToggleDisabled = false,
  compact = false,
  variant = "panel",
  readiness,
}: VoluMaxStatusHeaderProps) {
  const ready = totalFaceCount > 0 && preparedFaceCount >= totalFaceCount;
  const partial = preparedFaceCount > 0 && preparedFaceCount < totalFaceCount;
  const hasIssues =
    readiness &&
    (readiness.softMatteOnlyLabels.length > 0 ||
      readiness.plateOnlyLabels.length > 0 ||
      readiness.missingLayersLabels.length > 0);

  if (variant === "preview") {
    return (
      <div
        className="rounded-xl border border-mbox-gold/20 bg-[rgba(18,14,24,0.7)] px-3 py-2 text-center"
        data-testid="volumax-status-header"
      >
        {isPreparing ? (
          <p className="inline-flex items-center justify-center gap-1.5 text-[10px] text-mbox-muted">
            <Loader2 size={11} className="animate-spin" />
            VoluMax 면 레이어 준비 중…
          </p>
        ) : preparedFaceCount > 0 ? (
          <>
            <p className="text-[10px] text-mbox-gold/95 font-semibold">
              VoluMax AI 누끼 {preparedFaceCount}/{totalFaceCount}면 ·{" "}
              {resolveThemeLabel(backgroundPlateTheme)}
              {depthEnabled ? " · 시차 ON" : ""}
            </p>
            {hasIssues && readiness ? (
              <VoluMaxFaceIssues
                readiness={readiness}
                className="text-[9px] text-amber-200/85 leading-relaxed mt-1.5 text-left"
              />
            ) : null}
          </>
        ) : (
          <p className="text-[10px] text-mbox-subtle">VoluMax 면 배경 · 업로드 후 자동 준비</p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border ${
        ready
          ? "border-mbox-gold/30 bg-mbox-gold/5"
          : partial
            ? "border-amber-500/25 bg-amber-500/5"
            : "border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.5)]"
      } ${compact ? "px-3 py-2" : "px-3 py-2.5"}`}
      data-testid="volumax-status-header"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Layers size={compact ? 14 : 16} className="text-mbox-gold shrink-0" />
          <div className="min-w-0">
            <h3 className={`font-bold text-mbox-text ${compact ? "text-xs" : "text-sm"}`}>
              VoluMax · AI 누끼 &amp; 시차
            </h3>
            <p className="text-[10px] text-mbox-subtle leading-relaxed mt-0.5">
              인물 AI 누끼가 준비된 면만 배경·전경 분리·시차가 적용됩니다. 사각 soft matte는 사용하지 않습니다.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onDepthEnabledChange ? (
            <DepthToggleSwitch
              checked={depthEnabled}
              disabled={depthToggleDisabled || isPreparing}
              onChange={onDepthEnabledChange}
            />
          ) : null}
          {isPreparing ? (
            <Loader2 size={14} className="animate-spin text-mbox-muted mt-0.5" />
          ) : null}
        </div>
      </div>
      <dl className={`mt-2 grid grid-cols-3 gap-2 text-[10px] ${compact ? "" : "sm:grid-cols-3"}`}>
        <div>
          <dt className="text-mbox-subtle">AI 누끼</dt>
          <dd className="font-semibold text-mbox-text tabular-nums">
            {preparedFaceCount}/{totalFaceCount || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-mbox-subtle">면 테마</dt>
          <dd className="font-semibold text-mbox-text truncate">{resolveThemeLabel(backgroundPlateTheme)}</dd>
        </div>
        <div>
          <dt className="text-mbox-subtle">깊이 시차</dt>
          <dd className={`font-semibold ${depthEnabled ? "text-mbox-gold" : "text-mbox-subtle"}`}>
            {depthEnabled ? "ON" : "OFF"}
          </dd>
        </div>
      </dl>
      {hasIssues && readiness ? <VoluMaxFaceIssues readiness={readiness} /> : null}
    </div>
  );
}
