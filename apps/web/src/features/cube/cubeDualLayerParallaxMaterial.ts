import * as THREE from "three";
import {
  CUBE_FACE_UV_INSET,
  CUBE_PARALLAX_UV_WARP_MAX,
} from "@mbox/shared";
import type { ImageCenter, SubjectBounds } from "../../shared/types";
import { DEPTH_EMPHASIS, PARALLAX_MAX } from "./cubeSequence";
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
uniform float uHologramMode;
uniform float uFocusPulse;
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
uniform float uUvWarpMax;
uniform float uTrustFgAlpha;
uniform float uHologramRimEnabled;
uniform float uHologramRimTime;
varying vec2 vUv;

vec2 clampFaceUv(vec2 uv) {
  return clamp(uv, 0.001, 0.999);
}

float subjectMaskBounds(vec2 uv) {
  return step(uSubjectBounds.x, uv.x)
    * step(uv.x, uSubjectBounds.z)
    * step(uSubjectBounds.y, uv.y)
    * step(uv.y, uSubjectBounds.w);
}

float subjectMaskSoftBounds(vec2 uv) {
  vec4 b = uSubjectBounds;
  float mx = smoothstep(b.x - 0.035, b.x + 0.025, uv.x)
    * smoothstep(b.z + 0.025, b.z - 0.035, uv.x);
  float my = smoothstep(b.y - 0.035, b.y + 0.025, uv.y)
    * smoothstep(b.w + 0.025, b.w - 0.035, uv.y);
  return mx * my;
}

// AI cutout: follow PNG silhouette — never the detection bounding box.
float subjectMask(vec2 uv) {
  if (uTrustFgAlpha > 0.5) {
    return step(0.06, texture2D(uFgTexture, uv).a);
  }
  return subjectMaskBounds(uv);
}

float subjectMaskSoft(vec2 uv) {
  if (uTrustFgAlpha > 0.5) {
    return smoothstep(0.04, 0.52, texture2D(uFgTexture, uv).a);
  }
  return subjectMaskSoftBounds(uv);
}

// PNG matte: trust texture alpha. JPEG fallback uses bounds + depth heuristics.
float foregroundAlpha(vec2 uv, float fgAlphaSample) {
  if (uTrustFgAlpha > 0.5) {
    return clamp(fgAlphaSample, 0.0, 1.0);
  }
  if (fgAlphaSample < 0.95) {
    return fgAlphaSample;
  }
  if (uPortraitBoost < 0.5) {
    return 1.0;
  }
  float matte = subjectMaskSoft(uv);
  if (uUseDepthMap > 0.5) {
    float sceneDepth = texture2D(uDepthMap, uv).r;
    float depthMatte = smoothstep(uSubjectDepth + 0.1, uSubjectDepth - 0.06, sceneDepth);
    matte = max(matte, depthMatte * 0.92);
  }
  return clamp(matte, 0.0, 1.0);
}

vec2 warpForeground(vec2 uv, float amount) {
  vec2 delta = uv - uFocus;
  float depthWeight;
  if (uUseDepthMap > 0.5) {
    float sceneDepth = texture2D(uDepthMap, uv).r;
    depthWeight = (sceneDepth - uSubjectDepth) * 1.35;
  } else {
    float dist = length(delta);
    float subjectWeight = 1.0 - smoothstep(0.0, 0.42, dist);
    depthWeight = (subjectWeight - 0.5) * 2.6;
  }

  float inSubject = subjectMaskSoft(uv);
  if (uPortraitBoost > 0.5) {
    depthWeight = mix(depthWeight, mix(-1.18, 1.12, inSubject), 0.88 * inSubject);
  }

  depthWeight = clamp(depthWeight, -1.25, 1.25);
  float foreground = step(0.0, depthWeight);
  float background = 1.0 - foreground;
  float portraitMul = mix(1.85, mix(3.85, 3.35, background), uPortraitBoost);
  float separation = depthWeight * amount * portraitMul * ${DEPTH_EMPHASIS.toFixed(2)};
  float scale = 1.0 - separation;
  return uFocus + delta * scale;
}

vec2 warpBackground(vec2 uv, float amount) {
  vec2 delta = uv - uFocus;
  // VoluMax background distance: stronger recession at showcase hold
  float bgPush = 1.0 + uFocusPulse * 0.34 + amount * 0.16;
  float scale = (1.0 + amount * uBgParallaxMul * ${DEPTH_EMPHASIS.toFixed(2)}) * bgPush;
  return uFocus + delta * scale;
}

// VoluMax hero pop: scale subject UV outward toward camera (not inward pull).
vec2 warpSubjectPulse(vec2 warpedUv, vec2 originalUv) {
  float inSubject = subjectMaskSoft(originalUv);
  if (inSubject < 0.04) return warpedUv;
  vec2 delta = warpedUv - uFocus;
  float push = 1.0 + uFocusPulse * 0.5 * inSubject;
  return uFocus + delta * push;
}

${PHOTO_FRAME_GLSL}
${HOLOGRAM_RIM_GLSL}

