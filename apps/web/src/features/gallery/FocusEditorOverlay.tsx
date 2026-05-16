import type { ImageCenter, ProcessedImage } from "../../shared/types";
import { FocusWorkbench } from "./FocusWorkbench";

interface FocusEditorOverlayProps {
  image: ProcessedImage;
  onCenterCommit: (center: ImageCenter) => void;
}

/** @deprecated Use FocusWorkbench — kept for gallery imports */
export function FocusEditorOverlay({ image, onCenterCommit }: FocusEditorOverlayProps) {
  return <FocusWorkbench image={image} onCenterCommit={onCenterCommit} variant="compact" />;
}
