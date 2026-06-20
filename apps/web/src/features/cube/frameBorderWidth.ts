export type FrameBorderWidthId = "thin" | "medium" | "thick";

export const FRAME_BORDER_WIDTH_OPTIONS: {
  id: FrameBorderWidthId;
  label: string;
  scale: number;
}[] = [
  { id: "thin", label: "얇게", scale: 0.62 },
  { id: "medium", label: "보통", scale: 1.0 },
  { id: "thick", label: "두껍게", scale: 1.48 },
];

export const DEFAULT_FRAME_BORDER_WIDTH_ID: FrameBorderWidthId = "medium";

export function frameBorderScale(id: FrameBorderWidthId | undefined): number {
  return FRAME_BORDER_WIDTH_OPTIONS.find((entry) => entry.id === id)?.scale ?? 1;
}
