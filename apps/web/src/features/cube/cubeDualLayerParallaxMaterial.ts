import * as THREE from "three";
import type { ImageCenter, SubjectBounds } from "../../shared/types";
import { DEPTH_EMPHASIS, PARALLAX_MAX } from "./cubeSequence";
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
uniform sampler2D uBgTexture;
uniform sampler2D uFgTexture;
uniform sampler2D uDepthMap;
uniform float uParallax;
uniform float uBgParallaxMul;
uniform float uSubjectDepth;
uniform float uUseDepthMap;
uniform float uPortraitBoost;
uniform vec4 uSubjectBounds;
uniform vec2 uFocus;
uniform float uFramePreset;
varying vec2 vUv;

float subjectMask(vec2 uv) {
  return step(uSubjectBounds.x, uv.x)
    * step(uv.x, uSubjectBounds.z)
    * step(uSubjectBounds.y, uv.y)
    * step(uv.y, uSubjectBounds.w);
}

vec2 warpForeground(vec2 uv, float amount) {
  float depthWeight;
  if (uUseDepthMap > 0.5) {
    float sceneDepth = texture2D(uDepthMap, uv).r;
    depthWeight = (sceneDepth - uSubjectDepth) * 1.35;
  } else {
    vec2 delta = uv - uFocus;
    float dist = length(delta);
    float subjectWeight = 1.0 - smoothstep(0.0, 0.42, dist);
    depthWeight = (subjectWeight - 0.5) * 2.6;
  }

  float inSubject = subjectMask(uv);
  if (uPortraitBoost > 0.5) {
    depthWeight = mix(depthWeight, mix(-1.18, 1.12, inSubject), 0.88);
  }

  depthWeight = clamp(depthWeight, -1.25, 1.25);
  vec2 delta = uv - uFocus;
  float foreground = step(0.0, depthWeight);
  float background = 1.0 - foreground;
  float portraitMul = mix(1.75, mix(3.45, 3.05, background), uPortraitBoost);
  float separation = depthWeight * amount * portraitMul * ${DEPTH_EMPHASIS.toFixed(2)};
  float scale = 1.0 - separation;
  return uFocus + delta * scale;
}

vec2 warpBackground(vec2 uv, float amount) {
  vec2 delta = uv - uFocus;
  float scale = 1.0 + amount * uBgParallaxMul * ${DEPTH_EMPHASIS.toFixed(2)};
  return uFocus + delta * scale;
}

${PHOTO_FRAME_GLSL}

