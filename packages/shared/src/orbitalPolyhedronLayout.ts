import type { OrbitalShapeId } from "./presentationMicroModules.js";

export interface OrbitalFaceLayout {
  position: [number, number, number];
  rotation: [number, number, number];
}

const OCTAHEDRON_RADIUS = 1.35;

/** Eight triangular faces — photo planes sit on each face normal. */
export const ORBITAL_OCTAHEDRON_FACES: OrbitalFaceLayout[] = [
  { position: [0, OCTAHEDRON_RADIUS * 0.58, OCTAHEDRON_RADIUS * 0.58], rotation: [-Math.PI / 4, 0, 0] },
  { position: [0, OCTAHEDRON_RADIUS * 0.58, -OCTAHEDRON_RADIUS * 0.58], rotation: [Math.PI / 4, Math.PI, 0] },
  { position: [OCTAHEDRON_RADIUS * 0.58, OCTAHEDRON_RADIUS * 0.58, 0], rotation: [-Math.PI / 4, Math.PI / 2, 0] },
  { position: [-OCTAHEDRON_RADIUS * 0.58, OCTAHEDRON_RADIUS * 0.58, 0], rotation: [-Math.PI / 4, -Math.PI / 2, 0] },
  { position: [OCTAHEDRON_RADIUS * 0.58, -OCTAHEDRON_RADIUS * 0.58, 0], rotation: [Math.PI / 4, Math.PI / 2, 0] },
  { position: [-OCTAHEDRON_RADIUS * 0.58, -OCTAHEDRON_RADIUS * 0.58, 0], rotation: [Math.PI / 4, -Math.PI / 2, 0] },
  { position: [0, -OCTAHEDRON_RADIUS * 0.58, OCTAHEDRON_RADIUS * 0.58], rotation: [Math.PI / 4, 0, 0] },
  { position: [0, -OCTAHEDRON_RADIUS * 0.58, -OCTAHEDRON_RADIUS * 0.58], rotation: [-Math.PI / 4, Math.PI, 0] },
];

/** Subset of icosahedron — 12 faces for larger galleries (uses first 12 of 20). */
export const ORBITAL_ICOSAHEDRON_FACE_COUNT = 12;

const ICO_R = 1.28;
const phi = (1 + Math.sqrt(5)) / 2;

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z) || 1;
  return [(x / len) * ICO_R, (y / len) * ICO_R, (z / len) * ICO_R];
}

/** Approximate face centers from icosahedron vertices (12 evenly spaced directions). */
export const ORBITAL_ICOSAHEDRON_FACES: OrbitalFaceLayout[] = [
  [1, phi, 0],
  [-1, phi, 0],
  [1, -phi, 0],
  [-1, -phi, 0],
  [0, 1, phi],
  [0, -1, phi],
  [0, 1, -phi],
  [0, -1, -phi],
  [phi, 0, 1],
  [-phi, 0, 1],
  [phi, 0, -1],
  [-phi, 0, -1],
].map(([x, y, z]) => {
  const pos = normalize3(x!, y!, z!);
  const yaw = Math.atan2(pos[0], pos[2]);
  const pitch = Math.asin(Math.min(1, Math.max(-1, pos[1] / ICO_R)));
  return {
    position: pos,
    rotation: [-pitch, yaw, 0] as [number, number, number],
  };
});

export function getOrbitalFaceLayouts(shapeId: OrbitalShapeId): OrbitalFaceLayout[] {
  return shapeId === "icosahedron" ? ORBITAL_ICOSAHEDRON_FACES : ORBITAL_OCTAHEDRON_FACES;
}

export function getOrbitalFaceCount(shapeId: OrbitalShapeId): number {
  return shapeId === "icosahedron" ? ORBITAL_ICOSAHEDRON_FACE_COUNT : ORBITAL_OCTAHEDRON_FACES.length;
}
