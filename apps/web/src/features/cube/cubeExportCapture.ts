import type * as THREE from "three";
import type { PresentationScene } from "./presentationScene";
import { RECORD_ENCODER_FLUSH_MS } from "./cubeRecorder";

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

export interface PresentationTextureSnapshot {
  textures: THREE.Texture[];
  plateTextures: Array<THREE.Texture | null>;
  subjectForegroundTextures: Array<THREE.Texture | null>;
}

export function isPresentationTextureReady(texture: THREE.Texture): boolean {
  const img = (texture as unknown as { image?: HTMLImageElement | ImageBitmap | HTMLCanvasElement })
    .image;
  if (!img) {
    return false;
  }
  if (img instanceof HTMLCanvasElement) {
    return img.width > 0 && img.height > 0;
  }
  if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
    return true;
  }
  const el = img as HTMLImageElement;
  return el.complete && el.naturalWidth > 0;
}

export function listPresentationTextures(
  snapshot: PresentationTextureSnapshot
): THREE.Texture[] {
  return [
    ...snapshot.textures,
    ...snapshot.plateTextures.filter((texture): texture is THREE.Texture => texture !== null),
    ...snapshot.subjectForegroundTextures.filter(
      (texture): texture is THREE.Texture => texture !== null
    ),
  ];
}

export function allPresentationTexturesReady(snapshot: PresentationTextureSnapshot): boolean {
  return listPresentationTextures(snapshot).every(isPresentationTextureReady);
}

export async function waitForPresentationTextures(
  snapshot: PresentationTextureSnapshot,
  timeoutMs = 15_000
): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (allPresentationTexturesReady(snapshot)) {
      return true;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
  }
  return allPresentationTexturesReady(snapshot);
}

/** Match wedding-simple: capture the WebGL canvas directly (preserveDrawingBuffer must be true). */
export function createCubeRecordingVideoStream(
  renderer: THREE.WebGLRenderer,
  fps = 30
): MediaStream {
  return renderer.domElement.captureStream(fps);
}

/** MP4 content length — loop-bridge is preview-only; encoder flush is extra tail. */
export function resolveRecordDurationMs(contentDurationMs: number): number {
  return contentDurationMs + RECORD_ENCODER_FLUSH_MS;
}

export interface PrepareCubeRecordingExportOptions {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  exportSize: number;
  presentation?: PresentationScene | null;
  texturesSnapshot?: PresentationTextureSnapshot | null;
  /** Called after export renderer resize (e.g. micro-module layout). */
  onLayoutResized?: () => void;
  warmupFrames?: number;
  preRollMs?: number;
}

/**
 * Stabilize WebGL export before MediaRecorder.start:
 * textures ready → shader compile at export resolution → warm frames → short pre-roll.
 */
export async function prepareCubeRecordingExport(
  options: PrepareCubeRecordingExportOptions
): Promise<void> {
  const {
    renderer,
    camera,
    scene,
    exportSize,
    presentation,
    texturesSnapshot,
    onLayoutResized,
    warmupFrames = 24,
    preRollMs = 650,
  } = options;

  presentation?.setRecordingExportMode?.(true);
  presentation?.resetTextureCarousel?.();
  applyExportRendererSize(renderer, camera, exportSize);
  onLayoutResized?.();

  if (texturesSnapshot) {
    await waitForPresentationTextures(texturesSnapshot);
    presentation?.refreshFaceTextures?.();
  }

  renderer.compile(scene, camera);
  await waitForRendererFrames(warmupFrames);
  renderer.compile(scene, camera);
  await waitForRendererFrames(Math.min(8, warmupFrames));

  if (preRollMs > 0) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, preRollMs));
  }
}

export function endCubeRecordingExport(presentation?: PresentationScene | null): void {
  presentation?.setRecordingExportMode?.(false);
}

/** Timeline for export: no loop-bridge; hold last step during encoder flush window. */
export function resolveExportRecordingElapsed(
  elapsedMs: number,
  contentDurationMs: number
): number {
  return Math.min(Math.max(0, elapsedMs), contentDurationMs);
}
