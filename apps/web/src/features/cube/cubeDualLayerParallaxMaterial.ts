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
uniform float uHologramMode;
uniform float uFocusPulse;
uniform float uGradientShift;
uniform float uGradientEnabled;
varying vec2 vUv;

float subjectMask(vec2 uv) {
  return step(uSubjectBounds.x, uv.x)
    * step(uv.x, uSubjectBounds.z)
    * step(uSubjectBounds.y, uv.y)
    * step(uv.y, uSubjectBounds.w);
}

float subjectMaskSoft(vec2 uv) {
  vec4 b = uSubjectBounds;
  float mx = smoothstep(b.x - 0.035, b.x + 0.025, uv.x)
    * smoothstep(b.z + 0.025, b.z - 0.035, uv.x);
  float my = smoothstep(b.y - 0.035, b.y + 0.025, uv.y)
    * smoothstep(b.w + 0.025, b.w - 0.035, uv.y);
  return mx * my;
}

/** JPEG originals have fg.a=1; use AI bounds + depth for VoluMax fg/bg split. */
float foregroundAlpha(vec2 uv, float fgAlphaSample) {
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
  // Base parallax recession + extra push-back at focus peak
  float bgPush = 1.0 + uFocusPulse * 0.07;
  float scale = (1.0 + amount * uBgParallaxMul * ${DEPTH_EMPHASIS.toFixed(2)}) * bgPush;
  return uFocus + delta * scale;
}

// Returns a scale factor: subject pixels are pulled 9% inward (toward uFocus).
// originalUv is used only to determine if this pixel is inside the subject bounds.
vec2 warpSubjectPulse(vec2 warpedUv, vec2 originalUv) {
  float inSubject = subjectMask(originalUv);
  if (inSubject < 0.5) return warpedUv;
  vec2 delta = warpedUv - uFocus;
  float pull = 1.0 - uFocusPulse * 0.09;
  return uFocus + delta * pull;
}

${PHOTO_FRAME_GLSL}

void main() {
  float parallaxNorm = clamp(uParallax / ${PARALLAX_MAX.toFixed(4)}, 0.0, 1.0);

  vec2 fanUv = vUv;
  vec2 bgUv = warpBackground(fanUv, uParallax);
  vec2 fgUv = warpForeground(fanUv, uParallax);
  // Apply subject-forward pulse on top of parallax warp
  if (uFocusPulse > 0.001) {
    fgUv = warpSubjectPulse(fgUv, fanUv);
  }
  vec4 bg = texture2D(uBgTexture, bgUv);
  vec4 fg = texture2D(uFgTexture, fgUv);

  float fgBlend = foregroundAlpha(fanUv, fg.a);

  vec2 shadowUv = fgUv + vec2(parallaxNorm * 0.022, -parallaxNorm * 0.016);
  float shadowSample = texture2D(uFgTexture, shadowUv).a;
  float shadow = (1.0 - fgBlend) * shadowSample * parallaxNorm * 0.42;
  bg.rgb *= 1.0 - shadow * 0.55;

  vec3 composed = mix(bg.rgb, fg.rgb, fgBlend);

  float edgeL = texture2D(uFgTexture, fgUv + vec2(0.003, 0.0)).a;
  float edgeR = texture2D(uFgTexture, fgUv - vec2(0.003, 0.0)).a;
  float edgeU = texture2D(uFgTexture, fgUv + vec2(0.0, 0.003)).a;
  float rim = fgBlend * (1.0 - min(min(edgeL, edgeR), edgeU));
  composed += vec3(1.0, 0.93, 0.88) * rim * parallaxNorm * 0.65;

  float lift = 1.0 + parallaxNorm * 0.035;
  composed = mix(composed, composed * lift, fgBlend * parallaxNorm * 0.35);

  vec4 framed = applyPhotoFrame(vec4(composed, 1.0), vUv, uFramePreset, uHologramMode);
  if (uHologramMode > 0.5) {
    framed.a = 1.0;
  }
  if (uGradientEnabled > 0.5) {
    float wave = 0.5 + 0.5 * sin(uGradientShift);
    vec3 tint = vec3(
      0.65 + 0.35 * sin(uGradientShift),
      0.65 + 0.35 * sin(uGradientShift + 2.094),
      0.65 + 0.35 * sin(uGradientShift + 4.188)
    );
    framed.rgb = mix(framed.rgb, framed.rgb * tint, wave * 0.55);
  }
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
      ...createFramePresetUniform(framePresetId),
    },
    vertexShader,
    fragmentShader,
    transparent: false,
    side: THREE.DoubleSide,
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