void main() {
  float parallaxNorm = clamp(uParallax / ${PARALLAX_MAX.toFixed(4)}, 0.0, 1.0);

  vec2 bgUv = warpBackground(vUv, uParallax);
  vec2 fgUv = warpForeground(vUv, uParallax);
  vec4 bg = texture2D(uBgTexture, bgUv);
  vec4 fg = texture2D(uFgTexture, fgUv);

  vec2 shadowUv = fgUv + vec2(parallaxNorm * 0.022, -parallaxNorm * 0.016);
  float shadowSample = texture2D(uFgTexture, shadowUv).a;
  float shadow = (1.0 - fg.a) * shadowSample * parallaxNorm * 0.42;
  bg.rgb *= 1.0 - shadow * 0.55;

  vec3 composed = mix(bg.rgb, fg.rgb, fg.a);

  float edgeL = texture2D(uFgTexture, fgUv + vec2(0.003, 0.0)).a;
  float edgeR = texture2D(uFgTexture, fgUv - vec2(0.003, 0.0)).a;
  float edgeU = texture2D(uFgTexture, fgUv + vec2(0.0, 0.003)).a;
  float rim = fg.a * (1.0 - min(min(edgeL, edgeR), edgeU));
  composed += vec3(1.0, 0.93, 0.88) * rim * parallaxNorm * 0.65;

  float lift = 1.0 + parallaxNorm * 0.035;
  composed = mix(composed, composed * lift, fg.a * parallaxNorm * 0.35);

  gl_FragColor = applyPhotoFrame(vec4(composed, 1.0), vUv, uFramePreset);
}
`;

export type DualLayerParallaxMaterial = THREE.ShaderMaterial & {
  userData: {
    isDualLayerParallax: true;
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

export interface DualLayerParallaxOptions {
  portraitBoost?: boolean;
  subjectBounds?: SubjectBounds;
  bgParallaxMul?: number;
  framePresetId?: CubeFramePresetId;
}

export function createDualLayerParallaxMaterial(
  foregroundTexture: THREE.Texture,
  backgroundTexture: THREE.Texture,
  center: ImageCenter,
  depthTexture: THREE.Texture,
  subjectDepth: number,
  useDepthMap: boolean,
  options: DualLayerParallaxOptions = {}
): DualLayerParallaxMaterial {
  foregroundTexture.colorSpace = THREE.SRGBColorSpace;
  backgroundTexture.colorSpace = THREE.SRGBColorSpace;
  const framePresetId = options.framePresetId ?? "rose_gold";

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uBgTexture: { value: backgroundTexture },
      uFgTexture: { value: foregroundTexture },
      uDepthMap: { value: depthTexture },
      uParallax: { value: 0 },
      uBgParallaxMul: { value: options.bgParallaxMul ?? 0.62 },
      uSubjectDepth: { value: subjectDepth },
      uUseDepthMap: { value: useDepthMap ? 1 : 0 },
      uPortraitBoost: { value: options.portraitBoost ? 1 : 0 },
      uSubjectBounds: {
        value: options.subjectBounds
          ? toSubjectBoundsVector(options.subjectBounds)
          : new THREE.Vector4(0, 0, 1, 1),
      },
      uFocus: { value: toFocusVector(center) },
      ...createFramePresetUniform(framePresetId),
    },
    vertexShader,
    fragmentShader,
    transparent: false,
  }) as DualLayerParallaxMaterial;

  material.userData.isDualLayerParallax = true;
  return material;
}

export function isDualLayerParallaxMaterial(
  material: THREE.Material
): material is DualLayerParallaxMaterial {
  return material.userData.isDualLayerParallax === true;
}

export function updateDualLayerParallaxMaterial(
  material: DualLayerParallaxMaterial,
  foregroundTexture: THREE.Texture,
  backgroundTexture: THREE.Texture,
  center: ImageCenter,
  depthTexture: THREE.Texture,
  subjectDepth: number,
  useDepthMap: boolean,
  amount: number,
  options: DualLayerParallaxOptions = {}
): void {
  material.uniforms.uFgTexture.value = foregroundTexture;
  material.uniforms.uBgTexture.value = backgroundTexture;
  material.uniforms.uDepthMap.value = depthTexture;
  material.uniforms.uFocus.value = toFocusVector(center);
  material.uniforms.uSubjectDepth.value = subjectDepth;
  material.uniforms.uUseDepthMap.value = useDepthMap ? 1 : 0;
  material.uniforms.uPortraitBoost.value = options.portraitBoost ? 1 : 0;
  material.uniforms.uSubjectBounds.value = options.subjectBounds
    ? toSubjectBoundsVector(options.subjectBounds)
    : new THREE.Vector4(0, 0, 1, 1);
  material.uniforms.uBgParallaxMul.value = options.bgParallaxMul ?? 0.62;
  material.uniforms.uParallax.value = Math.min(PARALLAX_MAX, Math.max(0, amount));
  if (options.framePresetId) {
    setFramePresetUniform(
      material.uniforms as { uFramePreset: { value: number } },
      options.framePresetId
    );
  }
}

export function setDualLayerFramePreset(
  material: DualLayerParallaxMaterial,
  framePresetId: CubeFramePresetId
): void {
  setFramePresetUniform(
    material.uniforms as { uFramePreset: { value: number } },
    framePresetId
  );
}

export function setDualLayerParallaxAmount(material: DualLayerParallaxMaterial, amount: number): void {
  material.uniforms.uParallax.value = Math.min(PARALLAX_MAX, Math.max(0, amount));
}
