import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Trash2 } from "lucide-react";
import type { CubeBgmTrackId } from "@mbox/shared";
import { CUBE_BGM_TRACKS, probeBgmAvailability, resolveBgmSource } from "./bgm/bgmTracks";
import {
  loadUserBgmCatalog,
  resolveUserAssetPublicUrl,
  type UserBgmCatalogItem,
} from "../../shared/lib/userBgmCatalog";

export type BgmPickerMode = "builtin" | "mine" | "upload";

interface BgmAssetPickerProps {
  mode: BgmPickerMode;
  selectedTrackId: CubeBgmTrackId;
  selectedWorkspacePath: string | null;
  disabled?: boolean;
  reloadToken?: number;
  bgmAvailable: Record<string, boolean>;
  onSelectBuiltin: (trackId: CubeBgmTrackId) => void;
  onSelectWorkspace: (publicPath: string) => void;
  onDeleteWorkspaceFile?: (publicPath: string) => void | Promise<void>;
  uploadSlot?: React.ReactNode;
}

export function BgmAssetPicker({
  mode,
  selectedTrackId,
  selectedWorkspacePath,
  disabled = false,
  reloadToken = 0,
  bgmAvailable,
  onSelectBuiltin,
  onSelectWorkspace,
  onDeleteWorkspaceFile,
  uploadSlot,
}: BgmAssetPickerProps) {
  const [catalog, setCatalog] = useState<{ items: UserBgmCatalogItem[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (mode !== "mine") return;
    let cancelled = false;
    setLoading(true);
    void loadUserBgmCatalog(true)
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, reloadToken]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const togglePreview = async (url: string) => {
    if (previewPath === url) {
      audioRef.current?.pause();
      setPreviewPath(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(url);
    audio.volume = 0.85;
    audioRef.current = audio;
    setPreviewPath(url);
    audio.onended = () => setPreviewPath(null);
    try {
      await audio.play();
    } catch {
      setPreviewPath(null);
    }
  };

  const handleDelete = async (publicPath: string) => {
    if (!onDeleteWorkspaceFile || disabled) return;
    if (!window.confirm("이 MP3를 작업공간에서 삭제할까요?")) return;
    setDeletingPath(publicPath);
    try {
      await onDeleteWorkspaceFile(publicPath);
      if (selectedWorkspacePath === publicPath) {
        onSelectWorkspace("");
      }
    } finally {
      setDeletingPath(null);
    }
  };

  if (mode === "upload") {
    return uploadSlot ? <div>{uploadSlot}</div> : null;
  }

  if (mode === "builtin") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CUBE_BGM_TRACKS.map((track) => {
          const available = bgmAvailable[track.id] ?? false;
          const selected = selectedTrackId === track.id;
          const previewUrl = available ? resolveBgmSource(track.id, null, null) : null;
          return (
            <div
              key={track.id}
              className={`rounded-xl border px-3 py-2 text-left text-xs flex gap-2 ${
                selected
                  ? "border-mbox-gold/50 bg-mbox-gold/10"
                  : available
                    ? "border-[rgba(223,179,134,0.12)] hover:border-mbox-gold/30"
                    : "border-[rgba(223,179,134,0.12)] opacity-40"
              }`}
            >
              <button
                type="button"
                disabled={disabled || !available}
                onClick={() => onSelectBuiltin(track.id)}
                className="flex-1 text-left disabled:cursor-not-allowed"
              >
                <p className="font-semibold text-mbox-text">{track.label}</p>
                <p className="text-mbox-subtle">{track.description}</p>
                {!available ? (
                  <p className="mt-1 text-amber-400/90">파일 없음 · public/bgm/README.md</p>
                ) : null}
              </button>
              {previewUrl ? (
                <button
                  type="button"
                  disabled={disabled}
                  title="미리듣기"
                  onClick={() => void togglePreview(previewUrl)}
                  className="shrink-0 self-start rounded-lg border border-[rgba(223,179,134,0.18)] p-2 text-mbox-muted hover:border-mbox-gold/50 hover:text-mbox-gold"
                >
                  {previewPath === previewUrl ? <Pause size={14} /> : <Play size={14} />}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  if (loading) {
    return (
      <p className="text-[11px] text-mbox-subtle inline-flex items-center gap-2">
        <Loader2 size={12} className="animate-spin" />
        내 MP3 목록 불러오는 중…
      </p>
    );
  }

  if (!catalog?.items.length) {
    return (
      <p className="text-[11px] text-mbox-subtle leading-relaxed">
        아직 MP3가 없습니다. 아래에 파일을 끌어다 놓으세요.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
      {catalog.items.map((item) => {
        const selected = selectedTrackId === "workspace" && selectedWorkspacePath === item.publicPath;
        const previewUrl = resolveUserAssetPublicUrl(item.publicPath);
        return (
          <div
            key={item.publicPath}
            className={`relative group rounded-lg border px-3 py-2 text-left text-xs flex gap-2 ${
              selected
                ? "border-mbox-gold/50 bg-mbox-gold/10 text-mbox-gold"
                : "border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.65)] text-mbox-muted"
            }`}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelectWorkspace(item.publicPath)}
              className="flex-1 text-left min-w-0"
            >
              <p className="font-semibold truncate">{item.label}</p>
              <p className="text-[10px] text-mbox-subtle truncate">{item.file}</p>
            </button>
            <button
              type="button"
              disabled={disabled}
              title="미리듣기"
              onClick={() => void togglePreview(previewUrl)}
              className="shrink-0 rounded-lg border border-[rgba(223,179,134,0.18)] p-1.5 text-mbox-muted hover:border-mbox-gold/50"
            >
              {previewPath === previewUrl ? <Pause size={12} /> : <Play size={12} />}
            </button>
            {onDeleteWorkspaceFile ? (
              <button
                type="button"
                disabled={disabled || deletingPath === item.publicPath}
                title="삭제"
                onClick={() => void handleDelete(item.publicPath)}
                className="shrink-0 rounded-lg border border-[rgba(223,179,134,0.12)] p-1.5 text-mbox-muted opacity-0 transition hover:bg-mbox-gold/80 hover:text-white group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export async function probeBuiltinBgmAvailability(): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    CUBE_BGM_TRACKS.map(async (track) => [track.id, await probeBgmAvailability(track.publicPath)] as const)
  );
  return Object.fromEntries(entries);
}