void main() {
  vec2 edge = min(vUv, 1.0 - vUv);
  // Framed faces: applyPhotoFrame clips the photo — skip geometric discard (was hiding photos).
  if (uFrameFinish >= 1.5 && min(edge.x, edge.y) < uFaceUvInset) {
    discard;
  }

  float parallaxNorm = clamp(uParallax / ${PARALLAX_MAX.toFixed(4)}, 0.0, 1.0);
  float warpAmount = min(parallaxNorm * ${PARALLAX_MAX.toFixed(4)}, uUvWarpMax);

  vec2 fanUv = vUv;
  vec2 bgUv = fanUv;
  vec2 fgUv = fanUv;
  // AI cutout: fg + bg share one crop — independent UV warp pulls subject off the plate.
  if (uTrustFgAlpha < 0.5 && (parallaxNorm > 0.002 || uFocusPulse > 0.002)) {
    float fgWarp = warpAmount * (1.0 + uFocusPulse * 0.45);
    bgUv = clampFaceUv(warpBackground(fanUv, warpAmount));
    fgUv = clampFaceUv(warpForeground(fanUv, fgWarp));
    if (uFocusPulse > 0.001) {
      fgUv = clampFaceUv(warpSubjectPulse(fgUv, fanUv));
    }
  }
  vec4 bg = texture2D(uBgTexture, bgUv);
  vec4 fg = texture2D(uFgTexture, fgUv);

  float fgBlend = foregroundAlpha(fanUv, fg.a);

  vec2 shadowUv = fgUv + vec2(parallaxNorm * 0.022, -parallaxNorm * 0.016);
  float shadowSample = texture2D(uFgTexture, shadowUv).a;
  float shadow = (1.0 - fgBlend) * shadowSample * parallaxNorm * 0.42;
  bg.rgb *= 1.0 - shadow * 0.55;

  vec3 composed = mix(bg.rgb, fg.rgb, fgBlend);

  if (parallaxNorm > 0.004 && uTrustFgAlpha < 0.5) {
    float edgeL = texture2D(uFgTexture, fgUv + vec2(0.003, 0.0)).a;
    float edgeR = texture2D(uFgTexture, fgUv - vec2(0.003, 0.0)).a;
    float edgeU = texture2D(uFgTexture, fgUv + vec2(0.0, 0.003)).a;
    float rim = fgBlend * (1.0 - min(min(edgeL, edgeR), edgeU));
    composed += vec3(1.0, 0.93, 0.88) * rim * parallaxNorm * 0.65;
  }

  float lift = 1.0 + parallaxNorm * 0.035;
  composed = mix(composed, composed * lift, fgBlend * parallaxNorm * 0.35);

  vec4 framed = applyPhotoFrame(vec4(composed, 1.0), vUv, uFramePreset, uHologramMode, uFgTexture);
  ${HOLOGRAM_RIM_FRAGMENT_TAIL}
  gl_FragColor = framed;
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
  hologramMode?: boolean;
  /** PNG/WebP matte — sample fg alpha directly for bg plate visibility. */
  trustFgAlpha?: boolean;
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
  configurePresentationTexture(foregroundTexture);
  configurePresentationTexture(backgroundTexture);
  const framePresetId = options.framePresetId ?? "rose_gold";

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL1,
    uniforms: {
      uBgTexture: { value: backgroundTexture },
      uFgTexture: { value: foregroundTexture },
      uDepthMap: { value: depthTexture },
      uParallax: { value: 0 },
      uFocusPulse: { value: 0 },
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
      uHologramMode: { value: options.hologramMode ? 1.0 : 0.0 },
      uGradientShift: { value: 0 },
      uGradientEnabled: { value: 0 },
      ...createHologramRimUniforms(),
      ...createFramePresetUniform(framePresetId),
      ...createCustomFrameColorUniforms(null),
      ...createFrameFinishUniforms(),
      ...createFaceLacquerUniforms(),
      uPhotoInsetExpand: { value: 0 },
      uFrameBorderScale: { value: frameBorderScale(DEFAULT_FRAME_BORDER_WIDTH_ID) },
      uFaceUvInset: { value: CUBE_FACE_UV_INSET },
      uShellFrameMode: { value: 0 },
      uUvWarpMax: { value: CUBE_PARALLAX_UV_WARP_MAX },
      uTrustFgAlpha: { value: options.trustFgAlpha ? 1 : 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: false,
    side: THREE.FrontSide,
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
  if (material.uniforms.uFocusPulse) {
    material.uniforms.uFocusPulse.value = 0;
  }
  if (material.uniforms.uHologramMode) {
    material.uniforms.uHologramMode.value = options.hologramMode ? 1.0 : 0.0;
  }
  if (options.framePresetId) {
    setFramePresetUniform(
      material.uniforms as { uFramePreset: { value: number } },
      options.framePresetId
    );
  }
  if (material.uniforms.uTrustFgAlpha) {
    material.uniforms.uTrustFgAlpha.value = options.trustFgAlpha ? 1 : 0;
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

export function setDualLayerParallaxAmount(material: DualLayerParallaxMaterial, amount: number, focusPulse: number = 0): void {
  material.uniforms.uParallax.value = Math.min(PARALLAX_MAX, Math.max(0, amount));
  if (material.uniforms.uFocusPulse) {
    material.uniforms.uFocusPulse.value = Math.min(1, Math.max(0, focusPulse));
  }
}
