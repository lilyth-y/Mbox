import * as THREE from "three";
import { CUBE_FACE_BG_Z, CUBE_FACE_PHOTO_Z, CUBE_FACE_UV_INSET } from "@mbox/shared";
import { CUBE_EDGE_LENGTH, getFaceRotation } from "./cubeSequence";

/** Matches `RoundedBoxGeometry` scale in presentationScene — photo faces must sit on this surface. */
export const CUBE_FRAME_MESH_SCALE = 1.04;
/** @deprecated Face centers use planeSize/2 — do not add outward bleed (causes face gaps). */
export const FRAMED_FACE_BLEED = 0;
/** Minimal local Z so photo clears shell depth buffer without visible float. */
export const FRAMED_FACE_PHOTO_Z_EXTRA = 0.022;
/** @deprecated Use `CUBE_EDGE_LENGTH * CUBE_FRAME_MESH_SCALE` for framed plane basis. */
export const FRAMED_FACE_SCALE = 1.02;

export interface CubeFaceLayoutMetrics {
  planeSize: number;
  faceHalf: number;
  uvInset: number;
  facePhotoZ: number;
  faceBgZ: number;
  borderVisible: boolean;
}

export type CubeFaceLayoutEntry = {
  position: THREE.Vector3Tuple;
  rotation: THREE.EulerTuple;
};

const CUBE_FACE_INDICES = [4, 5, 0, 1, 2, 3] as const;

function facePosition(faceIndex: number, faceHalf: number): THREE.Vector3Tuple {
  switch (faceIndex) {
    case 4:
      return [0, 0, faceHalf];
    case 5:
      return [0, 0, -faceHalf];
    case 0:
      return [faceHalf, 0, 0];
    case 1:
      return [-faceHalf, 0, 0];
    case 2:
      return [0, faceHalf, 0];
    case 3:
      return [0, -faceHalf, 0];
    default:
      return [0, 0, faceHalf];
  }
}

/** Mount poses aligned with `getFaceRotation` (fanMotion.js / cubeSequence). */
export function buildCubeFaceLayouts(faceHalf: number): Record<number, CubeFaceLayoutEntry> {
  const layouts: Record<number, CubeFaceLayoutEntry> = {};
  for (const faceIndex of CUBE_FACE_INDICES) {
    const rot = getFaceRotation(faceIndex);
    layouts[faceIndex] = {
      position: facePosition(faceIndex, faceHalf),
      rotation: [rot.x, rot.y, rot.z],
    };
  }
  return layouts;
}

export function resolveCubeFaceLayoutMetrics(borderVisible: boolean): CubeFaceLayoutMetrics {
  const halfEdge = CUBE_EDGE_LENGTH / 2;
  if (borderVisible) {
    const planeSize = CUBE_EDGE_LENGTH * CUBE_FRAME_MESH_SCALE;
    const innerHalf = CUBE_EDGE_LENGTH / 2;
    return {
      /** Match RoundedBox shell face — photo plane must cover the full opening. */
      planeSize,
      /** Inner cube face — shell wraps outside; outer faceHalf swallowed photos (tunnel). */
      faceHalf: innerHalf,
      /** 3D shell draws the outer frame; shader uses thin mat only (uShellFrameMode). */
      uvInset: 0,
      facePhotoZ: CUBE_FACE_PHOTO_Z + FRAMED_FACE_PHOTO_Z_EXTRA,
      faceBgZ: CUBE_FACE_BG_Z,
      borderVisible: true,
    };
  }
  return {
    /** Exact cube face — no geometric bleed past neighbors. */
    planeSize: CUBE_EDGE_LENGTH,
    faceHalf: halfEdge,
    uvInset: CUBE_FACE_UV_INSET,
    facePhotoZ: CUBE_FACE_PHOTO_Z,
    faceBgZ: CUBE_FACE_BG_Z,
    borderVisible: false,
  };
}

export function setMaterialFaceUvInset(material: THREE.Material, inset: number): void {
  if (!(material instanceof THREE.ShaderMaterial) || !material.uniforms?.uFaceUvInset) {
    return;
  }
  material.uniforms.uFaceUvInset.value = inset;
}

export function applyFaceUvInsetToMesh(mesh: THREE.Mesh, inset: number): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => setMaterialFaceUvInset(material, inset));
}

export function setMaterialShellFrameMode(material: THREE.Material, borderVisible: boolean): void {
  if (!(material instanceof THREE.ShaderMaterial) || !material.uniforms?.uShellFrameMode) {
    return;
  }
  material.uniforms.uShellFrameMode.value = borderVisible ? 1 : 0;
}

export function applyShellFrameModeToMesh(mesh: THREE.Mesh, borderVisible: boolean): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => setMaterialShellFrameMode(material, borderVisible));
}
