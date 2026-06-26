import type { CubeBgmTrackId } from "@mbox/shared";
import { resolveBgmSource } from "./export/bgmTracks";
import type { ShowcaseCatalogOptions } from "./showcaseCatalogOptions";

export function resolveShowcaseBgmUrl(
  catalog: ShowcaseCatalogOptions,
  bgmCustomUrl: string | null
): string | null {
  if (!catalog.bgmEnabled || catalog.bgmTrackId === "none") {
    return null;
  }
  return resolveBgmSource(catalog.bgmTrackId, bgmCustomUrl, catalog.bgmWorkspacePath);
}

export function describeShowcaseBgmSelection(
  catalog: Pick<ShowcaseCatalogOptions, "bgmEnabled" | "bgmTrackId" | "bgmWorkspacePath">,
  bgmCustomUrl: string | null
): string {
  if (!catalog.bgmEnabled || catalog.bgmTrackId === "none") {
    return "없음";
  }
  if (catalog.bgmTrackId === "custom") {
    return bgmCustomUrl ? "직접 업로드" : "업로드 필요";
  }
  if (catalog.bgmTrackId === "workspace" && catalog.bgmWorkspacePath) {
    const parts = catalog.bgmWorkspacePath.split("/");
    return parts[parts.length - 1] ?? catalog.bgmWorkspacePath;
  }
  return catalog.bgmTrackId;
}

export function isShowcaseBgmTrackId(value: string): value is CubeBgmTrackId {
  return (
    value === "none" ||
    value === "custom" ||
    value === "workspace" ||
    value === "cinematic_romantic" ||
    value === "piano_slideshow" ||
    value === "romantic_wedding" ||
    value === "bridal_chorus"
  );
}
