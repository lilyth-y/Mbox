/** Face mount poses — aligned with main cube `cubeFaceLayout` / `getFaceRotation`. */
export const JEWEL_CUBE_FACE_INDICES = [4, 5, 0, 1, 2, 3] as const;

export type JewelCubeFaceLayoutEntry = {
  position: [number, number, number];
  rotation: [number, number, number];
};

const FACE_ROTATIONS: Record<number, [number, number, number]> = {
  4: [0, 0, 0],
  5: [0, Math.PI, 0],
  0: [0, -Math.PI / 2, 0],
  1: [0, Math.PI / 2, 0],
  2: [-Math.PI / 2, 0, 0],
  3: [Math.PI / 2, 0, 0],
};

function facePosition(faceIndex: number, faceHalf: number): [number, number, number] {
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

export function buildJewelCubeFaceLayouts(faceHalf: number): Record<number, JewelCubeFaceLayoutEntry> {
  const layouts: Record<number, JewelCubeFaceLayoutEntry> = {};
  for (const faceIndex of JEWEL_CUBE_FACE_INDICES) {
    layouts[faceIndex] = {
      position: facePosition(faceIndex, faceHalf),
      rotation: FACE_ROTATIONS[faceIndex] ?? [0, 0, 0],
    };
  }
  return layouts;
}
