import type * as THREE from "three";

/** Hologram fan assets are authored at 1024²; export should match or exceed preview sharpness. */
export const CUBE_EXPORT_SIZE_STANDARD = 1024;
export const CUBE_EXPORT_SIZE_HIGH = 2048;

export type CubeExportQuality = "standard" | "high";

export function resolveCubeExportPixelSize(
  quality: CubeExportQuality,
  resolutionEnhanceScale?: number
): number {
  if (quality === "high") {
    return resolutionEnhanceScale === 2 ? CUBE_EXPORT_SIZE_HIGH : CUBE_EXPORT_SIZE_HIGH;
  }
  return resolutionEnhanceScale === 2 ? CUBE_EXPORT_SIZE_HIGH : CUBE_EXPORT_SIZE_STANDARD;
}

export function resolveVideoBitsPerSecond(exportSize: number): number {
  if (exportSize >= 2048) {
    return 14_000_000;
  }
  if (exportSize >= 1024) {
    return 8_000_000;
  }
  return 5_000_000;
}

export interface RendererLayoutSnapshot {
  width: number;
  height: number;
  aspect: number;
  pixelRatio: number;
}

export function snapshotRendererLayout(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera
): RendererLayoutSnapshot {
  return {
    width: renderer.domElement.width,
    height: renderer.domElement.height,
    aspect: camera.aspect,
    pixelRatio: renderer.getPixelRatio(),
  };
}

export function applyExportRendererSize(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  exportSize: number
): void {
  renderer.setPixelRatio(1);
  renderer.setSize(exportSize, exportSize, false);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
}

export function restoreRendererLayout(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  container: HTMLElement,
  snapshot: RendererLayoutSnapshot
): void {
  renderer.setPixelRatio(snapshot.pixelRatio);
  const width = container.clientWidth || snapshot.width;
  const height = container.clientHeight || snapshot.height;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

export async function waitForRendererFrames(count = 2): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}
