import { ExternalLink, Monitor } from "lucide-react";
import { openSystemGpuBrowser } from "../../shared/lib/openSystemGpuBrowser";
import {
  buildChromeGpuPreviewUrl,
  markCompanionAutoOpened,
  wasCompanionAutoOpened,
} from "../../shared/lib/showcaseChromeCompanion";

type Props = {
  chromeLive: boolean;
  onOpenChrome: () => void;
};

/** Cursor shell — 3D runs in RTX Chrome, not in Electron. */
export function ChromeCompanionViewport({ chromeLive, onOpenChrome }: Props) {
  return (
    <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/80 to-black/95 px-6 text-center">
      <Monitor className="h-10 w-10 text-mbox-gold/90" aria-hidden />
      <div className="max-w-sm space-y-2">
        <p className="text-sm font-semibold text-mbox-text">RTX Chrome에서 3D 미리보기</p>
        <p className="text-xs leading-relaxed text-mbox-muted">
          Cursor 탭에는 WebGL이 없습니다. 카탈로그·업로드는 이 탭에서, 3D 렌더는 시스템 Chrome(RTX)에서
          실행됩니다.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" className="primary-btn text-xs font-semibold" onClick={onOpenChrome}>
          <ExternalLink className="mr-1.5 inline h-3.5 w-3.5" aria-hidden />
          RTX Chrome에서 열기
        </button>
      </div>
        <p className="text-[11px] text-mbox-muted">
        {chromeLive ? (
          <span className="text-emerald-400/90">Chrome 미리보기 연결됨 · 변경 사항 동기화 중</span>
        ) : (
          <span>Chrome 탭을 열면 실시간으로 동기화됩니다 · 연결 끊김 시 「RTX Chrome에서 열기」</span>
        )}
      </p>
    </div>
  );
}

export function autoOpenChromeCompanionOnce(onOpen: () => void): void {
  if (wasCompanionAutoOpened()) {
    return;
  }
  markCompanionAutoOpened();
  onOpen();
}

export function openChromeGpuPreviewTab(): void {
  void openSystemGpuBrowser(buildChromeGpuPreviewUrl());
}
