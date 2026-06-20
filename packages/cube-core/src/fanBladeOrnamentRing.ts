import * as THREE from "three";
import type { FanBladeFrameId } from "../../shared/src/fanBladeFrame.js";
import {
  createFanBladeOrnamentCanvas,
  getFanBladeRingStyle,
  type FanBladeOrnamentKind,
} from "../../shared/src/fanBladeOrnamentArt.js";

const ORNAMENT_TEX_SIZE = 256;
const ORNAMENT_Z = 0.04;
const RING_DISTANCE = 1.12;
const RING_INSET = 0.9;
const REFERENCE_RADIUS = 1;

export interface FanBladeRingLayout {
  distance: number;
  radius: number;
  tube: number;
  ornamentScaleMul: number;
}

export interface FanBladeOrnamentRingHandle {
  group: THREE.Group;
  setFrameId: (frameId: FanBladeFrameId) => void;
  updateLayout: (camera: THREE.PerspectiveCamera) => void;
  dispose: () => void;
}

export function computeFanBladeRingLayout(camera: THREE.PerspectiveCamera): FanBladeRingLayout {
  const halfFovRad = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const halfHeight = Math.tan(halfFovRad) * RING_DISTANCE;
  const halfWidth = halfHeight * camera.aspect;
  const radius = Math.min(halfWidth, halfHeight) * RING_INSET;
  return {
    distance: RING_DISTANCE,
    radius,
    tube: Math.max(0.016, radius * 0.034),
    ornamentScaleMul: radius * 0.124,
  };
}

function disposeMaterial(mat: THREE.Material | THREE.Material[]): void {
  const list = Array.isArray(mat) ? mat : [mat];
  list.forEach((entry) => {
    const map = (entry as THREE.MeshStandardMaterial).map;
    map?.dispose();
    entry.dispose();
  });
}

function buildOrnamentMesh(
  kind: FanBladeOrnamentKind,
  seed: number,
  scale: number
): THREE.Mesh {
  const canvas = createFanBladeOrnamentCanvas(kind, ORNAMENT_TEX_SIZE, seed);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale), material);
  mesh.renderOrder = 220;
  return mesh;
}

function rebuildRing(group: THREE.Group, frameId: FanBladeFrameId): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    }
  }

  const style = getFanBladeRingStyle(frameId);
  const tube = 0.042;
  const torusMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(style.torusColor),
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.98,
  });
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(REFERENCE_RADIUS, tube, 24, 128),
    torusMat
  );
  torus.renderOrder = 210;
  group.add(torus);

  const kinds = style.kinds;
  const count = kinds.length;
  const ornamentScale = 0.12 * (style.ornamentScale / 0.2);
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const kind = kinds[i] ?? "sparkle";
    const mesh = buildOrnamentMesh(kind, i * 1.7, ornamentScale);
    mesh.position.set(
      Math.cos(angle) * REFERENCE_RADIUS,
      Math.sin(angle) * REFERENCE_RADIUS,
      ORNAMENT_Z
    );
    mesh.rotation.z = angle + Math.PI / 2;
    group.add(mesh);
  }
}

function applyRingLayout(group: THREE.Group, camera: THREE.PerspectiveCamera): void {
  const layout = computeFanBladeRingLayout(camera);
  group.position.set(0, 0, -layout.distance);
  group.scale.setScalar(layout.radius / REFERENCE_RADIUS);
}

/** Camera-attached fan-blade frame ring (HUD overlay — always visible in preview/export). */
export function createFanBladeOrnamentRing(
  camera: THREE.PerspectiveCamera,
  frameId: FanBladeFrameId = "rose_gold_ring"
): FanBladeOrnamentRingHandle {
  const group = new THREE.Group();
  group.renderOrder = 200;
  camera.add(group);

  let currentFrameId = frameId;
  let lastLayoutKey = "";

  rebuildRing(group, currentFrameId);
  applyRingLayout(group, camera);

  const layoutKey = (cam: THREE.PerspectiveCamera) =>
    `${cam.fov.toFixed(3)}:${cam.aspect.toFixed(4)}`;

  return {
    group,
    setFrameId(nextFrameId) {
      currentFrameId = nextFrameId;
      rebuildRing(group, currentFrameId);
      applyRingLayout(group, camera);
      lastLayoutKey = layoutKey(camera);
    },
    updateLayout(cam) {
      const key = layoutKey(cam);
      if (key === lastLayoutKey) {
        return;
      }
      lastLayoutKey = key;
      applyRingLayout(group, cam);
    },
    dispose() {
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          disposeMaterial(child.material);
        }
      }
      camera.remove(group);
    },
  };
}
