import * as THREE from "three";
import { isLocalGpuExportSession } from "./renderExportProfile";
import { isLocalGpuSession } from "./gpuSession";

export function isThreeLocalGpuSession(): boolean {
  return isLocalGpuSession() || isLocalGpuExportSession();
}

export function resolveThreePreviewPixelRatio(): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  if (isThreeLocalGpuSession()) {
    return Math.min(Math.max(1, dpr), 2.5);
  }
  return Math.min(dpr, 1.5);
}

/** Shared Three.js renderer — discrete GPU on local preview/export. */
export function createThreeWebGlRenderer(
  options: Partial<THREE.WebGLRendererParameters> = {}
): THREE.WebGLRenderer {
  const localGpu = isThreeLocalGpuSession();
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true,
    powerPreference: localGpu ? "high-performance" : "default",
    stencil: localGpu,
    precision: localGpu ? "highp" : "mediump",
    ...options,
  });
  renderer.setPixelRatio(resolveThreePreviewPixelRatio());
  return renderer;
}

export function logThreeGpuRenderer(renderer: THREE.WebGLRenderer, label: string): void {
  if (!import.meta.env.DEV || !isThreeLocalGpuSession()) {
    return;
  }
  const gl = renderer.getContext();
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  const gpuName = ext
    ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
    : gl?.getParameter(gl.RENDERER);
  console.info(`[${label}] local GPU renderer:`, gpuName);
}
