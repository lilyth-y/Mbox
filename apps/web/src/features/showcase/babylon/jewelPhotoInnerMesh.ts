import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { CUBE_FACE_BG_Z, CUBE_FACE_PHOTO_Z } from "@mbox/shared";
import { buildJewelCubeFaceLayouts, JEWEL_CUBE_FACE_INDICES } from "./jewelCubeFaceLayout";
import { INNER_SIZE, OUTER_SIZE } from "./jewelCubeMaterials";
import type { PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";
import { resolvePhotoCrystalShape } from "./photoCrystalShapeCatalog";
import { computePhotoCrystalPortraitLayout } from "./photoCrystalPortraitLayout";
import {
  getShapeInnerVolumeBounds,
  SPHERE_SHELL_RADIUS,
  SHELL_INNER_WALL_INSET,
} from "./photoCrystalShapeGeometry";
import { createHeartTablePhotoMesh, getHeartGemMetrics } from "./heartCrystalMesh";
import { getPhotoCrystalPhotoProfile } from "./photoCrystalPhotoProfile";
import { getBrilliantCutFlatSpan } from "./crystalShellMesh";
import { SHELL_FLAT_CAVITY_RATIO } from "./photoCrystalShapeGeometry";

/** Weld margin — slight overlap so inner photo cube meets brilliant-cut flats without gaps. */
export const CUBE_PHOTO_FACE_SEAM_OVERLAP = 1.008;

export type InnerPhotoMeshPose = {
  size: number;
  position: Vector3;
  slabDepth: number;
};

/** Face mount depth — slightly inside brilliant-cut flat toward cavity center. */
const CUBE_PHOTO_FACE_DEPTH_MUL = 0.965;

export function getCubePhotoCavityMetrics(shapeId: PhotoCrystalShapeId): {
  edgeSize: number;
  faceHalf: number;
} {
  const shape = resolvePhotoCrystalShape(shapeId);
  const outerSpan =
    OUTER_SIZE * Math.min(shape.outerScale.x, shape.outerScale.y, shape.outerScale.z);
  const flatSpan = getBrilliantCutFlatSpan(outerSpan);
  const flatHalf = flatSpan * 0.5;
  const faceHalf = flatHalf * CUBE_PHOTO_FACE_DEPTH_MUL;
  const edgeSize = 2 * faceHalf * CUBE_PHOTO_FACE_SEAM_OVERLAP;
  return { edgeSize, faceHalf };
}

export function getInnerCubePhotoSize(shapeId: PhotoCrystalShapeId = "cube"): number {
  return getCubePhotoCavityMetrics(shapeId).edgeSize;
}

export function computeInnerPhotoMeshPose(
  shapeId: PhotoCrystalShapeId,
  layout: "cube" | "portrait",
  kind: "background" | "foreground",
  depthBias = 0
): InnerPhotoMeshPose {
  const faceZScale = OUTER_SIZE / 3.2;
  const fgBias =
    (kind === "foreground" ? CUBE_FACE_PHOTO_Z - CUBE_FACE_BG_Z : 0) * faceZScale + depthBias;

  if (layout === "cube") {
    const nested = computeNestedCubePose(shapeId);
    const size = nested.size * (kind === "foreground" ? 1.002 : 1);
    return {
      size,
      position: nested.position.clone(),
      slabDepth: size,
    };
  }

  const portraitLayout = computePhotoCrystalPortraitLayout(shapeId);
  return {
    size: Math.max(portraitLayout.width, portraitLayout.height),
    position: new Vector3(
      portraitLayout.position.x,
      portraitLayout.position.y,
      portraitLayout.position.z + fgBias
    ),
    slabDepth: INNER_SIZE * 0.014,
  };
}

export function getPortraitSlabDimensions(shapeId: PhotoCrystalShapeId): {
  width: number;
  height: number;
} {
  const layout = computePhotoCrystalPortraitLayout(shapeId);
  return { width: layout.width, height: layout.height };
}

function computeNestedCubePose(shapeId: PhotoCrystalShapeId): { size: number; position: Vector3 } {
  const { edgeSize } = getCubePhotoCavityMetrics(shapeId);
  return {
    size: edgeSize,
    position: Vector3.Zero(),
  };
}

/** Six face planes — aligned with main cube `cubeFaceLayout` / `getFaceRotation`. */
export function createInnerPhotoCubeFaceMeshes(
  scene: Scene,
  name: string,
  edgeSize: number,
  parent?: TransformNode,
  localDepthBias = 0,
  layoutFaceHalf?: number
): Mesh[] {
  const faceHalf = layoutFaceHalf ?? edgeSize * 0.5;
  const layouts = buildJewelCubeFaceLayouts(faceHalf);  const faces: Mesh[] = [];

  for (const faceIndex of JEWEL_CUBE_FACE_INDICES) {
    const layout = layouts[faceIndex]!;
    const group = new TransformNode(`${name}-face-group-${faceIndex}`, scene);
    if (parent) {
      group.parent = parent;
    }

    group.position.set(layout.position[0], layout.position[1], layout.position[2]);
    group.rotationQuaternion = Quaternion.FromEulerAngles(
      layout.rotation[0],
      layout.rotation[1],
      layout.rotation[2]
    );

    const outward = group.position.clone();
    if (outward.lengthSquared() > 1e-8) {
      outward.normalize();
    } else {
      outward.set(0, 0, 1);
    }

    const face = createInnerPhotoPortraitPlaneMesh(
      scene,
      `${name}-face-${faceIndex}`,
      edgeSize,
      edgeSize
    );
    face.parent = group;
    face.position.z = localDepthBias;

    const worldNormal = new Vector3(0, 0, 1).applyRotationQuaternion(group.rotationQuaternion!);
    if (Vector3.Dot(worldNormal, outward) < 0) {
      face.flipFaces(true);
    }

    faces.push(face);
  }

  return faces;
}

/** Thin framed slab — portrait plate with slight depth (sphere frame). */
export function createInnerPhotoFramedSlabMesh(
  scene: Scene,
  name: string,
  width: number,
  height: number,
  depth: number
): Mesh {
  const mesh = MeshBuilder.CreateBox(
    name,
    { width, height, depth, updatable: false },
    scene
  );
  mesh.renderingGroupId = 1;
  mesh.isPickable = false;
  mesh.inheritVisibility = false;
  mesh.visibility = 1;
  mesh.isVisible = true;
  return mesh;
}

/** Solid inner cube — per-face UV on one mesh (no face-plane seams). */
export function createInnerPhotoCubeMesh(scene: Scene, name: string, edgeSize: number): Mesh {
  const mesh = MeshBuilder.CreateBox(
    name,
    { width: edgeSize, height: edgeSize, depth: edgeSize, updatable: false },
    scene
  );
  mesh.renderingGroupId = 1;
  mesh.isPickable = false;
  mesh.inheritVisibility = false;
  mesh.visibility = 1;
  mesh.isVisible = true;
  return mesh;
}

/** Heart-table portrait — flat front/back facets, photo clipped to heart silhouette. */
export function createInnerPhotoHeartTableMesh(
  scene: Scene,
  name: string,
  tableRadius: number
): Mesh {
  return createHeartTablePhotoMesh(scene, name, tableRadius);
}

/** Front + back heart tables — photo visible on both sides while spinning. */
export function createInnerPhotoHeartTableMeshes(
  scene: Scene,
  name: string,
  tableRadius: number,
  shapeId?: PhotoCrystalShapeId
): Mesh[] {
  const shape = resolvePhotoCrystalShape(shapeId ?? "heart");
  const metrics = getHeartGemMetrics();
  const halfDepth = metrics.halfDepth * shape.outerScale.z;
  const front = createHeartTablePhotoMesh(scene, `${name}-front`, tableRadius, halfDepth * 0.78, false);
  const back = createHeartTablePhotoMesh(scene, `${name}-back`, tableRadius, -halfDepth * 0.78, true);
  return [front, back];
}

/** @deprecated use createInnerPhotoHeartTableMeshes */
export function createInnerPhotoHeartDualMeshes(
  scene: Scene,
  name: string,
  tableRadius: number,
  shapeId?: PhotoCrystalShapeId
): Mesh[] {
  return createInnerPhotoHeartTableMeshes(scene, name, tableRadius, shapeId);
}

export function getHeartTablePhotoRadius(shapeId?: PhotoCrystalShapeId): number {
  const profile = getPhotoCrystalPhotoProfile(shapeId ?? "heart");
  const shape = resolvePhotoCrystalShape(shapeId ?? "heart");
  return (
    getHeartGemMetrics().tableRadius *
    SHELL_FLAT_CAVITY_RATIO *
    profile.surfaceInset *
    shape.outerScale.x
  );
}

/** Front-facing portrait plane (+Z) for laser-etched portrait layout. */
export function createInnerPhotoPortraitPlaneMesh(
  scene: Scene,
  name: string,
  width: number,
  height: number
): Mesh {
  const mesh = MeshBuilder.CreatePlane(
    name,
    { width, height, sideOrientation: Mesh.FRONTSIDE },
    scene
  );
  mesh.renderingGroupId = 1;
  mesh.isPickable = false;
  mesh.inheritVisibility = false;
  mesh.visibility = 1;
  mesh.isVisible = true;
  return mesh;
}

/** Sphere cavity — circular disc diameter + Z separation for dual-sided portrait. */
export function getSphereInnerPhotoDiscMetrics(shapeId: PhotoCrystalShapeId = "sphere"): {
  diameter: number;
  zInset: number;
} {
  const shape = resolvePhotoCrystalShape(shapeId);
  const profile = getPhotoCrystalPhotoProfile(shapeId);
  const layout = computePhotoCrystalPortraitLayout(shapeId);
  const inner = getShapeInnerVolumeBounds(shapeId);
  const shellR =
    SPHERE_SHELL_RADIUS *
    Math.max(shape.outerScale.x, shape.outerScale.y, shape.outerScale.z) *
    SHELL_INNER_WALL_INSET;
  const plateSize = Math.max(layout.width, layout.height);
  const zInset = Math.max(shellR * 0.11, INNER_SIZE * 0.012);
  const maxDisc = inner.maxWidth * profile.surfaceInset * 0.98;
  return {
    diameter: Math.min(plateSize, maxDisc),
    zInset,
  };
}

/** Front-facing disc (+Z) — circular portrait plate for sphere cavity. */
export function createInnerPhotoDiscMesh(
  scene: Scene,
  name: string,
  diameter: number,
  tessellation = 64
): Mesh {
  const mesh = MeshBuilder.CreateDisc(
    name,
    { radius: diameter * 0.5, tessellation, sideOrientation: Mesh.FRONTSIDE },
    scene
  );
  mesh.renderingGroupId = 1;
  mesh.isPickable = false;
  mesh.inheritVisibility = false;
  mesh.visibility = 1;
  mesh.isVisible = true;
  return mesh;
}

/** Front + back circular discs — framed portrait visible through both sides of a sphere. */
export function createInnerPhotoSphereDualDiscMeshes(
  scene: Scene,
  name: string,
  diameter: number,
  zInset: number
): Mesh[] {
  const inset = Math.max(zInset, INNER_SIZE * 0.008);
  const front = createInnerPhotoDiscMesh(scene, `${name}-front`, diameter);
  front.position.z = inset;
  const back = createInnerPhotoDiscMesh(scene, `${name}-back`, diameter);
  back.position.z = -inset;
  back.rotation.y = Math.PI;
  return [front, back];
}

/** Front + back portrait plates — same photo visible through both sides of the crystal. */
export function createInnerPhotoPortraitDualPlateMeshes(
  scene: Scene,
  name: string,
  width: number,
  height: number,
  zInset: number
): Mesh[] {
  const inset = Math.max(zInset, INNER_SIZE * 0.008);
  const front = createInnerPhotoPortraitPlaneMesh(scene, `${name}-front`, width, height);
  front.position.z = inset;
  const back = createInnerPhotoPortraitPlaneMesh(scene, `${name}-back`, width, height);
  back.position.z = -inset;
  back.rotation.y = Math.PI;
  return [front, back];
}
