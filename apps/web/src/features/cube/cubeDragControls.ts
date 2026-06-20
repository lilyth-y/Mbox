import * as THREE from "three";

export interface CubeDragControlsOptions {
  /** When false, pointer handlers are ignored (recording / non-cube_focus). */
  enabled?: () => boolean;
  /** Called when drag starts — freeze auto timeline. */
  onDragStart?: () => void;
  /** Called when drag ends — resume auto timeline. */
  onDragEnd?: () => void;
  /** Auto fan rotation at drag start (defaults to corner rest). */
  getBaseRotation?: () => THREE.Euler;
}

export interface CubeDragControls {
  readonly isDragging: boolean;
  /** While dragging, overrides auto fan root rotation. */
  applyDragRotation(root: THREE.Object3D): boolean;
  dispose(): void;
}

const DRAG_SENSITIVITY = 0.007;
const MAX_PITCH = Math.PI / 4;
const DEFAULT_BASE = new THREE.Euler(0, 0.38, 0, "XYZ");

/**
 * Pointer drag for cube preview (ported from packages/cube-core CubePlayer).
 * Pauses the presentation timeline while the user drags.
 */
export function createCubeDragControls(
  domElement: HTMLElement,
  options: CubeDragControlsOptions = {}
): CubeDragControls {
  let isDragging = false;
  let previousPointer = { x: 0, y: 0 };
  const targetRotation = new THREE.Euler(0, 0.38, 0, "XYZ");
  const dragBaseRotation = new THREE.Euler(0, 0.38, 0, "XYZ");

  const isEnabled = () => options.enabled?.() ?? true;

  const onPointerDown = (clientX: number, clientY: number) => {
    if (!isEnabled()) {
      return;
    }
    const base = options.getBaseRotation?.() ?? DEFAULT_BASE;
    targetRotation.copy(base);
    dragBaseRotation.copy(base);
    isDragging = true;
    previousPointer = { x: clientX, y: clientY };
    options.onDragStart?.();
  };

  const onPointerMove = (clientX: number, clientY: number) => {
    if (!isDragging) {
      return;
    }
    const deltaMove = {
      x: clientX - previousPointer.x,
      y: clientY - previousPointer.y,
    };
    targetRotation.y = dragBaseRotation.y + deltaMove.x * DRAG_SENSITIVITY;
    targetRotation.x = THREE.MathUtils.clamp(
      dragBaseRotation.x + deltaMove.y * DRAG_SENSITIVITY,
      -MAX_PITCH,
      MAX_PITCH
    );
    previousPointer = { x: clientX, y: clientY };
  };

  const onPointerUp = () => {
    if (!isDragging) {
      return;
    }
    isDragging = false;
    options.onDragEnd?.();
  };

  const handleMouseDown = (event: MouseEvent) => {
    event.preventDefault();
    onPointerDown(event.clientX, event.clientY);
  };

  const handleMouseMove = (event: MouseEvent) => {
    onPointerMove(event.clientX, event.clientY);
  };

  const handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1 || !event.touches[0]) {
      return;
    }
    onPointerDown(event.touches[0].clientX, event.touches[0].clientY);
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1 || !event.touches[0]) {
      return;
    }
    onPointerMove(event.touches[0].clientX, event.touches[0].clientY);
  };

  domElement.addEventListener("mousedown", handleMouseDown);
  window.addEventListener("mouseup", onPointerUp);
  domElement.addEventListener("mousemove", handleMouseMove);
  domElement.addEventListener("touchstart", handleTouchStart, { passive: true });
  window.addEventListener("touchend", onPointerUp);
  domElement.addEventListener("touchmove", handleTouchMove, { passive: true });

  return {
    get isDragging() {
      return isDragging;
    },
    applyDragRotation(root: THREE.Object3D) {
      if (!isDragging) {
        return false;
      }
      root.rotation.set(targetRotation.x, targetRotation.y, targetRotation.z);
      return true;
    },
    dispose() {
      domElement.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", onPointerUp);
      domElement.removeEventListener("mousemove", handleMouseMove);
      domElement.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", onPointerUp);
      domElement.removeEventListener("touchmove", handleTouchMove);
    },
  };
}

