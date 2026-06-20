import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { createChamferedCrystalShellMesh } from "./crystalShellMesh";
import { createHeartCrystalMesh } from "./heartCrystalMesh";
import { OUTER_SIZE } from "./jewelCubeMaterials";
import {
  GEM_PRISM_SHELL,
  HEX_PRISM_SHELL,
  SHELL_INNER_WALL_INSET,
  SPHERE_SHELL_RADIUS,
} from "./photoCrystalShapeGeometry";
import type { PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";
import { resolvePhotoCrystalShape } from "./photoCrystalShapeCatalog";

export function createPhotoCrystalShellMesh(
  scene: Scene,
  name: string,
  shapeId: PhotoCrystalShapeId
): Mesh {
  const shape = resolvePhotoCrystalShape(shapeId);

  // Real catalog meshes for key SKUs (not just scaling a cube).
  if (shapeId === "sphere") {
    const m = MeshBuilder.CreateIcoSphere(
      name,
      { radius: SPHERE_SHELL_RADIUS, subdivisions: 4, flat: true },
      scene
    );
    m.convertToFlatShadedMesh();
    m.scaling = new Vector3(shape.outerScale.x, shape.outerScale.y, shape.outerScale.z);
    m.refreshBoundingInfo();
    return m;
  }

  if (shapeId === "gem_prism") {
    const m = MeshBuilder.CreateCylinder(
      name,
      {
        height: GEM_PRISM_SHELL.height,
        diameterTop: GEM_PRISM_SHELL.diameterTop,
        diameterBottom: GEM_PRISM_SHELL.diameterBottom,
        tessellation: GEM_PRISM_SHELL.sides,
      },
      scene
    );
    m.convertToFlatShadedMesh();
    m.scaling = new Vector3(shape.outerScale.x, shape.outerScale.y, shape.outerScale.z);
    m.refreshBoundingInfo();
    return m;
  }

  if (shapeId === "heart") {
    const m = createHeartCrystalMesh(scene, name, OUTER_SIZE * 0.52);
    m.scaling = new Vector3(shape.outerScale.x, shape.outerScale.y, shape.outerScale.z);
    m.refreshBoundingInfo();
    return m;
  }

  if (shapeId === "hex_prism") {
    const m = MeshBuilder.CreateCylinder(
      name,
      {
        height: HEX_PRISM_SHELL.height,
        diameterTop: HEX_PRISM_SHELL.diameter,
        diameterBottom: HEX_PRISM_SHELL.diameter,
        tessellation: HEX_PRISM_SHELL.sides,
      },
      scene
    );
    m.convertToFlatShadedMesh();
    m.scaling = new Vector3(shape.outerScale.x, shape.outerScale.y, shape.outerScale.z);
    m.refreshBoundingInfo();
    return m;
  }

  // Default: use the brilliant-cut cube shell, then scale to match silhouette.
  const shell = createChamferedCrystalShellMesh(scene, name, OUTER_SIZE);
  shell.scaling = new Vector3(shape.outerScale.x, shape.outerScale.y, shape.outerScale.z);
  return shell;
}

export function createPhotoCrystalCollider(
  scene: Scene,
  name: string,
  shapeId: PhotoCrystalShapeId
): Mesh {
  const shape = resolvePhotoCrystalShape(shapeId);
  // Physics collider remains a box for stability; visual shell defines silhouette.
  return MeshBuilder.CreateBox(
    name,
    {
      width: OUTER_SIZE * shape.outerScale.x,
      height: OUTER_SIZE * shape.outerScale.y,
      depth: OUTER_SIZE * shape.outerScale.z,
    },
    scene
  );
}

/** Inward-facing inner shell — tight to outer wall (minimal visible gap). */
export function createCrystalShellInnerLayer(
  outer: Mesh,
  inset = SHELL_INNER_WALL_INSET
): Mesh {
  const inner = outer.clone(`${outer.name}-inner`, outer.parent);
  const sx = outer.scaling.x * inset;
  const sy = outer.scaling.y * inset;
  const sz = outer.scaling.z * inset;
  inner.scaling = new Vector3(sx, sy, sz);
  inner.flipFaces(true);
  inner.isPickable = false;
  inner.inheritVisibility = false;
  inner.renderingGroupId = outer.renderingGroupId;
  return inner;
}

/** Inner shell disabled — frosted inward clone was washing out photos on every shape. */
export function shapeUsesCrystalShellInnerLayer(
  _shapeId: PhotoCrystalShapeId,
  _photoLayout: "cube" | "portrait"
): boolean {
  return false;
}

/** Cavity wall inset — smaller = thicker visible inner wall (more depth). */
export function getCrystalShellInnerInset(_shapeId: PhotoCrystalShapeId): number {
  return 0.952;
}

/** Diamond-cut brilliant paperweight — unified across all catalog shapes. */
export function getConvexShellPhotoTuning(_shapeId: PhotoCrystalShapeId): {
  shellOpacityScale: number;
  alphaMax: number;
  glossBoost: number;
  shellAlpha: number;
  photoPowerMul: number;
  glowMul: number;
} {
  return {
    shellOpacityScale: 0.92,
    alphaMax: 0.78,
    glossBoost: 2.35,
    shellAlpha: 0.62,
    photoPowerMul: 1.95,
    glowMul: 0.72,
  };
}

