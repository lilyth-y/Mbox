import * as THREE from "three";
import type { ImageCenter, SubjectBounds } from "../../shared/types";
import { DEPTH_EMPHASIS, PARALLAX_MAX } from "./cubeSequence";

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
uniform float uPortraitBoost;
uniform float uDepthGain;
uniform vec4 uSubjectBounds;
uniform vec2 uFocus;
varying vec2 vUv;

void main() {
  float depthWeight;
  if (uUseDepthMap > 0.5) {
    float sceneDepth = texture2D(uDepthMap, vUv).r;
    depthWeight = (sceneDepth - uSubjectDepth) * 1.35;
  } else {
    vec2 delta = vUv - uFocus;
    float dist = length(delta);
    float subjectWeight = 1.0 - smoothstep(0.0, 0.42, dist);
    depthWeight = (subjectWeight - 0.5) * 2.6;
  }

  float inSubject = step(uSubjectBounds.x, vUv.x)
    * step(vUv.x, uSubjectBounds.z)
    * step(uSubjectBounds.y, vUv.y)
    * step(vUv.y, uSubjectBounds.w);

  if (uPortraitBoost > 0.5) {
    depthWeight = mix(depthWeight, mix(-1.18, 1.12, inSubject), 0.88);
  }

  depthWeight = clamp(depthWeight, -1.25, 1.25);

  vec2 delta = vUv - uFocus;
  float foreground = step(0.0, depthWeight);
  float background = 1.0 - foreground;
  float portraitMul = mix(1.75, mix(3.45, 3.05, background), uPortraitBoost);
  float separation = depthWeight * uParallax * portraitMul * uDepthGain;
  float scale = 1.0 + separation;
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

function toSubjectBoundsVector(bounds: SubjectBounds): THREE.Vector4 {
  return new THREE.Vector4(
    bounds.x0 / 100,
    1 - bounds.y1 / 100,
    bounds.x1 / 100,
    1 - bounds.y0 / 100
  );
}

export interface ParallaxMaterialOptions {
  portraitBoost?: boolean;
  subjectBounds?: SubjectBounds;
}

export function createParallaxMaterial(
  texture: THREE.Texture,
  center: ImageCenter,
  depthTexture: THREE.Texture,
  subjectDepth: number,
  useDepthMap: boolean,
  options: ParallaxMaterialOptions = {}
): ParallaxMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: texture },
      uDepthMap: { value: depthTexture },
      uParallax: { value: 0 },
      uSubjectDepth: { value: subjectDepth },
      uUseDepthMap: { value: useDepthMap ? 1 : 0 },
      uPortraitBoost: { value: options.portraitBoost ? 1 : 0 },
      uDepthGain: { value: DEPTH_EMPHASIS },
      uSubjectBounds: {
        value: options.subjectBounds
          ? toSubjectBoundsVector(options.subjectBounds)
          : new THREE.Vector4(0, 0, 1, 1),
      },
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
  amount: number,
  options: ParallaxMaterialOptions = {}
): void {
  material.uniforms.uTexture.value = texture;
  material.uniforms.uDepthMap.value = depthTexture;
  material.uniforms.uFocus.value = toFocusVector(center);
  material.uniforms.uSubjectDepth.value = subjectDepth;
  material.uniforms.uUseDepthMap.value = useDepthMap ? 1 : 0;
  material.uniforms.uPortraitBoost.value = options.portraitBoost ? 1 : 0;
  material.uniforms.uSubjectBounds.value = options.subjectBounds
    ? toSubjectBoundsVector(options.subjectBounds)
    : new THREE.Vector4(0, 0, 1, 1);
  material.uniforms.uDepthGain.value = DEPTH_EMPHASIS;
  material.uniforms.uParallax.value = Math.min(PARALLAX_MAX, Math.max(0, amount));
}

export function setParallaxAmount(material: ParallaxMaterial, amount: number): void {
  material.uniforms.uParallax.value = Math.min(PARALLAX_MAX, Math.max(0, amount));
}
