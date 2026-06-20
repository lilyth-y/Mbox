import * as THREE from "three";
import {
  VIEWPORT_BACKDROP_OPACITY_DEFAULT,
  VIEWPORT_BACKDROP_OPACITY_MIN,
} from "@mbox/shared";
import {
  disposeViewportBackdropMedia,
  loadViewportBackdropMedia,
  type ViewportBackdropMedia,
} from "./viewportBackdropMedia";

const FALLBACK_COLOR = new THREE.Color(0x000000);
const BACKDROP_PLANE_DISTANCE = 42;

export interface ViewportBackdropOptions {
  galaxyBackgroundActive?: boolean;
  opacity?: number;
  camera?: THREE.PerspectiveCamera;
}

export interface ViewportBackdropBinding {
  apply: (assetPath: string | null, options?: ViewportBackdropOptions) => void;
  setOpacity: (opacity: number) => void;
  syncToCamera: (camera: THREE.PerspectiveCamera) => void;
  dispose: () => void;
}

function clampOpacity(value: number | undefined): number {
  const n = value ?? VIEWPORT_BACKDROP_OPACITY_DEFAULT;
  return Math.min(1, Math.max(VIEWPORT_BACKDROP_OPACITY_MIN, n));
}

function usesDimmedPlane(opacity: number): boolean {
  return opacity < 0.999;
}

function fitBackdropPlane(mesh: THREE.Mesh, camera: THREE.PerspectiveCamera): void {
  const vFov = (camera.fov * Math.PI) / 180;
  const height = 2 * Math.tan(vFov / 2) * BACKDROP_PLANE_DISTANCE;
  const width = height * camera.aspect;
  mesh.scale.set(width, height, 1);
  mesh.position.set(0, 0, -BACKDROP_PLANE_DISTANCE);
}

export function createViewportBackdropBinding(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  initialCamera?: THREE.PerspectiveCamera
): ViewportBackdropBinding {
  let media: ViewportBackdropMedia | null = null;
  let loadToken = 0;
  let cancelLoad: (() => void) | null = null;
  let camera: THREE.PerspectiveCamera | null = initialCamera ?? null;
  let opacity = VIEWPORT_BACKDROP_OPACITY_DEFAULT;
  let backdropMesh: THREE.Mesh | null = null;
  let currentPath: string | null = null;

  const disposeMesh = () => {
    if (backdropMesh && camera) {
      camera.remove(backdropMesh);
    }
    backdropMesh?.geometry.dispose();
    const mat = backdropMesh?.material;
    if (mat instanceof THREE.Material) {
      mat.dispose();
    }
    backdropMesh = null;
  };

  const disposeMedia = () => {
    cancelLoad?.();
    cancelLoad = null;
    disposeViewportBackdropMedia(media);
    media = null;
  };

  const applyFallback = () => {
    disposeMesh();
    scene.background = FALLBACK_COLOR;
    renderer.setClearColor(FALLBACK_COLOR, 1);
  };

  const ensureBackdropMesh = (texture: THREE.Texture): THREE.Mesh | null => {
    if (!camera) return null;
    if (!backdropMesh) {
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      backdropMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      backdropMesh.renderOrder = -1000;
      camera.add(backdropMesh);
    } else {
      const material = backdropMesh.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.map = texture;
        material.needsUpdate = true;
      }
    }
    fitBackdropPlane(backdropMesh, camera);
    return backdropMesh;
  };

  const applyTextureToScene = (texture: THREE.Texture) => {
    if (usesDimmedPlane(opacity)) {
      scene.background = FALLBACK_COLOR;
      renderer.setClearColor(FALLBACK_COLOR, 1);
      const mesh = ensureBackdropMesh(texture);
      if (mesh) {
        const material = mesh.material as THREE.MeshBasicMaterial;
        material.opacity = opacity;
        material.transparent = true;
      }
    } else {
      disposeMesh();
      scene.background = texture;
      renderer.setClearColor(0x000000, 1);
    }
  };

  return {
    apply(assetPath, options) {
      if (options?.camera) {
        camera = options.camera;
      }
      if (options?.opacity !== undefined) {
        opacity = clampOpacity(options.opacity);
      }

      if (options?.galaxyBackgroundActive) {
        loadToken += 1;
        disposeMedia();
        disposeMesh();
        currentPath = null;
        scene.background = null;
        renderer.setClearColor(0x000000, 0);
        return;
      }

      if (!assetPath) {
        loadToken += 1;
        currentPath = null;
        disposeMedia();
        applyFallback();
        return;
      }

      if (assetPath === currentPath && media) {
        applyTextureToScene(media.texture);
        return;
      }

      const token = ++loadToken;
      currentPath = assetPath;
      disposeMedia();
      disposeMesh();

      cancelLoad = loadViewportBackdropMedia(
        assetPath,
        (loaded) => {
          if (token !== loadToken) {
            disposeViewportBackdropMedia(loaded);
            return;
          }
          media = loaded;
          applyTextureToScene(loaded.texture);
        },
        () => {
          if (token === loadToken) {
            currentPath = null;
            disposeMedia();
            applyFallback();
          }
        }
      );
    },

    setOpacity(nextOpacity) {
      opacity = clampOpacity(nextOpacity);
      if (!media) return;
      applyTextureToScene(media.texture);
    },

    syncToCamera(nextCamera) {
      camera = nextCamera;
      if (backdropMesh && camera) {
        if (backdropMesh.parent !== camera) {
          backdropMesh.parent?.remove(backdropMesh);
          camera.add(backdropMesh);
        }
        fitBackdropPlane(backdropMesh, camera);
      }
    },

    dispose() {
      loadToken += 1;
      currentPath = null;
      disposeMedia();
      disposeMesh();
      applyFallback();
    },
  };
}

export function mountViewportBackdrop(
  bindingRef: { current: ViewportBackdropBinding | null },
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  assetPath: string | null,
  options?: ViewportBackdropOptions
): void {
  bindingRef.current?.dispose();
  bindingRef.current = createViewportBackdropBinding(scene, renderer, options?.camera);
  bindingRef.current.apply(assetPath, options);
}
