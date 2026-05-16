import { IMAGE_CATEGORY_OPTIONS } from "@mbox/shared";

export const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL?.trim() || "gemini-2.5-flash";
export const EDIT_MODEL = "gemini-2.5-flash-image";

export function buildAnalysisPrompt(focusTarget?: string): string {
  const targetInstruction = focusTarget?.trim()
    ? `The user wants the focus target to be "${focusTarget.trim()}". Prioritize that subject for label, center, bounds, and depth. If it is missing, set subject.detected to false and explain in focus.compositionNotes.`
    : "If no focus target is provided, choose the most salient person or subject in the image.";

  return [
    "Analyze the image for crop center and light parallax. Return compact JSON only.",
    targetInstruction,
    "Required JSON shape:",
    "{",
    "  'label': 'short subject label',",
    "  'center': { 'x': number, 'y': number },",
    "  'focus': {",
    "    'onPrimarySubject': boolean,",
    "    'centering': 'centered' | 'rule_of_thirds' | 'offset' | 'edge_weighted',",
    "    'aestheticScore': number,",
    "    'compositionNotes': 'short note'",
    "  },",
    "  'subject': {",
    "    'requestedTarget': 'string',",
    "    'detectedLabel': 'string',",
    "    'detected': boolean,",
    "    'confidence': number,",
    "    'bounds': { 'x0': number, 'y0': number, 'x1': number, 'y1': number }",
    "  },",
    "  'depth': { 'subjectDepth': number },",
    "  'bgPrompt': 'short background prompt',",
    `  'category': '${IMAGE_CATEGORY_OPTIONS.join("' | '")}',`,
    "  'categoryConfidence': number",
    "}",
    "All fields required. Coordinates and bounds are 0-100.",
    "subjectDepth 0=far 1=near. Server builds depth grid; do not return depth values array.",
  ].join(" ");
}

export function buildRemoveBackgroundPrompt(label: string): string {
  return `Remove the background from this image and keep only the main subject (${label}). Preserve subject edges, hair, and fine details. Use a clean transparent or pure white background with no scenery.`;
}

export function buildEditPrompt(label: string, bgPrompt: string): string {
  return `Keep the main subject (${label}) sharp and unchanged, but change the background to a stunning ${bgPrompt}. Preserve subject features, proportions, and silhouette. High quality, professional photography style.`;
}
