import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  createCrystalShellMaterial,
  pulseCrystalShellMaterial,
} from "../materials/crystalShellMaterial";
import {
  createInnerPhotoMaterial,
  updateInnerPhotoMaterial,
} from "../materials/innerPhotoMaterial";

/** Outer crystal paperweight size (matches reference proportions). */
const OUTER_SIZE = 2.25;
/** Inner photo block — slightly smaller so glass rim is visible. */
const INNER_SIZE = 1.72;
/** Chamfer/bevel radius on outer shell (faceted cut-gem look). */
const CHAMFER_RADIUS = 0.11;

export interface JewelCubeMesh {
  group: THREE.Group;
  /** Transparent refractive glass shell. */
  outerShell: THREE.Mesh;
  shellMaterial: THREE.MeshPhysicalMaterial;
  /** Photo core inside the crystal. */
  innerCore: THREE.Mesh;
  innerMaterials: THREE.MeshBasicMaterial[];
  /** Bright edge glints along chamfered facets. */
  edgeGlints: THREE.LineSegments;
}

function createInnerMaterials(texture: THREE.Texture): THREE.MeshBasicMaterial[] {
  return Array.from({ length: 6 }, () => createInnerPhotoMaterial(texture));
}

function createEdgeGlints(shellMesh: THREE.Mesh): THREE.LineSegments {
  const edges = new THREE.EdgesGeometry(shellMesh.geometry, 12);
  const mat = new THREE.LineBasicMaterial({
    color: 0xe8f8ff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(edges, mat);
  lines.renderOrder = 5;
  return lines;
}

/**
 * Crystal paperweight mesh: inner photo cube + transparent chamfered outer shell.
 * Matches physical laser-etched crystal cubes (photo inside, glass outside).
 */
export function createJewelCubeMesh(texture: THREE.Texture): JewelCubeMesh {
  const innerMaterials = createInnerMaterials(texture);
  const innerCore = new THREE.Mesh(new THREE.BoxGeometry(INNER_SIZE, INNER_SIZE, INNER_SIZE), innerMaterials);
  innerCore.renderOrder = 1;

  const shellGeo = new RoundedBoxGeometry(OUTER_SIZE, OUTER_SIZE, OUTER_SIZE, 4, CHAMFER_RADIUS);
  const shellMaterial = createCrystalShellMaterial();
  const outerShell = new THREE.Mesh(shellGeo, shellMaterial);
  outerShell.renderOrder = 3;

  const edgeGlints = createEdgeGlints(outerShell);

  const group = new THREE.Group();
  group.add(innerCore);
  group.add(outerShell);
  group.add(edgeGlints);

  return {
    group,
    outerShell,
    shellMaterial,
    innerCore,
    innerMaterials,
    edgeGlints,
  };
}

export function applyJewelCubeTexture(cube: JewelCubeMesh, texture: THREE.Texture): void {
  for (const mat of cube.innerMaterials) {
    updateInnerPhotoMaterial(mat, texture);
  }
}

export function applyJewelCubeFx(
  cube: JewelCubeMesh,
  borderPulse: number,
  focusPulse: number,
  gemPulse: number,
  timeSec: number
): void {
  const pulse = Math.max(borderPulse, gemPulse, focusPulse * 0.85);
  pulseCrystalShellMaterial(cube.shellMaterial, pulse, timeSec);
  const glintMat = cube.edgeGlints.material as THREE.LineBasicMaterial;
  glintMat.opacity = 0.38 + pulse * 0.52 + Math.sin(timeSec * 7) * 0.06 * pulse;
}

export function applyJewelCubeAlpha(cube: JewelCubeMesh, alpha: number): void {
  const a = Math.max(0, Math.min(1, alpha));
  cube.shellMaterial.opacity = a;
  const glintMat = cube.edgeGlints.material as THREE.LineBasicMaterial;
  glintMat.opacity = glintMat.opacity * a;
  for (const mat of cube.innerMaterials) {
    mat.opacity = a;
    mat.transparent = a < 0.999;
  }
}

export function disposeJewelCubeMesh(cube: JewelCubeMesh): void {
  cube.innerCore.geometry.dispose();
  cube.outerShell.geometry.dispose();
  cube.edgeGlints.geometry.dispose();
  for (const mat of cube.innerMaterials) {
    mat.dispose();
  }
  cube.shellMaterial.dispose();
  (cube.edgeGlints.material as THREE.Material).dispose();
}

export type PhotoCubeMesh = JewelCubeMesh;
export const createPhotoCubeMesh = createJewelCubeMesh;
export const applyPhotoCubeTextures = applyJewelCubeTexture;
export const applyPhotoCubeFx = (
  cube: JewelCubeMesh,
  borderPulse: number,
  focusPulse: number,
  timeSec: number
) => applyJewelCubeFx(cube, borderPulse, focusPulse, borderPulse, timeSec);
export const applyPhotoCubeAlpha = applyJewelCubeAlpha;
export const disposePhotoCubeMesh = disposeJewelCubeMesh;
