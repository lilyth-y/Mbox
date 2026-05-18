import * as THREE from "three";
import type { CubeFramePresetId } from "@mbox/shared";
import { PHOTO_FRAME_GLSL } from "./photoFrameGlsl";
import { createFramePresetUniform, setFramePresetUniform } from "./presentationFrameUniforms";

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
varying vec2 vUv;

${PHOTO_FRAME_GLSL}

void main() {
  vec4 tex = texture2D(uTexture, vUv);
  gl_FragColor = applyPhotoFrame(tex, vUv, uFramePreset);
}
`;

export function createFramedFlatMaterial(
  texture: THREE.Texture,
  framePresetId: CubeFramePresetId
): THREE.ShaderMaterial {
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: texture },
      ...createFramePresetUniform(framePresetId),
    },
    vertexShader,
    fragmentShader,
    transparent: true,
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
