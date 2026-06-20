import { Material } from "@babylonjs/core/Materials/material";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HOLOGRAM_DISPLAY_SPEC } from "@mbox/shared";
import type { ShowcaseShellLightSnapshot } from "../showcaseJewelLighting";
import { getShowcaseBackgroundLightingState } from "../showcaseBackgroundState";
import { applyCrystalHarmonyToShell } from "../showcaseCrystalHarmony";
import {
  applyCrystalMediaReflectionStrength,
  applyUserCrystalSurfaceColor,
} from "../showcaseCrystalColor";
import {
  getCurrentHarmonyTuning,
  getHarmonyInfluence,
  getSmoothedBackdropSample,
} from "../showcaseHarmonyState";
import type { PhotoCrystalShapeId } from "../photoCrystalShapeCatalog";
import { getConvexShellPhotoTuning } from "../photoCrystalShapeFactory";
import {
  getCrystalBackdropReflectionScale,
  getCrystalShellAlphaMultiplier,
  getCrystalShellGlossMultiplier,
  getCrystalShellIceSuppress,
  getCrystalShellViewClearFactor,
  getShowcaseCatalogColorState,
} from "../showcaseCatalogColorState";

const VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
uniform mat4 world;
uniform mat4 view;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;
void main(void) {
  vec4 worldPos = world * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(world) * normal);
  vViewDir = normalize(-(view * worldPos).xyz);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const FRAGMENT = `
precision highp float;
uniform samplerCube uEnvColor;
uniform samplerCube uEnvMedia;
uniform float uPower;
uniform float uShellAlpha;
uniform float uGlossBoost;
uniform float uEnvMix;
uniform float uMediaReflection;
uniform vec3 uIceTint;
uniform float uTime;
uniform vec3 uOrbitLightPos;
uniform vec3 uOrbitLightPos2;
uniform vec3 uOrbitLightPos3;
uniform vec3 uKeyLightPos;
uniform vec3 uRimLightPos;
uniform vec3 uBackdropAvg;
uniform vec3 uBackdropBright;
uniform float uBackdropInfluence;
uniform float uShellOpacityScale;
uniform float uAlphaMax;
uniform float uViewClear;
uniform float uIceSuppress;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;

float facetSpec(vec3 n, vec3 v, vec3 lightPos, float shininess) {
  vec3 l = normalize(lightPos - vWorldPos);
  vec3 h = normalize(l + v);
  return pow(max(dot(n, h), 0.0), shininess);
}

vec3 sampleBackdropReflection(vec3 ref, vec3 refr, float reflectMask) {
  vec3 mood = textureCube(uEnvColor, ref).rgb;
  vec3 media = textureCube(uEnvMedia, ref).rgb;
  vec3 refrMedia = textureCube(uEnvMedia, refr).rgb;
  float mediaW = clamp(uMediaReflection, 0.0, 1.0);
  vec3 reflected = mix(mood, media, mediaW * (0.26 + reflectMask * 0.74));
  reflected += refrMedia * mediaW * (1.0 - reflectMask) * 0.18;
  float lum = dot(reflected, vec3(0.299, 0.587, 0.114));
  if (lum < 0.02) {
    reflected = mix(reflected, uBackdropAvg, uBackdropInfluence * 0.75);
  }
  return reflected;
}

void main(void) {
  vec3 n = normalize(vWorldNormal);
  bool isFront = gl_FrontFacing;
  if (!isFront) {
    n = -n;
  }
  vec3 v = normalize(vViewDir);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.2);

  vec3 facetBump = vec3(
    sin(dot(n, vec3(3.7, 5.1, 2.3)) * 4.2 + uTime * 0.35),
    cos(dot(n, vec3(2.9, 4.3, 6.1)) * 3.8),
    sin(dot(n, vec3(5.3, 2.7, 4.9)) * 3.4)
  ) * 0.036;
  vec3 nFacet = normalize(n + facetBump);

  vec3 ref = reflect(-v, nFacet);
  vec3 refr = refract(-v, nFacet, 0.92);
  float edge = smoothstep(0.12, 0.68, fres);
  float reflectMask = edge * (0.42 + fres * 0.58);

  vec3 env = sampleBackdropReflection(ref, refr, reflectMask);

  vec3 ice = uIceTint;
  float layerMul = isFront ? 1.0 : 0.55;
  float body = (1.0 - reflectMask * 0.72) * (0.22 + fres * 0.38);
  vec3 col = ice * body * uGlossBoost * 1.12 * layerMul;
  float facetValley = pow(1.0 - ndv, 2.35);
  col *= mix(1.0, 0.72, facetValley * 0.38);
  col += ice * facetValley * 0.22 * uGlossBoost * layerMul;
  col *= mix(1.0, 0.68, pow(ndv, 1.85));

  col += env * reflectMask * uGlossBoost * uPower * (0.72 + uEnvMix * 0.42) * layerMul * 0.88;

  float towardBg = pow(max(dot(n, -v), 0.0), 1.55);
  col += uBackdropBright * towardBg * reflectMask * uBackdropInfluence * 0.14;

  float spec =
    facetSpec(nFacet, v, uOrbitLightPos, 38.0) * 1.65 +
    facetSpec(nFacet, v, uOrbitLightPos2, 42.0) * 1.38 +
    facetSpec(nFacet, v, uOrbitLightPos3, 34.0) * 1.22 +
    facetSpec(nFacet, v, uKeyLightPos, 52.0) * 1.02 +
    facetSpec(nFacet, v, uRimLightPos, 46.0) * 0.88;
  col += vec3(1.0) * spec * uGlossBoost * edge * layerMul * mix(0.62, 1.85, fres);

  vec3 lMix = normalize(
    normalize(uOrbitLightPos - vWorldPos) +
    normalize(uOrbitLightPos2 - vWorldPos) +
    normalize(uOrbitLightPos3 - vWorldPos)
  );
  float facet = pow(max(dot(nFacet, lMix), 0.0), 6.0);
  float pulse = 0.5 + 0.5 * sin(uTime * 1.8 + dot(n, vec3(7.1, 9.3, 5.7)));
  col += vec3(1.0) * facet * pulse * 1.45 * uGlossBoost * edge * layerMul;

  float silhouette = pow(1.0 - abs(dot(normalize(vWorldNormal), v)), 3.2);
  col += ice * silhouette * 0.42 * uGlossBoost;
  col += vec3(1.0) * fres * edge * 0.38 * uGlossBoost * layerMul;

  float vis = edge * (0.68 + fres * 0.62);
  float alpha = clamp(
    uShellAlpha * vis * uPower * uShellOpacityScale * (isFront ? 1.0 : 0.62),
    0.0,
    uAlphaMax
  );
  float viewThrough = pow(ndv, 1.12);
  float iceFade = clamp(uIceSuppress * viewThrough, 0.0, 1.0);
  col *= mix(1.0, 0.38, iceFade * 0.55);
  alpha *= mix(1.0, uViewClear, viewThrough * 0.82);
  alpha *= mix(1.0, 0.78, iceFade * 0.35);
  if (alpha < 0.025) {
    discard;
  }
  col *= mix(vec3(1.0), ice, 0.58);
  gl_FragColor = vec4(col, alpha);
}
`;

