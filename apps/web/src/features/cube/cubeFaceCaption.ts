import * as THREE from "three";
import type { CubeFramePresetId } from "@mbox/shared";

const CAPTION_CANVAS_W = 640;
const CAPTION_CANVAS_H = 96;
const MAX_CAPTION_CHARS = 48;
const CAPTION_BAR_HEIGHT_RATIO = 0.72;

const FRAME_ACCENT: Record<CubeFramePresetId, string> = {
  rose_gold: "#e8b4b8",
  pearl_white: "#e2e8f0",
  classic_black: "#d4af37",
  sage_garden: "#a8c4a0",
  royal_navy: "#c9a227",
};

export interface CubeFaceCaptionHandle {
  mesh: THREE.Mesh;
  updateText: (text: string) => void;
  setOpacity: (opacity: number) => void;
  dispose: () => void;
}

function truncateCaption(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CAPTION_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_CAPTION_CHARS - 1)}…`;
}

function drawCaptionCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  framePresetId: CubeFramePresetId
): void {
  const w = CAPTION_CANVAS_W;
  const h = CAPTION_CANVAS_H;
  ctx.clearRect(0, 0, w, h);

  const line = truncateCaption(text);
  if (!line) {
    return;
  }

  const barH = h * CAPTION_BAR_HEIGHT_RATIO;
  const barY = h - barH;
  const accent = FRAME_ACCENT[framePresetId] ?? "#e8b4b8";

  const grad = ctx.createLinearGradient(0, barY, 0, h);
  grad.addColorStop(0, "rgba(8, 6, 12, 0)");
  grad.addColorStop(0.35, "rgba(8, 6, 12, 0.72)");
  grad.addColorStop(1, "rgba(8, 6, 12, 0.88)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, barY, w, barH);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.08, barY + 3);
  ctx.lineTo(w * 0.92, barY + 3);
  ctx.stroke();

  ctx.font = '600 28px "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff7f2";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 6;
  ctx.fillText(line, w / 2, barY + barH * 0.58);
  ctx.shadowBlur = 0;
}

export function createCubeFaceCaption(
  facePlaneSize: number,
  framePresetId: CubeFramePresetId
): CubeFaceCaptionHandle {
  const canvas = document.createElement("canvas");
  canvas.width = CAPTION_CANVAS_W;
  canvas.height = CAPTION_CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Caption canvas 2D context unavailable.");
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const width = facePlaneSize * 0.92;
  const height = width * (CAPTION_CANVAS_H / CAPTION_CANVAS_W);
  const geometry = new THREE.PlaneGeometry(width, height);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -facePlaneSize * 0.38;
  mesh.position.z = 0.02;
  mesh.renderOrder = 5;
  mesh.visible = false;

  let currentText = "";

  const redraw = () => {
    drawCaptionCanvas(ctx, currentText, framePresetId);
    texture.needsUpdate = true;
    mesh.visible = currentText.trim().length > 0;
  };

  return {
    mesh,
    updateText(text: string) {
      const next = text.trim();
      if (next === currentText) {
        return;
      }
      currentText = next;
      redraw();
    },
    setOpacity(opacity: number) {
      const clamped = THREE.MathUtils.clamp(opacity, 0, 1);
      material.opacity = clamped;
      mesh.visible = currentText.trim().length > 0 && clamped > 0.01;
    },
    dispose() {
      texture.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
