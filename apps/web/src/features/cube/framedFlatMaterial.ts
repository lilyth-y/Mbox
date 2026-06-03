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
uniform float uHologramMode;
uniform float uGradientShift;
uniform float uGradientEnabled;
varying vec2 vUv;

${PHOTO_FRAME_GLSL}

void main() {
  vec2 sampleUv = vUv;
  vec4 tex = texture2D(uTexture, sampleUv);
  vec4 framed = applyPhotoFrame(tex, vUv, uFramePreset, uHologramMode);
  if (uHologramMode > 0.5) {
    framed.a = 1.0;
  }
  if (uGradientEnabled > 0.5) {
    float wave = 0.5 + 0.5 * sin(uGradientShift);
    vec3 tint = vec3(
      0.82 + 0.12 * sin(uGradientShift),
      0.58 + 0.16 * sin(uGradientShift + 2.1),
      0.64 + 0.14 * sin(uGradientShift + 4.2)
    );
    framed.rgb = mix(framed.rgb, framed.rgb * tint, wave * 0.22);
  }
  gl_FragColor = framed;
}
`;

export function createFramedFlatMaterial(
  texture: THREE.Texture,
  framePresetId: CubeFramePresetId,
  hologramMode: boolean = false
): THREE.ShaderMaterial {
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: texture },
      uHologramMode: { value: hologramMode ? 1.0 : 0.0 },
      uGradientShift: { value: 0 },
      uGradientEnabled: { value: 0 },
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
