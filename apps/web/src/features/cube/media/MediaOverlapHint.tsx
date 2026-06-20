import { AlertTriangle, Info, Lightbulb } from "lucide-react";
import {
  computeMediaBusyScore,
  computeMediaOverlapHints,
  KPI_MEDIA_BUSY_WARN_THRESHOLD,
  type MediaPresentationState,
} from "@mbox/shared";

interface MediaOverlapHintProps {
  state: MediaPresentationState;
  compact?: boolean;
}

function HintIcon({ level }: { level: "info" | "tip" | "warn" }) {
  if (level === "warn") return <AlertTriangle size={12} className="shrink-0 text-amber-400" />;
  if (level === "tip") return <Lightbulb size={12} className="shrink-0 text-mbox-gold" />;
  return <Info size={12} className="shrink-0 text-mbox-gold" />;
}

function hintClass(level: "info" | "tip" | "warn"): string {
  if (level === "warn") return "border-amber-500/30 bg-amber-500/10 text-amber-100/95";
  if (level === "tip") return "border-mbox-gold/25 bg-mbox-gold/8 text-mbox-gold/90";
  return "border-mbox-gold/25 bg-mbox-gold/8 text-mbox-gold/90";
}

export function MediaOverlapHint({ state, compact = false }: MediaOverlapHintProps) {
  const hints = computeMediaOverlapHints(state);
  const busyScore = computeMediaBusyScore(state);

  if (hints.length === 0) return null;

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-mbox-subtle">겹침 힌트</span>
        <span
          className={`text-[10px] font-semibold tabular-nums ${
            busyScore >= KPI_MEDIA_BUSY_WARN_THRESHOLD ? "text-amber-400" : "text-mbox-subtle"
          }`}
          title="시각 부하 지수 (낮을수록 절제)"
        >
          부하 {busyScore}/10
        </span>
      </div>
      <ul className="space-y-1.5">
        {hints.map((hint) => (
          <li
            key={hint.id}
            className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed ${hintClass(hint.level)}`}
          >
            <HintIcon level={hint.level} />
            <span>{hint.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
