import type * as THREE from "three";

/** Remove all canvases under the mount node (fixes stacked WebGL layers after setting clicks). */
export function clearCubeMount(container: HTMLElement): void {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

export function disposeCubeRenderer(
  container: HTMLElement,
  renderer: THREE.WebGLRenderer | null | undefined
): void {
  if (!renderer) {
    return;
  }
  const canvas = renderer.domElement;
  if (canvas.parentElement === container) {
    container.removeChild(canvas);
  }
  renderer.dispose();
}

export function syncRendererToContainer(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  container: HTMLElement
): void {
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const size = Math.min(width, height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(size, size, false);
  camera.aspect = 1.0;
  camera.updateProjectionMatrix();
}

const CUBE_LOOK_TARGET = { x: 0, y: 0, z: 0 } as const;

/** Keep the cube centered in the viewport regardless of aspect ratio. */
export function aimCameraAtCubeOrigin(camera: THREE.PerspectiveCamera): void {
  camera.lookAt(CUBE_LOOK_TARGET.x, CUBE_LOOK_TARGET.y, CUBE_LOOK_TARGET.z);
}

/** Slightly larger cube in live hologram preview (export/recording uses timeline scale only). */
// Keep this conservative: too large makes the cube clip the viewport and look "missing".
export const HOLOGRAM_PREVIEW_SCALE_MUL = 1.0;

export function applyHologramPreviewScale(root: THREE.Object3D): void {
  const s = root.scale.x * HOLOGRAM_PREVIEW_SCALE_MUL;
  root.scale.set(s, s, s);
}
