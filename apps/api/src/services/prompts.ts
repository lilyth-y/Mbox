import { IMAGE_CATEGORY_OPTIONS } from "@mbox/shared";

export const ANALYSIS_MODEL = "gemini-2.5-flash";
export const EDIT_MODEL = "gemini-2.5-flash-image";

export function buildAnalysisPrompt(focusTarget?: string): string {
  const targetInstruction = focusTarget?.trim()
    ? `The user wants the focus target to be "${focusTarget.trim()}". Prioritize that subject for label, center, bounds, and depth. If it is missing, set subject.detected to false and explain in focus.compositionNotes.`
    : "If no focus target is provided, choose the most salient person or subject in the image.";

  return [
    "Analyze this image for subject-aware framing and depth-aware parallax.",
    targetInstruction,
    "Return JSON only with this shape:",
    "{",
    "  'label': 'short subject label',",
    "  'center': { 'x': number, 'y': number },",
    "  'focus': {",
    "    'onPrimarySubject': boolean,",
    "    'centering': 'centered' | 'rule_of_thirds' | 'offset' | 'edge_weighted',",
    "    'aestheticScore': number,",
    "    'compositionNotes': 'string'",
    "  },",
    "  'subject': {",
    "    'requestedTarget': 'string',",
    "    'detectedLabel': 'string',",
    "    'detected': boolean,",
    "    'confidence': number,",
    "    'bounds': { 'x0': number, 'y0': number, 'x1': number, 'y1': number }",
    "  },",
    "  'depth': {",
    "    'subjectDepth': number",
    "  },",
    "  'bgPrompt': 'string',",
    `  'category': '${IMAGE_CATEGORY_OPTIONS.join("' | '")}',`,
    "  'categoryConfidence': number",
    "}",
    "category must be exactly one of the listed values.",
    "categoryConfidence is a value from 0.0 to 1.0 for how confident you are in category.",
    "Coordinates and bounds are percentages from 0 to 100.",
    "subjectDepth is relative depth at the focus center (0.0 far background, 1.0 nearest).",
    "Do not return a depth grid; the server synthesizes parallax from center and bounds.",
    "Keep the requested target in subject.requestedTarget even when detected is false.",
  ].join(" ");
}

export function buildRemoveBackgroundPrompt(label: string): string {
  return `Remove the background from this image and keep only the main subject (${label}). Preserve subject edges, hair, and fine details. Use a clean transparent or pure white background with no scenery.`;
}

export function buildEditPrompt(label: string, bgPrompt: string): string {
  return `Keep the main subject (${label}) sharp and unchanged, but change the background to a stunning ${bgPrompt}. Preserve subject features, proportions, and silhouette. High quality, professional photography style.`;
}
