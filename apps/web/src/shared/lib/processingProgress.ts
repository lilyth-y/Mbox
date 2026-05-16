import type { ProcessingPhase, ProcessingProgress } from "../types";

export function formatEta(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) {
    return null;
  }

  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) {
    return `약 ${totalSeconds}초 남음`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) {
    return `약 ${minutes}분 남음`;
  }
  return `약 ${minutes}분 ${seconds}초 남음`;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}초 경과`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}분 ${seconds}초 경과` : `${minutes}분 경과`;
}

export interface ProgressReporter {
  setPhase: (phase: ProcessingPhase) => void;
  setMessage: (message: string) => void;
  setCurrent: (current: number, message?: string, phase?: ProcessingPhase) => void;
  increment: (message?: string, phase?: ProcessingPhase) => void;
  complete: (message: string) => void;
}

export function createProgressReporter(
  total: number,
  onUpdate: (progress: ProcessingProgress) => void
): ProgressReporter {
  const startedAt = performance.now();
  let phase: ProcessingPhase = "processing";
  let message = "";
  let current = 0;

  const publish = () => {
    const elapsedMs = performance.now() - startedAt;
    const boundedTotal = Math.max(1, total);
    const boundedCurrent = Math.min(boundedTotal, Math.max(0, current));
    const percent = Math.min(100, Math.round((boundedCurrent / boundedTotal) * 100));
    const etaMs =
      boundedCurrent > 0 && boundedCurrent < boundedTotal
        ? (elapsedMs / boundedCurrent) * (boundedTotal - boundedCurrent)
        : null;

    onUpdate({
      phase,
      current: boundedCurrent,
      total: boundedTotal,
      message,
      percent,
      etaMs,
      elapsedMs,
    });
  };

  return {
    setPhase(nextPhase) {
      phase = nextPhase;
      publish();
    },
    setMessage(nextMessage) {
      message = nextMessage;
      publish();
    },
    setCurrent(nextCurrent, nextMessage, nextPhase) {
      current = nextCurrent;
      if (nextMessage) {
        message = nextMessage;
      }
      if (nextPhase) {
        phase = nextPhase;
      }
      publish();
    },
    increment(nextMessage, nextPhase) {
      current += 1;
      if (nextMessage) {
        message = nextMessage;
      }
      if (nextPhase) {
        phase = nextPhase;
      }
      publish();
    },
    complete(nextMessage) {
      current = total;
      message = nextMessage;
      phase = "complete";
      publish();
    },
  };
}
