import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

/** Chamfer ratio — legacy rounded box (Three showcase). */
export const CRYSTAL_CHAMFER_RATIO = 0.049;

/** Brilliant-cut defaults — keep in sync with `photoCrystalShapeGeometry`. */
export const BRILLIANT_CUT_FACE_INSET_RATIO = 0.084;
export const BRILLIANT_CUT_FACET_RISE_RATIO = 0.112;
export const BRILLIANT_CUT_CORNER_CUT_RATIO = 0.145;

/** Full flat-table span on one face (matches shell mesh `fs * 2`). */
export function getBrilliantCutFlatSpan(
  outerSize: number,
  faceInsetRatio = BRILLIANT_CUT_FACE_INSET_RATIO
): number {
  const w = outerSize / 2;
  return 2 * (w - outerSize * faceInsetRatio);
}

export function getBrilliantCutFlatHalfSpan(
  outerSize: number,
  faceInsetRatio = BRILLIANT_CUT_FACE_INSET_RATIO
): number {
  return getBrilliantCutFlatSpan(outerSize, faceInsetRatio) * 0.5;
}

interface FaceFrame {
  normal: Vector3;
  tangentU: Vector3;
  tangentV: Vector3;
}

const FACE_FRAMES: FaceFrame[] = [
  { normal: new Vector3(0, 0, 1), tangentU: new Vector3(1, 0, 0), tangentV: new Vector3(0, 1, 0) },
  { normal: new Vector3(0, 0, -1), tangentU: new Vector3(-1, 0, 0), tangentV: new Vector3(0, 1, 0) },
  { normal: new Vector3(1, 0, 0), tangentU: new Vector3(0, 0, -1), tangentV: new Vector3(0, 1, 0) },
  { normal: new Vector3(-1, 0, 0), tangentU: new Vector3(0, 0, 1), tangentV: new Vector3(0, 1, 0) },
  { normal: new Vector3(0, 1, 0), tangentU: new Vector3(1, 0, 0), tangentV: new Vector3(0, 0, -1) },
  { normal: new Vector3(0, -1, 0), tangentU: new Vector3(1, 0, 0), tangentV: new Vector3(0, 0, 1) },
];

function pushTri(
  positions: number[],
  indices: number[],
  a: Vector3,
  b: Vector3,
  c: Vector3
): void {
  const base = positions.length / 3;
  for (const v of [a, b, c]) {
    positions.push(v.x, v.y, v.z);
  }
  indices.push(base, base + 1, base + 2);
}

function pushFace(
  positions: number[],
  indices: number[],
  a: Vector3,
  b: Vector3,
  c: Vector3,
  d: Vector3
): void {
  pushTri(positions, indices, a, b, c);
  pushTri(positions, indices, a, c, d);
}

/**
 * Brilliant-cut cube shell — pyramid facets per face + corner truncations.
 * Matches diamond paperweight reference (sharp glints, nested depth).
 */
export function buildBrilliantCutCubeVertexData(
  size: number,
  options?: {
    facetRiseRatio?: number;
    faceInsetRatio?: number;
    cornerCutRatio?: number;
  }
): VertexData {
  const w = size / 2;
  const facetRise = size * (options?.facetRiseRatio ?? BRILLIANT_CUT_FACET_RISE_RATIO);
  const faceInset = size * (options?.faceInsetRatio ?? BRILLIANT_CUT_FACE_INSET_RATIO);
  const fs = w - faceInset;

  const positions: number[] = [];
  const indices: number[] = [];

  for (const face of FACE_FRAMES) {
    const { normal, tangentU: u, tangentV: v } = face;
    const planeCenter = normal.scale(w);
    const apex = planeCenter.add(normal.scale(facetRise));

    const c0 = planeCenter.add(u.scale(fs)).add(v.scale(fs));
    const c1 = planeCenter.subtract(u.scale(fs)).add(v.scale(fs));
    const c2 = planeCenter.subtract(u.scale(fs)).subtract(v.scale(fs));
    const c3 = planeCenter.add(u.scale(fs)).subtract(v.scale(fs));

    const m01 = planeCenter.add(v.scale(fs));
    const m12 = planeCenter.subtract(u.scale(fs));
    const m23 = planeCenter.subtract(v.scale(fs));
    const m30 = planeCenter.add(u.scale(fs));

    pushTri(positions, indices, apex, c0, m01);
    pushTri(positions, indices, apex, m01, c1);
    pushTri(positions, indices, apex, c1, m12);
    pushTri(positions, indices, apex, m12, c2);
    pushTri(positions, indices, apex, c2, m23);
    pushTri(positions, indices, apex, m23, c3);
    pushTri(positions, indices, apex, c3, m30);
    pushTri(positions, indices, apex, m30, c0);
  }

  const cornerSigns: [number, number, number][] = [
    [1, 1, 1],
    [-1, 1, 1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, -1],
    [1, -1, -1],
  ];

  for (const [sx, sy, sz] of cornerSigns) {
    const v1 = new Vector3(sx * fs, sy * w, sz * fs);
    const v2 = new Vector3(sx * fs, sy * fs, sz * w);
    const v3 = new Vector3(sx * w, sy * fs, sz * fs);
    pushTri(positions, indices, v1, v2, v3);
  }

  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  return data;
}

/** Legacy chamfered box — kept for tests / fallback. */
export function buildChamferedBoxVertexData(
  size: number,
  chamfer = size * CRYSTAL_CHAMFER_RATIO
): VertexData {
  const w = size / 2;
  const c = Math.min(chamfer, w * 0.42);
  const positions: number[] = [];
  const indices: number[] = [];
  const p = (x: number, y: number, z: number) => new Vector3(x, y, z);

  pushFace(
    positions,
    indices,
    p(w - c, w - c, w),
    p(w - c, -(w - c), w),
    p(-(w - c), -(w - c), w),
    p(-(w - c), w - c, w)
  );
  pushFace(
    positions,
    indices,
    p(-(w - c), w - c, -w),
    p(-(w - c), -(w - c), -w),
    p(w - c, -(w - c), -w),
    p(w - c, w - c, -w)
  );
  pushFace(
    positions,
    indices,
    p(w, w - c, w - c),
    p(w, -(w - c), w - c),
    p(w, -(w - c), -(w - c)),
    p(w, w - c, -(w - c))
  );
  pushFace(
    positions,
    indices,
    p(-w, w - c, -(w - c)),
    p(-w, -(w - c), -(w - c)),
    p(-w, -(w - c), w - c),
    p(-w, w - c, w - c)
  );
  pushFace(
    positions,
    indices,
    p(-(w - c), w, w - c),
    p(-(w - c), w, -(w - c)),
    p(w - c, w, -(w - c)),
    p(w - c, w, w - c)
  );
  pushFace(
    positions,
    indices,
    p(-(w - c), -w, -(w - c)),
    p(-(w - c), -w, w - c),
    p(w - c, -w, w - c),
    p(w - c, -w, -(w - c))
  );

  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  data.normals = normals;
  return data;
}

export function createBrilliantCutCrystalShellMesh(
  scene: Scene,
  name: string,
  size: number
): Mesh {
  const mesh = new Mesh(name, scene);
  buildBrilliantCutCubeVertexData(size).applyToMesh(mesh);
  mesh.convertToFlatShadedMesh();
  mesh.isPickable = false;
  return mesh;
}

export function createChamferedCrystalShellMesh(
  scene: Scene,
  name: string,
  size: number
): Mesh {
  return createBrilliantCutCrystalShellMesh(scene, name, size);
}
