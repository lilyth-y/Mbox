import { DEPTH_GRID_SIZE } from "@mbox/shared";
import type { SubjectBounds } from "@mbox/shared";

export { DEPTH_GRID_SIZE };

interface Point {
  x: number;
  y: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function distanceToBounds(point: Point, bounds: SubjectBounds): number {
  const dx = point.x < bounds.x0 ? bounds.x0 - point.x : point.x > bounds.x1 ? point.x - bounds.x1 : 0;
  const dy = point.y < bounds.y0 ? bounds.y0 - point.y : point.y > bounds.y1 ? point.y - bounds.y1 : 0;
  return Math.hypot(dx, dy);
}

export function synthesizeDepthField(
  center: Point,
  bounds: SubjectBounds,
  gridSize = DEPTH_GRID_SIZE
): { gridSize: number; subjectDepth: number; values: number[] } {
  const values: number[] = [];
  let subjectDepth = 0.75;

  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const x = ((col + 0.5) / gridSize) * 100;
      const y = ((row + 0.5) / gridSize) * 100;
      const distance = distanceToBounds({ x, y }, bounds);
      const normalizedDistance = clamp01(distance / 50);
      const depth = clamp01(1 - normalizedDistance * 0.85);
      values.push(depth);

      if (Math.abs(x - center.x) < 100 / gridSize && Math.abs(y - center.y) < 100 / gridSize) {
        subjectDepth = depth;
      }
    }
  }

  return { gridSize, subjectDepth, values };
}