Effect.ShadersStore["jewelCrystalShellVertexShader"] = VERTEX;
Effect.ShadersStore["jewelCrystalShellFragmentShader"] = FRAGMENT;

export type JewelCrystalShellMaterial = ShaderMaterial;

const DEFAULT_LIGHT_POS = new Vector3(2.5, 3.2, 4.5);
const SHOWCASE_SHELL_ALPHA = 0.62;

export function createJewelCrystalShellMaterial(
  scene: Scene,
  envTexture: BaseTexture | null
): JewelCrystalShellMaterial {
  const spec = HOLOGRAM_DISPLAY_SPEC;
  const mat = new ShaderMaterial(
    "jewel-crystal-shell",
    scene,
    { vertex: "jewelCrystalShell", fragment: "jewelCrystalShell" },
    {
      attributes: ["position", "normal"],
      uniforms: [
        "worldViewProjection",
        "world",
        "view",
        "uPower",
        "uShellAlpha",
        "uGlossBoost",
        "uEnvMix",
        "uMediaReflection",
        "uIceTint",
        "uTime",
        "uOrbitLightPos",
        "uOrbitLightPos2",
        "uOrbitLightPos3",
        "uKeyLightPos",
        "uRimLightPos",
        "uBackdropAvg",
        "uBackdropBright",
        "uBackdropInfluence",
        "uShellOpacityScale",
        "uAlphaMax",
        "uViewClear",
        "uIceSuppress",
      ],
      samplers: ["uEnvColor", "uEnvMedia"],
      needAlphaBlending: true,
    }
  );
  if (envTexture) {
    mat.setTexture("uEnvColor", envTexture);
    mat.setTexture("uEnvMedia", envTexture);
  }
  mat.setFloat("uPower", 1);
  mat.setFloat("uShellAlpha", Math.max(spec.paperweightShellAlpha, SHOWCASE_SHELL_ALPHA));
  mat.setFloat("uGlossBoost", 1.72);
  mat.setFloat("uEnvMix", 0.62);
  mat.setFloat("uMediaReflection", 0.72);
  mat.setVector3("uIceTint", new Vector3(0.9, 0.96, 1));
  mat.setFloat("uTime", 0);
  mat.setVector3("uOrbitLightPos", DEFAULT_LIGHT_POS);
  mat.setVector3("uOrbitLightPos2", DEFAULT_LIGHT_POS);
  mat.setVector3("uOrbitLightPos3", DEFAULT_LIGHT_POS);
  mat.setVector3("uKeyLightPos", DEFAULT_LIGHT_POS);
  mat.setVector3("uRimLightPos", DEFAULT_LIGHT_POS);
  mat.setVector3("uBackdropAvg", new Vector3(0.05, 0.05, 0.06));
  mat.setVector3("uBackdropBright", new Vector3(0.12, 0.14, 0.18));
  mat.setFloat("uBackdropInfluence", 0);
  mat.setFloat("uShellOpacityScale", 1);
  mat.setFloat("uAlphaMax", 0.5);
  mat.setFloat("uViewClear", 0.12);
  mat.setFloat("uIceSuppress", 0);
  mat.backFaceCulling = true;
  mat.alpha = 1;
  mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
  mat.alphaMode = Engine.ALPHA_COMBINE;
  mat.forceDepthWrite = false;
  mat.disableDepthWrite = true;
  return mat;
}

