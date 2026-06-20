import { Film, ImageIcon, Music } from "lucide-react";
import { backgroundAssetDisplayName, isBackgroundVideoPath } from "../../../shared/lib/backgroundAssetCatalog";
import { CUBE_BGM_TRACKS } from "../bgm/bgmTracks";

interface MediaSummaryBarProps {
  viewportBackdropPath: string | null;
  bgmEnabled: boolean;
  bgmTrackId: string;
  bgmWorkspacePath: string | null;
  onJumpToMedia?: () => void;
}

function resolveBgmLabel(
  bgmEnabled: boolean,
  bgmTrackId: string,
  bgmWorkspacePath: string | null
): string {
  if (!bgmEnabled || bgmTrackId === "none") return "없음";
  if (bgmTrackId === "workspace" && bgmWorkspacePath) {
    const parts = bgmWorkspacePath.split("/");
    return parts[parts.length - 1] ?? bgmWorkspacePath;
  }
  if (bgmTrackId === "custom") return "직접 업로드";
  const preset = CUBE_BGM_TRACKS.find((track) => track.id === bgmTrackId);
  return preset?.label ?? bgmTrackId;
}

export function MediaSummaryBar({
  viewportBackdropPath,
  bgmEnabled,
  bgmTrackId,
  bgmWorkspacePath,
  onJumpToMedia,
}: MediaSummaryBarProps) {
  const bgLabel = backgroundAssetDisplayName(viewportBackdropPath);
  const isVideo = isBackgroundVideoPath(viewportBackdropPath);
  const musicLabel = resolveBgmLabel(bgmEnabled, bgmTrackId, bgmWorkspacePath);

  return (
    <div className="rounded-xl border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.7)] px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-mbox-subtle">미디어 요약</span>
        {onJumpToMedia ? (
          <button
            type="button"
            onClick={onJumpToMedia}
            className="text-[10px] text-mbox-gold hover:text-mbox-gold underline"
          >
            변경
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mbox-muted">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          {isVideo ? (
            <Film size={12} className="text-mbox-gold shrink-0" />
          ) : (
            <ImageIcon size={12} className="text-mbox-gold shrink-0" />
          )}
          <span className="text-mbox-subtle">배경</span>
          <span className="truncate font-medium text-mbox-text">{bgLabel}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <Music size={12} className="text-mbox-gold shrink-0" />
          <span className="text-mbox-subtle">BGM</span>
          <span className="truncate font-medium text-mbox-text">{musicLabel}</span>
        </span>
      </div>
    </div>
  );
}
