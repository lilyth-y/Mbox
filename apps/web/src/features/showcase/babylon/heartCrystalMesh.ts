import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Mesh as MeshType } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import {
  buildFacetedHeartGemVertexData,
  buildHeartTablePhotoVertexData,
  getHeartGemMetrics,
  type HeartGemMetrics,
} from "./heartGemGeometry";

export function createHeartCrystalMesh(scene: Scene, name: string, radius: number): MeshType {
  const metrics: HeartGemMetrics = {
    radius,
    halfDepth: radius * 0.4,
    tableRadius: radius * 0.74,
  };
  const data = buildFacetedHeartGemVertexData(metrics);
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.convertToFlatShadedMesh();
  mesh.refreshBoundingInfo();
  return mesh;
}

/** Front heart table — photo is clipped to this flat facet. */
export function createHeartTablePhotoMesh(
  scene: Scene,
  name: string,
  tableRadius: number,
  z = 0,
  faceBack = false
): MeshType {
  const data = buildHeartTablePhotoVertexData(tableRadius);
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.position.z = z;
  if (faceBack) {
    mesh.rotation.y = Math.PI;
  }
  mesh.renderingGroupId = 1;
  mesh.isPickable = false;
  mesh.inheritVisibility = false;
  mesh.refreshBoundingInfo();
  return mesh;
}

/** Front + back heart tables for dual-sided portrait. */
export function createHeartDualPhotoMeshes(
  scene: Scene,
  name: string,
  tableRadius: number,
  halfDepth: number
): MeshType[] {
  const inset = halfDepth * 0.96;
  const front = createHeartTablePhotoMesh(scene, `${name}-front`, tableRadius, inset, false);
  const back = createHeartTablePhotoMesh(scene, `${name}-back`, tableRadius, -inset, true);
  return [front, back];
}

export { getHeartGemMetrics };