export function applyConvexCrystalShellTuning(
  material: JewelCrystalShellMaterial,
  shapeId: PhotoCrystalShapeId
): void {
  const tuning = getConvexShellPhotoTuning(shapeId);
  const alphaMul = getCrystalShellAlphaMultiplier();
  const glossMul = getCrystalShellGlossMultiplier();
  const viewClear = getCrystalShellViewClearFactor();
  const iceSuppress = getCrystalShellIceSuppress();
  const reflectionScale = getCrystalBackdropReflectionScale();
  material.setFloat("uShellOpacityScale", tuning.shellOpacityScale * alphaMul);
  material.setFloat("uAlphaMax", tuning.alphaMax * Math.max(alphaMul, 0.35));
  material.setFloat("uGlossBoost", tuning.glossBoost * glossMul);
  material.setFloat("uShellAlpha", tuning.shellAlpha * alphaMul);
  material.setFloat("uViewClear", viewClear);
  material.setFloat("uIceSuppress", iceSuppress);
  material.setFloat("uEnvMix", 0.28 + reflectionScale * 0.42);
  material.setFloat("uMediaReflection", reflectionScale * 0.52);
  material.setFloat("uBackdropInfluence", reflectionScale * 0.22);
}

const INNER_SHELL_ALPHA_MUL = 0.1;
const INNER_SHELL_GLOSS_MUL = 0.32;

/** Muted inner wall — depth cue only, not a second highlight layer. */
export function createJewelCrystalShellInnerMaterial(
  scene: Scene,
  envTexture: BaseTexture | null
): JewelCrystalShellMaterial {
  const mat = createJewelCrystalShellMaterial(scene, envTexture);
  mat.name = "jewel-crystal-shell-inner";
  mat.setFloat("uShellAlpha", SHOWCASE_SHELL_ALPHA * INNER_SHELL_ALPHA_MUL);
  mat.setFloat("uGlossBoost", 0.72);
  mat.alphaMode = Engine.ALPHA_COMBINE;
  return mat;
}

function applyInnerShellTick(
  inner: JewelCrystalShellMaterial,
  p: number,
  uPower: number,
  timeSec: number,
  lights: ShowcaseShellLightSnapshot | undefined,
  tuning: ReturnType<typeof getCurrentHarmonyTuning>,
  mediaActive: boolean,
  sample: ReturnType<typeof getSmoothedBackdropSample>,
  glossBoostFallback: number
): void {
  inner.setFloat("uPower", uPower * 0.82);
  inner.setFloat("uTime", timeSec);

  if (mediaActive && sample && tuning) {
    inner.setFloat("uShellAlpha", tuning.shellAlpha * INNER_SHELL_ALPHA_MUL);
    inner.setFloat("uGlossBoost", (tuning.glossBoost + p * 0.35) * INNER_SHELL_GLOSS_MUL);
    inner.setFloat("uEnvMix", tuning.envMix * 0.7);
    applyUserCrystalSurfaceColor(inner);
    const { crystalBackdropBlend } = getShowcaseCatalogColorState();
    const mediaStrength = Math.max(0, Math.min(1, getHarmonyInfluence() * crystalBackdropBlend));
    inner.setFloat("uMediaReflection", mediaStrength * 0.55);
    const ambientInfluence = getHarmonyInfluence() * crystalBackdropBlend * 0.35;
    inner.setVector3(
      "uBackdropAvg",
      new Vector3(sample.average.r, sample.average.g, sample.average.b)
    );
    inner.setVector3(
      "uBackdropBright",
      new Vector3(sample.bright.r, sample.bright.g, sample.bright.b)
    );
    inner.setFloat("uBackdropInfluence", ambientInfluence * 0.45);
  } else {
    applyUserCrystalSurfaceColor(inner);
    inner.setFloat("uMediaReflection", 0);
    inner.setFloat("uGlossBoost", glossBoostFallback * INNER_SHELL_GLOSS_MUL);
    inner.setFloat("uBackdropInfluence", 0);
  }

  if (lights) {
    inner.setVector3("uOrbitLightPos", lights.orbit);
    inner.setVector3("uOrbitLightPos2", lights.orbit2);
    inner.setVector3("uOrbitLightPos3", lights.orbit3);
    inner.setVector3("uKeyLightPos", lights.key);
    inner.setVector3("uRimLightPos", lights.rim);
  }
}

