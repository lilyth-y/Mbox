import type { ProcessedImage } from "../types";

function sortByUploadSequence(images: ProcessedImage[]): ProcessedImage[] {
  return [...images].sort((left, right) => {
    const leftOrder = left.sequenceOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.sequenceOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.id - right.id;
  });
}

function normalizeLabel(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[\s,./|·]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function labelContinuityCost(left: ProcessedImage, right: ProcessedImage): number {
  const leftTokens = new Set(normalizeLabel(left.label));
  const rightTokens = normalizeLabel(right.label);
  if (leftTokens.size === 0 || rightTokens.length === 0) {
    return 1.2;
  }
  const overlap = rightTokens.filter((token) => leftTokens.has(token)).length;
  return 2.2 - overlap * 0.85;
}

function boundsCenter(bounds: ProcessedImage["subject"]["bounds"]): { x: number; y: number } {
  return {
    x: (bounds.x0 + bounds.x1) / 2,
    y: (bounds.y0 + bounds.y1) / 2,
  };
}

function sceneDistance(left: ProcessedImage, right: ProcessedImage): number {
  const leftCategory = left.userCategory ?? left.aiSuggestedCategory;
  const rightCategory = right.userCategory ?? right.aiSuggestedCategory;
  let cost = leftCategory === rightCategory ? 0 : 2.4;

  const centerDistance = Math.hypot(left.center.x - right.center.x, left.center.y - right.center.y);
  cost += centerDistance / 38;

  const leftBounds = boundsCenter(left.subject.bounds);
  const rightBounds = boundsCenter(right.subject.bounds);
  cost += Math.hypot(leftBounds.x - rightBounds.x, leftBounds.y - rightBounds.y) / 42;

  cost +=
    Math.abs((left.depth?.subjectDepth ?? 0.5) - (right.depth?.subjectDepth ?? 0.5)) * 1.6;
  cost +=
    Math.abs((left.focus?.aestheticScore ?? 0.5) - (right.focus?.aestheticScore ?? 0.5)) * 0.9;

  const leftCentered = left.focus?.centering ?? "centered";
  const rightCentered = right.focus?.centering ?? "centered";
  if (leftCentered !== rightCentered) {
    cost += 0.45;
  }

  cost += labelContinuityCost(left, right);
  return cost;
}

/**
 * Reorder processed images so adjacent scenes feel like one continuous story:
 * similar category, composition, subject placement, and labels stay together.
 */
export function orderImagesForSceneContinuity(images: ProcessedImage[]): ProcessedImage[] {
  if (images.length <= 2) {
    return sortByUploadSequence(images);
  }

  const seedOrder = sortByUploadSequence(images);
  const remaining = [...seedOrder];
  const path: ProcessedImage[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const current = path[path.length - 1]!;
    let bestIndex = 0;
    let bestCost = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const cost = sceneDistance(current, remaining[index]!);
      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = index;
      }
    }

    path.push(remaining.splice(bestIndex, 1)[0]!);
  }

  return path;
}
