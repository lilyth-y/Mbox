import * as THREE from "three";
import {
  cubeFramePresetToFanBladeFrameId,
  createFanBladeOrnamentCanvas,
  getFanBladeRingStyle,
  sampleCubeFaceBorderPoint,
  sampleCubeFaceBorderRotation,
  type CubeFramePresetId,
  type FanBladeOrnamentKind,
} from "@mbox/shared";

const ORNAMENT_TEX_SIZE = 256;
const PRIMARY_ORNAMENTS = 36;
const FILLER_ORNAMENTS = 22;

export interface CubeFaceGarlandOptions {
  planeSize: number;
  zOffset: number;
  visible?: boolean;
}

export interface CubeFaceGarlandHandle {
  group: THREE.Group;
  setFramePreset: (preset: CubeFramePresetId) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

function disposeMaterial(mat: THREE.Material | THREE.Material[]): void {
  const list = Array.isArray(mat) ? mat : [mat];
  list.forEach((entry) => {
    const map = (entry as THREE.MeshBasicMaterial).map;
    map?.dispose();
    entry.dispose();
  });
}

function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    }
  }
}

function buildOrnamentMesh(
  kind: FanBladeOrnamentKind,
  seed: number,
  scale: number,
  renderOrder: number
): THREE.Mesh {
  const canvas = createFanBladeOrnamentCanvas(kind, ORNAMENT_TEX_SIZE, seed);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale), material);
  mesh.renderOrder = renderOrder;
  return mesh;
}

function pickFillerKind(
  kinds: FanBladeOrnamentKind[],
  index: number
): FanBladeOrnamentKind {
  if (kinds.includes("rose") && index % 3 !== 0) {
    return "rose";
  }
  if (kinds.includes("sparkle")) {
    return "sparkle";
  }
  return kinds[index % kinds.length] ?? "sparkle";
}

function rebuildGarlandGroup(
  group: THREE.Group,
  framePresetId: CubeFramePresetId,
  planeSize: number,
  zOffset: number
): void {
  clearGroup(group);

  const fanFrameId = cubeFramePresetToFanBladeFrameId(framePresetId);
  const style = getFanBladeRingStyle(fanFrameId);
  const half = planeSize * 0.5;
  const outerInset = half * 0.082;
  const innerInset = half * 0.118;
  const baseScale = planeSize * style.ornamentScale * 0.62;
  const kinds = style.kinds;

  for (let i = 0; i < PRIMARY_ORNAMENTS; i += 1) {
    const t = (i + 0.13) / PRIMARY_ORNAMENTS;
    const kind = kinds[i % kinds.length] ?? "rose";
    const jitter = ((i * 17) % 11) / 11 - 0.5;
    const { x, y } = sampleCubeFaceBorderPoint(t + jitter * 0.012, half, outerInset);
    const mesh = buildOrnamentMesh(kind, i * 1.73, baseScale * (0.88 + (i % 5) * 0.04), 6);
    mesh.position.set(x, y, zOffset + (i % 4) * 0.0015);
    mesh.rotation.z = sampleCubeFaceBorderRotation(t) + jitter * 0.12;
    group.add(mesh);
  }

  for (let j = 0; j < FILLER_ORNAMENTS; j += 1) {
    const t = (j + 0.41) / FILLER_ORNAMENTS;
    const kind = pickFillerKind(kinds, j);
    const jitter = ((j * 13) % 9) / 9 - 0.5;
    const { x, y } = sampleCubeFaceBorderPoint(t + jitter * 0.018, half, innerInset);
    const mesh = buildOrnamentMesh(
      kind,
      j * 2.11 + 40,
      baseScale * 0.58 * (0.92 + (j % 4) * 0.03),
      5
    );
    mesh.position.set(x, y, zOffset + 0.002 + (j % 3) * 0.001);
    mesh.rotation.z = sampleCubeFaceBorderRotation(t + 0.125) + jitter * 0.18;
    group.add(mesh);
  }
}

export function createCubeFaceGarlandBorder(
  framePresetId: CubeFramePresetId,
  options: CubeFaceGarlandOptions
): CubeFaceGarlandHandle {
  const group = new THREE.Group();
  group.name = "cube-face-garland";
  group.visible = options.visible ?? true;

  rebuildGarlandGroup(group, framePresetId, options.planeSize, options.zOffset);

  return {
    group,
    setFramePreset(nextPreset) {
      rebuildGarlandGroup(group, nextPreset, options.planeSize, options.zOffset);
    },
    setVisible(visible) {
      group.visible = visible;
    },
    dispose() {
      clearGroup(group);
    },
  };
}
