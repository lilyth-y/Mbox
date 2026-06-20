import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { OUTER_SIZE } from "./jewelCubeMaterials";

export const HEART_GEM_RADIUS_FACTOR = 0.52;
export const HEART_GEM_HALF_DEPTH_RATIO = 0.4;
export const HEART_GEM_TABLE_SCALE = 0.74;
export const HEART_GEM_SEGMENTS = 48;

export type HeartGemMetrics = {
  radius: number;
  halfDepth: number;
  tableRadius: number;
};

export function getHeartGemMetrics(outerSize = OUTER_SIZE): HeartGemMetrics {
  const radius = outerSize * HEART_GEM_RADIUS_FACTOR;
  return {
    radius,
    halfDepth: radius * HEART_GEM_HALF_DEPTH_RATIO,
    tableRadius: radius * HEART_GEM_TABLE_SCALE,
  };
}

/** Parametric heart curve (classic), angle t ∈ [0, 2π). */
export function heartPoint2D(t: number, scale: number): { x: number; y: number } {
  const hx = 16 * Math.pow(Math.sin(t), 3);
  const hy =
    13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return { x: (hx / 16) * scale, y: (hy / 16) * scale };
}

export function sampleHeartRing(
  segments: number,
  scale: number,
  z: number
): Vector3[] {
  const ring: Vector3[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const p = heartPoint2D(t, scale);
    ring.push(new Vector3(p.x, p.y, z));
  }
  return ring;
}

function triNormal(a: Vector3, b: Vector3, c: Vector3): Vector3 {
  const ax = b.x - a.x;
  const ay = b.y - a.y;
  const az = b.z - a.z;
  const bx = c.x - a.x;
  const by = c.y - a.y;
  const bz = c.z - a.z;
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return new Vector3(nx / len, ny / len, nz / len);
}

function pushTri(
  positions: number[],
  normals: number[],
  indices: number[],
  a: Vector3,
  b: Vector3,
  c: Vector3
): void {
  const base = positions.length / 3;
  const n = triNormal(a, b, c);
  for (const v of [a, b, c]) {
    positions.push(v.x, v.y, v.z);
    normals.push(n.x, n.y, n.z);
  }
  indices.push(base, base + 1, base + 2);
}

function pushQuad(
  positions: number[],
  normals: number[],
  indices: number[],
  a: Vector3,
  b: Vector3,
  c: Vector3,
  d: Vector3
): void {
  pushTri(positions, normals, indices, a, b, c);
  pushTri(positions, normals, indices, a, c, d);
}

export type HeartTableBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerY: number;
};

export function computeHeartTableBounds(tableRadius: number): HeartTableBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const samples = 72;
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const p = heartPoint2D(t, tableRadius);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerY: (minY + maxY) * 0.5,
  };
}

/** Flat heart table with UVs mapped to the heart bounding box (photo fills & clips to mesh). */
export function buildHeartTablePhotoVertexData(tableRadius: number, segments = HEART_GEM_SEGMENTS): VertexData {
  const ring = sampleHeartRing(segments, tableRadius, 0);
  const bounds = computeHeartTableBounds(tableRadius);
  // Fan from bottom culet — a mid-body center creates a visible vertical seam.
  const culet = new Vector3(0, bounds.minY, 0);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const addVertex = (v: Vector3) => {
    positions.push(v.x, v.y, v.z);
    normals.push(0, 0, 1);
    const u = (v.x - bounds.minX) / Math.max(bounds.width, 1e-5);
    const vCoord = (v.y - bounds.minY) / Math.max(bounds.height, 1e-5);
    uvs.push(u, vCoord);
  };

  const base = 0;
  addVertex(culet);
  for (const p of ring) {
    addVertex(p);
  }
  for (let i = 0; i < segments; i++) {
    indices.push(base, base + 1 + i, base + 1 + ((i + 1) % segments));
  }

  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.indices = indices;
  return data;
}

/**
 * Faceted gem heart — flat tables on front and back, girdle bezel (viewable both sides).
 */
export function buildFacetedHeartGemVertexData(metrics: HeartGemMetrics): VertexData {
  const { radius, halfDepth, tableRadius } = metrics;
  const segments = HEART_GEM_SEGMENTS;
  const frontTableZ = halfDepth;
  const backTableZ = -halfDepth;
  const girdleZ = 0;

  const frontTable = sampleHeartRing(segments, tableRadius, frontTableZ);
  const backTable = sampleHeartRing(segments, tableRadius, backTableZ);
  const girdle = sampleHeartRing(segments, radius, girdleZ);

  const tableBounds = computeHeartTableBounds(tableRadius);
  const frontApex = new Vector3(0, tableBounds.minY, frontTableZ);
  const backApex = new Vector3(0, tableBounds.minY, backTableZ);

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < segments; i++) {
    pushTri(positions, normals, indices, frontApex, frontTable[i]!, frontTable[(i + 1) % segments]!);
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    pushQuad(
      positions,
      normals,
      indices,
      frontTable[i]!,
      frontTable[next]!,
      girdle[next]!,
      girdle[i]!
    );
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    pushQuad(
      positions,
      normals,
      indices,
      girdle[i]!,
      girdle[next]!,
      backTable[next]!,
      backTable[i]!
    );
  }

  for (let i = 0; i < segments; i++) {
    pushTri(positions, normals, indices, backApex, backTable[(i + 1) % segments]!, backTable[i]!);
  }

  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  return data;
}
