import * as THREE from "three";
import {
  CUBE_FACE_UV_INSET,
  CUBE_VOLUMAX_ALPHA_TEST,
} from "@mbox/shared";
import { configurePresentationTexture } from "./presentationTextures";

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform sampler2D uTexture;
uniform float uFaceUvInset;
uniform float uAlphaTest;
varying vec2 vUv;
void main() {
  vec2 edge = min(vUv, 1.0 - vUv);
  if (min(edge.x, edge.y) < uFaceUvInset) {
    discard;
  }
  vec4 tex = texture2D(uTexture, vUv);
  if (tex.a < uAlphaTest) {
    discard;
  }
  gl_FragColor = vec4(tex.rgb, tex.a);
}
`;

export function createFaceClipMaterial(
  texture: THREE.Texture,
  options: {
    transparent?: boolean;
    alphaTest?: number;
    inset?: number;
    depthWrite?: boolean;
  } = {}
): THREE.ShaderMaterial {
  configurePresentationTexture(texture);
  const transparent = options.transparent ?? false;
  const alphaTest = options.alphaTest ?? (transparent ? CUBE_VOLUMAX_ALPHA_TEST : 0);
  const depthWrite = options.depthWrite ?? !transparent;
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL1,
    uniforms: {
      uTexture: { value: texture },
      uFaceUvInset: { value: options.inset ?? CUBE_FACE_UV_INSET },
      uAlphaTest: { value: alphaTest },
    },
    vertexShader,
    fragmentShader,
    transparent,
    depthWrite,
    side: THREE.FrontSide,
  });
}

export function isFaceClipMaterial(
  material: THREE.Material
): material is THREE.ShaderMaterial & { uniforms: { uFaceUvInset: { value: number } } } {
  return material instanceof THREE.ShaderMaterial && Boolean(material.uniforms?.uFaceUvInset);
}
