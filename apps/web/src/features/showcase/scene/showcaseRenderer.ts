import type * as THREE from "three";

export function clearShowcaseMount(container: HTMLElement): void {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

export function disposeShowcaseRenderer(
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

export function syncShowcaseRenderer(
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
