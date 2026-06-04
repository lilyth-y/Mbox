import type { CubeBgmTrackId } from "@mbox/shared";

function resolvePublicPath(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return base.endsWith("/") ? `${base}${cleanPath}` : `${base}/${cleanPath}`;
}

export interface CubeBgmTrackDefinition {
  id: Exclude<CubeBgmTrackId, "none" | "custom">;
  label: string;
  description: string;
  /** Served from `apps/web/public/bgm/` */
  publicPath: string;
  /** Suggested trim / loop length (seconds) */
  durationSec: number;
}

/** Install files via `npm run setup:bgm` or copy MP3s per public/bgm/README.md */
export const CUBE_BGM_TRACKS: CubeBgmTrackDefinition[] = [
  {
    id: "cinematic_romantic",
    label: "시네마 로맨틱",
    description: "웨딩 큐브 기본 추천 · 3분대",
    publicPath: "/bgm/cinematic-romantic.mp3",
    durationSec: 212,
  },
  {
    id: "piano_slideshow",
    label: "피아노 슬라이드",
    description: "잔잔한 슬라이드쇼",
    publicPath: "/bgm/piano-slideshow.mp3",
    durationSec: 140,
  },
  {
    id: "romantic_wedding",
    label: "로맨틱 웨딩 피아노",
    description: "부드러운 연주회 무드",
    publicPath: "/bgm/romantic-wedding.mp3",
    durationSec: 146,
  },
  {
    id: "bridal_chorus",
    label: "바그너 결혼 행진곡 (입장곡)",
    description: "결혼식 주인공 입장용 전통 클래식 BGM",
    publicPath: "/bgm/bridal-chorus.mp3",
    durationSec: 104,
  },
];

export function resolveBgmSource(
  trackId: CubeBgmTrackId,
  customObjectUrl: string | null
): string | null {
  if (trackId === "none") {
    return null;
  }
  if (trackId === "custom") {
    return customObjectUrl;
  }
  const track = CUBE_BGM_TRACKS.find((entry) => entry.id === trackId);
  return track ? resolvePublicPath(track.publicPath) : null;
}

export async function probeBgmAvailability(publicPath: string): Promise<boolean> {
  try {
    const resolvedUrl = resolvePublicPath(publicPath);
    const response = await fetch(resolvedUrl, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}