export function setJewelCrystalShellEnv(
  material: JewelCrystalShellMaterial,
  envTexture: BaseTexture | null
): void {
  setJewelCrystalShellEnvMaps(material, envTexture, envTexture);
}

export function setJewelCrystalShellEnvMaps(
  material: JewelCrystalShellMaterial,
  colorEnv: BaseTexture | null,
  mediaEnv: BaseTexture | null
): void {
  if (colorEnv) {
    material.setTexture("uEnvColor", colorEnv);
  }
  if (mediaEnv) {
    material.setTexture("uEnvMedia", mediaEnv);
  }
}

export function tickJewelCrystalShellMaterial(
  material: JewelCrystalShellMaterial,
  timeSec: number,
  power: number,
  lights?: ShowcaseShellLightSnapshot,
  innerMaterial?: JewelCrystalShellMaterial | null,
  shapeId?: PhotoCrystalShapeId
): void {
  const p = Math.max(0, Math.min(1, power));
  const uPower = 0.88 + p * 0.52;
  material.setFloat("uPower", uPower);

  const backdrop = getShowcaseBackgroundLightingState();
  const sample = getSmoothedBackdropSample();
  const tuning = getCurrentHarmonyTuning();
  const glossBoostFallback = 1.55 + p * 1.85;
  const convexTuning = shapeId ? getConvexShellPhotoTuning(shapeId) : null;

  if (backdrop.mediaActive && sample && tuning) {
    if (convexTuning) {
      applyConvexCrystalShellTuning(material, shapeId!);
    } else {
      applyCrystalHarmonyToShell(material, tuning, p);
    }
    applyUserCrystalSurfaceColor(material);
    const { crystalBackdropBlend } = getShowcaseCatalogColorState();
    const ambientInfluence = getHarmonyInfluence() * crystalBackdropBlend * 0.35;
    applyCrystalMediaReflectionStrength(material);
    if (convexTuning) {
      const strength = Math.max(
        0,
        Math.min(1, getHarmonyInfluence() * crystalBackdropBlend)
      );
      const reflectionScale = getCrystalBackdropReflectionScale();
      material.setFloat("uMediaReflection", strength * reflectionScale * 0.72);
      material.setFloat("uBackdropInfluence", ambientInfluence * reflectionScale * 0.85);
      material.setFloat("uEnvMix", 0.28 + reflectionScale * 0.42);
    } else {
      material.setFloat("uBackdropInfluence", ambientInfluence);
    }
    material.setVector3(
      "uBackdropAvg",
      new Vector3(sample.average.r, sample.average.g, sample.average.b)
    );
    material.setVector3(
      "uBackdropBright",
      new Vector3(sample.bright.r, sample.bright.g, sample.bright.b)
    );
  } else {
    applyUserCrystalSurfaceColor(material);
    material.setFloat("uMediaReflection", 0);
    if (convexTuning && shapeId) {
      applyConvexCrystalShellTuning(material, shapeId);
    } else {
      material.setFloat("uGlossBoost", glossBoostFallback);
    }
    material.setFloat("uBackdropInfluence", 0);
  }

  material.setFloat("uTime", timeSec);

  if (lights) {
    material.setVector3("uOrbitLightPos", lights.orbit);
    material.setVector3("uOrbitLightPos2", lights.orbit2);
    material.setVector3("uOrbitLightPos3", lights.orbit3);
    material.setVector3("uKeyLightPos", lights.key);
    material.setVector3("uRimLightPos", lights.rim);
  }

  if (innerMaterial) {
    applyInnerShellTick(
      innerMaterial,
      p,
      uPower,
      timeSec,
      lights,
      tuning,
      backdrop.mediaActive,
      sample,
      glossBoostFallback
    );
    if (convexTuning && shapeId) {
      innerMaterial.setFloat("uShellOpacityScale", convexTuning.shellOpacityScale * 0.55);
      innerMaterial.setFloat("uAlphaMax", convexTuning.alphaMax * 0.42);
    }
  }
}
