import type { CubeBgmTrackId } from "@mbox/shared";
import { resolveUserAssetPublicUrl } from "../../../shared/lib/userBgmCatalog";

function resolvePublicPath(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return base.endsWith("/") ? `${base}${cleanPath}` : `${base}/${cleanPath}`;
}

export interface ShowcaseBgmTrackDefinition {
  id: Exclude<CubeBgmTrackId, "none" | "custom">;
  label: string;
  description: string;
  publicPath: string;
  durationSec: number;
}

export const SHOWCASE_BGM_TRACKS: ShowcaseBgmTrackDefinition[] = [
  {
    id: "cinematic_romantic",
    label: "시네마 로맨틱",
    description: "로맨틱 쇼케이스 추천 · 3분대",
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
    label: "클래식 입장곡",
    description: "입장·행진 분위기",
    publicPath: "/bgm/bridal-chorus.mp3",
    durationSec: 123,
  },
];

/** @deprecated use SHOWCASE_BGM_TRACKS */
export const CUBE_BGM_TRACKS = SHOWCASE_BGM_TRACKS;

export function resolveBgmSource(
  trackId: CubeBgmTrackId,
  customObjectUrl: string | null,
  workspacePublicPath: string | null = null
): string | null {
  if (trackId === "none") {
    return null;
  }
  if (trackId === "custom") {
    return customObjectUrl;
  }
  if (trackId === "workspace") {
    return workspacePublicPath ? resolveUserAssetPublicUrl(workspacePublicPath) : null;
  }
  const track = SHOWCASE_BGM_TRACKS.find((entry) => entry.id === trackId);
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
