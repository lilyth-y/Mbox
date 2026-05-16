import * as THREE from "three";
import type { ImageCenter } from "../../shared/types";
import { PARALLAX_MAX } from "./cubeSequence";

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform sampler2D uTexture;
uniform sampler2D uDepthMap;
uniform float uParallax;
uniform float uSubjectDepth;
uniform float uUseDepthMap;
uniform vec2 uFocus;
varying vec2 vUv;

void main() {
  float depthWeight;
  if (uUseDepthMap > 0.5) {
    float sceneDepth = texture2D(uDepthMap, vUv).r;
    depthWeight = sceneDepth - uSubjectDepth;
  } else {
    vec2 delta = vUv - uFocus;
    float dist = length(delta);
    float subjectWeight = 1.0 - smoothstep(0.0, 0.48, dist);
    depthWeight = (subjectWeight - 0.5) * 2.0;
  }

  vec2 delta = vUv - uFocus;
  float scale = 1.0 + depthWeight * uParallax;
  vec2 warped = uFocus + delta * scale;
  gl_FragColor = texture2D(uTexture, warped);
}
`;

export type ParallaxMaterial = THREE.ShaderMaterial & {
  userData: {
    isParallax: true;
  };
};

function toFocusVector(center: ImageCenter): THREE.Vector2 {
  return new THREE.Vector2(center.x / 100, 1 - center.y / 100);
}

export function createParallaxMaterial(
  texture: THREE.Texture,
  center: ImageCenter,
  depthTexture: THREE.Texture,
  subjectDepth: number,
  useDepthMap: boolean
): ParallaxMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: texture },
      uDepthMap: { value: depthTexture },
      uParallax: { value: 0 },
      uSubjectDepth: { value: subjectDepth },
      uUseDepthMap: { value: useDepthMap ? 1 : 0 },
      uFocus: { value: toFocusVector(center) },
    },
    vertexShader,
    fragmentShader,
  }) as ParallaxMaterial;

  material.userData.isParallax = true;
  return material;
}

export function isParallaxMaterial(
  material: THREE.Material
): material is ParallaxMaterial {
  return material.userData.isParallax === true;
}

export function updateParallaxMaterial(
  material: ParallaxMaterial,
  texture: THREE.Texture,
  center: ImageCenter,
  depthTexture: THREE.Texture,
  subjectDepth: number,
  useDepthMap: boolean,
  amount: number
): void {
  material.uniforms.uTexture.value = texture;
  material.uniforms.uDepthMap.value = depthTexture;
  material.uniforms.uFocus.value = toFocusVector(center);
  material.uniforms.uSubjectDepth.value = subjectDepth;
  material.uniforms.uUseDepthMap.value = useDepthMap ? 1 : 0;
  material.uniforms.uParallax.value = Math.min(PARALLAX_MAX, Math.max(0, amount));
}

export function setParallaxAmount(material: ParallaxMaterial, amount: number): void {
  material.uniforms.uParallax.value = Math.min(PARALLAX_MAX, Math.max(0, amount));
}
