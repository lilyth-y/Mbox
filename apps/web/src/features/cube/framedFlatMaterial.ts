import * as THREE from "three";
import type { CubeFramePresetId } from "@mbox/shared";
import { PHOTO_FRAME_GLSL } from "./photoFrameGlsl";
import { HOLOGRAM_RIM_GLSL } from "./microModules/shaders/hologramRimGlsl";
import {
  createHologramRimUniforms,
  HOLOGRAM_RIM_FRAGMENT_TAIL,
} from "./microModules/hologramRimUniforms";
import { configurePresentationTexture } from "./presentationTextures";
import { createFramePresetUniform, setFramePresetUniform } from "./presentationFrameUniforms";
import { createCustomFrameColorUniforms } from "./frameColorUniforms";
import { createFrameFinishUniforms } from "./frameFinishUniforms";
import { createFaceLacquerUniforms } from "./faceLacquerUniforms";
import { DEFAULT_FRAME_BORDER_WIDTH_ID, frameBorderScale } from "./frameBorderWidth";

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform sampler2D uTexture;
uniform float uFramePreset;
uniform float uHologramMode;
uniform float uGradientShift;
uniform float uGradientEnabled;
uniform vec3 uCustomFrameColor;
uniform float uUseCustomFrameColor;
uniform float uFrameBorderScale;
uniform float uFrameFinish;
uniform float uPhotoInsetExpand;
uniform float uFaceUvInset;
uniform float uShellFrameMode;
uniform vec2 uFaceLightDir;
uniform float uFaceGloss;
uniform float uFaceShowcasePulse;
uniform float uHologramRimEnabled;
uniform float uHologramRimTime;
varying vec2 vUv;

${PHOTO_FRAME_GLSL}
${HOLOGRAM_RIM_GLSL}

void main() {
  vec2 edge = min(vUv, 1.0 - vUv);
  if (uFrameFinish >= 1.5 && min(edge.x, edge.y) < uFaceUvInset) {
    discard;
  }
  vec2 sampleUv = vUv;
  vec4 tex = texture2D(uTexture, sampleUv);
  vec4 framed = applyPhotoFrame(tex, vUv, uFramePreset, uHologramMode, uTexture);
  ${HOLOGRAM_RIM_FRAGMENT_TAIL}
  gl_FragColor = framed;
}
`;

export interface FramedFlatMaterialOptions {
  /** 0 = VoluMax matte / composed layers (skip GLSL frame). 1 = flat wedding photo. */
  photoInsetExpand?: number;
}

export function createFramedFlatMaterial(
  texture: THREE.Texture,
  framePresetId: CubeFramePresetId,
  hologramMode: boolean = false,
  options: FramedFlatMaterialOptions = {}
): THREE.ShaderMaterial {
  configurePresentationTexture(texture);
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL1,
    uniforms: {
      uTexture: { value: texture },
      uHologramMode: { value: hologramMode ? 1.0 : 0.0 },
      uGradientShift: { value: 0 },
      uGradientEnabled: { value: 0 },
      ...createHologramRimUniforms(),
      ...createFramePresetUniform(framePresetId),
      ...createCustomFrameColorUniforms(null),
      ...createFrameFinishUniforms(),
      ...createFaceLacquerUniforms(),
      uPhotoInsetExpand: { value: options.photoInsetExpand ?? 1 },
      uFaceUvInset: { value: 0 },
      uShellFrameMode: { value: 0 },
      uFrameBorderScale: { value: frameBorderScale(DEFAULT_FRAME_BORDER_WIDTH_ID) },
    },
    vertexShader,
    fragmentShader,
    transparent: (options.photoInsetExpand ?? 1) <= 0,
    depthWrite: (options.photoInsetExpand ?? 1) > 0,
    side: THREE.DoubleSide,
  });
}

export function updateFramedFlatMaterialFrame(
  material: THREE.ShaderMaterial,
  framePresetId: CubeFramePresetId
): void {
  setFramePresetUniform(
    material.uniforms as { uFramePreset: { value: number } },
    framePresetId
  );
}
