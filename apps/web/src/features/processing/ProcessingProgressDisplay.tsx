import { Loader2 } from "lucide-react";
import type { ProcessingProgress } from "../../shared/types";
import { formatElapsed, formatEta } from "../../shared/lib/processingProgress";

interface ProcessingProgressDisplayProps {
  progress: ProcessingProgress | null;
  isProcessing: boolean;
  compact?: boolean;
}

const PHASE_LABELS: Record<ProcessingProgress["phase"], string> = {
  loading: "불러오는 중",
  analyzing: "AI 분석 중",
  cropping: "크롭 중",
  processing: "처리 중",
  complete: "완료",
};

export function ProcessingProgressDisplay({
  progress,
  isProcessing,
  compact = false,
}: ProcessingProgressDisplayProps) {
  if (!isProcessing || !progress) {
    return null;
  }

  const etaLabel = formatEta(progress.etaMs);
  const elapsedLabel = formatElapsed(progress.elapsedMs);
  const phaseLabel = PHASE_LABELS[progress.phase];

  return (
    <div
      className={`rounded-xl border border-mbox-gold/30 bg-mbox-gold/5 ${
        compact ? "p-3" : "p-4 mt-3"
      }`}
    >
      <div className="flex items-center justify-between gap-3 text-[11px] text-mbox-muted">
        <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.12em] text-mbox-gold">
          <Loader2 className="animate-spin" size={12} />
          {phaseLabel}
        </span>
        <span>
          {progress.current}/{progress.total} · {progress.percent}%
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(18,14,24,0.85)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-mbox-gold via-mbox-rose-gold to-mbox-bronze transition-all duration-500 ease-out"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <p className={`mt-2 leading-relaxed text-mbox-muted ${compact ? "text-[11px]" : "text-xs"}`}>
        {progress.message}
      </p>

      <p className={`mt-1 text-mbox-subtle ${compact ? "text-[10px]" : "text-[11px]"}`}>
        {elapsedLabel}
        {etaLabel ? ` · ${etaLabel}` : progress.current > 0 ? "" : " · 예상 시간 계산 중…"}
      </p>
    </div>
  );
}
