import { Effect } from "@babylonjs/core/Materials/effect";
import { Material } from "@babylonjs/core/Materials/material";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HOLOGRAM_DISPLAY_SPEC, HOLOGRAM_FRAME_UV } from "@mbox/shared";
import type { ShowcaseShellLightSnapshot } from "../showcaseJewelLighting";
import type { PhotoCrystalShapeId } from "../photoCrystalShapeCatalog";
import { resolvePhotoCrystalShape } from "../photoCrystalShapeCatalog";
import { getPhotoCrystalPhotoProfile, photoSilhouetteKindToShaderId } from "../photoCrystalPhotoProfile";
import { resolveJewelPhotoRasterSpec } from "../jewelPhotoRasterSpec";
import { resolveShowcaseGpuBudget } from "../../showcaseGpuProfile";
import { resolveInnerPhotoShaderNames, stripFwidthForWebGl1 } from "../showcaseWebGl1Shader";
import { isShowcaseEngineWebGl1 } from "../babylonCanvasGuard";

const VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
uniform mat4 worldViewProjection;
uniform mat4 world;
varying vec2 vUV;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;
varying vec3 vLocalNormal;
void main(void) {
  vec4 worldPos = world * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(world) * normal);
  vLocalPos = position;
  vLocalNormal = normalize(normal);
  vUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

/** GLSL ES 1.0 reserves `layout` — never use as a variable name (breaks WebGL1 photo shader). */
const FRAGMENT = `
precision highp float;
uniform sampler2D uPhoto;
uniform float uAlpha;
uniform float uPower;
uniform float uPhotoGain;
uniform float uTime;
uniform float uUseAlpha;
uniform float uFlipV;
uniform float uFrameEnabled;
uniform float uMatInset;
uniform float uFrameWidth;
uniform vec3 uFrameColor;
uniform vec3 uOrbitLightPos;
uniform vec3 uOrbitLightPos2;
uniform vec3 uOrbitLightPos3;
uniform vec3 uKeyLightPos;
uniform vec3 uRimLightPos;
uniform float uCubeBox;
uniform float uCubeHalf;
uniform vec3 uCameraPos;
uniform float uCircleMask;
uniform float uSilhouetteKind;
uniform float uPolygonSides;
uniform float uHeartScale;
uniform float uPreCropped;
uniform float uPhotoAspect;
uniform float uPhotoViewportFill;
uniform float uEdgeSoftness;
uniform float uCubeFace;
varying vec2 vUV;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;
varying vec3 vLocalNormal;

float lightGlint(vec3 n, vec3 lightPos, float shininess, float weight) {
  vec3 l = normalize(lightPos - vWorldPos);
  return pow(max(dot(n, l), 0.0), shininess) * weight;
}

vec2 orientedUv(vec2 uv) {
  return vec2(uv.x, mix(uv.y, 1.0 - uv.y, uFlipV));
}

/** Local-space, world-Y-up on every face — rotates with cube, no 90° axis jumps. */
vec2 cubeLocalPhotoUv(vec3 localPos, vec3 localN) {
  vec3 upRef = vec3(0.0, 1.0, 0.0);
  vec3 tangent = cross(upRef, localN);
  if (dot(tangent, tangent) < 1e-5) {
    tangent = cross(vec3(0.0, 0.0, 1.0), localN);
  }
  tangent = normalize(tangent);
  vec3 bitangent = normalize(cross(localN, tangent));
  float u = dot(localPos, tangent) / max(uCubeHalf * 2.0, 0.001) + 0.5;
  float v = dot(localPos, bitangent) / max(uCubeHalf * 2.0, 0.001) + 0.5;
  return vec2(u, v);
}

vec2 jewelPlateUv(vec2 meshUv, vec3 n) {
  if (uCubeBox > 0.5) return cubeLocalPhotoUv(vLocalPos, vLocalNormal);
  return orientedUv(meshUv);
}

float photoRegionStart() {
  if (uFrameEnabled < 0.5) {
    return 0.0;
  }
  return uMatInset + uFrameWidth;
}

vec2 photoUvContainAspect(vec2 uv, float aspect) {
  vec2 p = uv;
  if (aspect > 1.0) {
    float scale = 1.0 / aspect;
    p.y = (p.y - 0.5) / scale + 0.5;
  } else if (aspect < 1.0) {
    float scale = aspect;
    p.x = (p.x - 0.5) / scale + 0.5;
  }
  return p;
}

/** Map framed square face UV → 0–1 photo texture (no aspect stretch). */
vec2 mapCubeFacePhotoUv(vec2 meshUv, vec3 n) {
  float inner = photoRegionStart();
  vec2 base = jewelPlateUv(meshUv, n);
  return (base - inner) / max(1.0 - 2.0 * inner, 0.001);
}

/** Center photo inside a 1:1 face — fill 0.7 → 70% span, centered. */
vec2 photoUvSquareFill(vec2 uv, float fill) {
  float safeFill = max(fill, 0.1);
  return (uv - 0.5) / safeFill + 0.5;
}

bool photoUvInRange(vec2 p) {
  return p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0;
}

vec2 mapToPhotoUv(vec2 meshUv, vec3 n) {
  if (uCubeFace > 0.5) {
    return mapCubeFacePhotoUv(meshUv, n);
  }
  float inner = photoRegionStart();
  vec2 base = jewelPlateUv(meshUv, n);
  vec2 photoUv = (base - inner) / max(1.0 - 2.0 * inner, 0.001);
  photoUv = photoUvSquareFill(photoUv, uPhotoViewportFill);
  return photoUvContainAspect(photoUv, uPhotoAspect);
}

/** Plate-baked crop uses 1:1 UV; legacy cube path keeps mat/frame inset. */
vec2 resolvePhotoSampleUv(vec2 meshUv, vec3 n) {
  if (uPreCropped > 0.5) {
    return jewelPlateUv(meshUv, n);
  }
  return mapToPhotoUv(meshUv, n);
}

void applyCircleMaskDiscard(vec2 uv) {
  float dist = length(uv - 0.5);
  float fw = max(fwidth(dist), 0.001);
  if (dist > 0.5 + fw) {
    discard;
  }
}

/** Distance from silhouette edge (positive inside), UV space 0–1. */
float rectSilhouetteDist(vec2 uv) {
  vec2 edge = min(uv, 1.0 - uv);
  return min(edge.x, edge.y);
}

float circleSilhouetteDist(vec2 uv) {
  return 0.5 - length(uv - 0.5);
}

/** Classic heart SDF → border distance (positive inside). */
float heartSilhouetteDistLocal(vec2 pos, float scale) {
  vec2 p = pos / max(scale, 0.001);
  p.x = abs(p.x);
  float d;
  if (p.y + p.x > 1.0) {
    d = length(p - vec2(0.25, 0.75)) - 0.35355339;
  } else {
    d = sqrt(min(dot(p - vec2(0.0, 1.0), p - vec2(0.0, 1.0)),
                 dot(p - 0.5 * max(p.x + p.y, 0.0), p - 0.5 * max(p.x + p.y, 0.0)))) *
        sign(p.x - p.y);
  }
  return -d * scale;
}

float polygonSilhouetteDist(vec2 uv, float sides) {
  vec2 p = (uv - 0.5) * 2.0;
  // Flat-top hex (prism front face) — rotate vs pointy-top default.
  if (abs(sides - 6.0) < 0.5) {
    p = vec2(p.y * 0.8660254, p.x);
  }
  float an = 3.14159265 / max(sides, 3.0);
  float bn = atan(p.x, p.y) + an;
  bn = mod(bn, 2.0 * an) - an;
  float r = 0.9;
  return r * cos(bn) - length(p);
}

float silhouetteBorderDist(vec2 uv, vec3 localPos) {
  // Heart mesh clips fragments — bbox frame only (no mismatched SDF).
  if (uSilhouetteKind > 1.5 && uSilhouetteKind < 2.5 && uPreCropped > 0.5) {
    return rectSilhouetteDist(uv);
  }
  if (uSilhouetteKind < 0.5) {
    return rectSilhouetteDist(uv);
  }
  if (uSilhouetteKind < 1.5) {
    return circleSilhouetteDist(uv);
  }
  if (uSilhouetteKind < 2.5) {
    return heartSilhouetteDistLocal(localPos.xy, uHeartScale);
  }
  return polygonSilhouetteDist(uv, uPolygonSides);
}

vec3 etchedFrameColor(vec2 uv, float glint) {
  vec3 ice = vec3(0.84, 0.9, 0.98);
  vec3 silver = mix(uFrameColor, ice, 0.18);
  float facet = 0.58 + 0.42 * sin(atan(uv.y - 0.5, uv.x - 0.5) * 8.0 + uTime * 1.4);
  float bevel = smoothstep(photoRegionStart() - uFrameWidth * 0.35, photoRegionStart(), silhouetteBorderDist(uv, vLocalPos));
  return silver * mix(0.96, 1.18, facet * bevel) + vec3(1.0) * glint * 0.32;
}

void applySilhouetteDiscard(vec2 uv, vec3 localPos, float matInset) {
  float border = silhouetteBorderDist(uv, localPos);
  float fw = max(fwidth(border), 0.0008);
  if (border < matInset - fw) {
    discard;
  }
}

float photoEdgeFeather(vec2 photoUv, float softness) {
  if (softness <= 0.0001) {
    return 1.0;
  }
  vec2 edge = min(photoUv, 1.0 - photoUv);
  float d = min(edge.x, edge.y);
  float fw = max(fwidth(d), 0.0005);
  return smoothstep(0.0, softness + fw, d);
}

void main(void) {
  vec2 uv = vUV;
  vec2 plateUv = jewelPlateUv(uv, vWorldNormal);
  float border = silhouetteBorderDist(plateUv, vLocalPos);
  float inner = photoRegionStart();
  float frameW = max(fwidth(border), 0.0008);

  vec3 n = normalize(vWorldNormal);
  float camDist = length(uCameraPos - vWorldPos);
  float zoomAtten = smoothstep(1.2, 4.5, camDist);

  float glint =
    lightGlint(n, uOrbitLightPos, 10.0, 0.12) +
    lightGlint(n, uOrbitLightPos2, 12.0, 0.1) +
    lightGlint(n, uOrbitLightPos3, 9.0, 0.08) +
    lightGlint(n, uKeyLightPos, 14.0, 0.06) +
    lightGlint(n, uRimLightPos, 11.0, 0.05);
  glint *= zoomAtten * uPower;
  float pulse = 0.88 + 0.12 * sin(uTime * 2.4 + dot(n, vec3(3.7, 5.1, 2.9)));

  vec3 col;
  float alpha = uAlpha;
  float inPhoto = smoothstep(inner - frameW, inner + frameW * 0.5, border);

  if (uFrameEnabled > 0.5) {
    if (uCubeFace < 0.5) {
      applySilhouetteDiscard(plateUv, vLocalPos, uMatInset);
    }
    if (inPhoto < 0.02) {
      col = etchedFrameColor(plateUv, glint * pulse);
      alpha = uAlpha;
    } else {
      vec2 photoUv = resolvePhotoSampleUv(uv, n);
      if (!photoUvInRange(photoUv)) {
        col = etchedFrameColor(plateUv, glint * pulse);
        alpha = uAlpha;
      } else {
      vec4 tex = texture2D(uPhoto, photoUv);
      if (uUseAlpha > 0.5 && tex.a < 0.04) {
        discard;
      }
      float edgeFade = photoEdgeFeather(photoUv, uEdgeSoftness);
      col = tex.rgb * uPhotoGain;
      col = mix(etchedFrameColor(plateUv, glint * pulse), col, inPhoto);
      alpha = (uUseAlpha > 0.5 ? tex.a * uAlpha : uAlpha) * edgeFade;
      }
    }
  } else {
    if (uSilhouetteKind < 1.5 || uSilhouetteKind > 2.5) {
      applySilhouetteDiscard(plateUv, vLocalPos, 0.0);
    }
    if (uCircleMask > 0.5) {
      applyCircleMaskDiscard(plateUv);
    }
    vec2 photoUv = resolvePhotoSampleUv(uv, n);
    if (!photoUvInRange(photoUv)) {
      discard;
    }
    vec4 tex = texture2D(uPhoto, photoUv);
    if (uUseAlpha > 0.5 && tex.a < 0.04) {
      discard;
    }
    float edgeFade = photoEdgeFeather(photoUv, uEdgeSoftness);
    col = tex.rgb * (0.94 + 0.26 * uPower) * uPhotoGain;
    alpha = (uUseAlpha > 0.5 ? tex.a * uAlpha : uAlpha) * edgeFade;
  }

  if (uFrameEnabled > 0.5) {
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float clarityLift = clamp((uPhotoGain - 1.0) * 0.18, 0.0, 0.72);
    float faceDepth = mix(0.94, 1.0, pow(max(dot(n, viewDir), 0.0), 0.55));
    col *= mix(faceDepth, 1.0, clarityLift);
    float recess = smoothstep(uMatInset, uMatInset + 0.16, border);
    col *= mix(mix(0.9, 1.0, recess), 1.0, clarityLift * 0.92);
  }

  gl_FragColor = vec4(col, alpha);
}
`;

Effect.ShadersStore["jewelInnerPhotoVertexShader"] = VERTEX;
Effect.ShadersStore["jewelInnerPhotoFragmentShader"] = FRAGMENT;
Effect.ShadersStore["jewelInnerPhotoWebGL1FragmentShader"] = stripFwidthForWebGl1(FRAGMENT);

export type JewelInnerPhotoMaterial = ShaderMaterial;

export type JewelInnerPhotoMaterialOptions = {
  useAlpha?: boolean;
  flipV?: number;
  frameEnabled?: boolean;
  cubeBox?: boolean;
  /** Six-face cube — 1:1 photo window, no portrait aspect stretch. */
  cubeFace?: boolean;
  frameColor?: Color3;
  circleMask?: boolean;
  silhouetteKind?: number;
  polygonSides?: number;
  heartScale?: number;
  preCroppedToPlate?: boolean;
  photoAspect?: number;
  photoViewportFill?: number;
  edgeSoftness?: number;
  cubeHalf?: number;
  /** Windows / simplified GPU profile — use fragment shader without fwidth(). */
  webGl1Shader?: boolean;
};

const DEFAULT_LIGHT = new Vector3(2.5, 3.2, 4.5);
const FRAME_COLOR = new Vector3(0.88, 0.92, 0.98);
const DEFAULT_CUBE_HALF = 0.73;

export function createJewelInnerPhotoMaterial(
  scene: Scene,
  photoTexture: BaseTexture,
  options: JewelInnerPhotoMaterialOptions | boolean = {}
): JewelInnerPhotoMaterial {
  const resolved = typeof options === "boolean" ? { useAlpha: options } : options;
  const useAlpha = resolved.useAlpha ?? false;
  const edgeSoftness = resolved.edgeSoftness ?? 0;
  const preferWebGl1 =
    resolved.webGl1Shader ?? isShowcaseEngineWebGl1(scene.getEngine());
  const shaderNames = resolveInnerPhotoShaderNames(preferWebGl1);
  const mat = new ShaderMaterial(
    `jewel-inner-photo-${photoTexture.uniqueId}`,
    scene,
    shaderNames,
    {
      attributes: ["position", "normal", "uv"],
      uniforms: [
        "worldViewProjection",
        "world",
        "uAlpha",
        "uPower",
        "uPhotoGain",
        "uTime",
        "uUseAlpha",
        "uFlipV",
        "uFrameEnabled",
        "uMatInset",
        "uFrameWidth",
        "uFrameColor",
        "uOrbitLightPos",
        "uOrbitLightPos2",
        "uOrbitLightPos3",
        "uKeyLightPos",
        "uRimLightPos",
        "uCubeBox",
        "uCubeHalf",
        "uCameraPos",
        "uCircleMask",
        "uSilhouetteKind",
        "uPolygonSides",
        "uHeartScale",
        "uPreCropped",
        "uPhotoAspect",
        "uPhotoViewportFill",
        "uEdgeSoftness",
        "uCubeFace",
      ],
      samplers: ["uPhoto"],
      needAlphaBlending: useAlpha || edgeSoftness > 0.0001,
    }
  );
  applyJewelInnerPhotoMaterial(mat, photoTexture, resolved);
  return mat;
}

export function applyJewelInnerPhotoMaterial(
  material: JewelInnerPhotoMaterial,
  photoTexture: BaseTexture,
  options: JewelInnerPhotoMaterialOptions | boolean = {}
): void {
  const resolved = typeof options === "boolean" ? { useAlpha: options } : options;
  const useAlpha = resolved.useAlpha ?? false;
  const edgeSoftness = resolved.edgeSoftness ?? 0;
  material.setTexture("uPhoto", photoTexture);
  material.setFloat("uUseAlpha", useAlpha ? 1 : 0);
  material.setFloat("uAlpha", 1);
  material.setFloat("uPower", 1);
  material.setFloat("uPhotoGain", 1);
  material.setFloat("uTime", 0);
  material.setFloat("uFlipV", resolved.flipV ?? 0);
  const matInset = resolved.cubeFace
    ? HOLOGRAM_FRAME_UV.matInset * 0.42
    : HOLOGRAM_FRAME_UV.matInset;
  const frameWidth = resolved.cubeFace
    ? HOLOGRAM_FRAME_UV.frameWidth * 0.48 * 0.88
    : HOLOGRAM_FRAME_UV.frameWidth * 0.88;
  material.setFloat("uFrameEnabled", resolved.frameEnabled === false ? 0 : 1);
  material.setFloat("uMatInset", matInset);
  material.setFloat("uFrameWidth", frameWidth);
  material.setVector3(
    "uFrameColor",
    resolved.frameColor
      ? new Vector3(resolved.frameColor.r, resolved.frameColor.g, resolved.frameColor.b)
      : FRAME_COLOR
  );
  material.setVector3("uOrbitLightPos", DEFAULT_LIGHT);
  material.setVector3("uOrbitLightPos2", DEFAULT_LIGHT);
  material.setVector3("uOrbitLightPos3", DEFAULT_LIGHT);
  material.setVector3("uKeyLightPos", DEFAULT_LIGHT);
  material.setVector3("uRimLightPos", DEFAULT_LIGHT);
  material.setFloat("uCubeBox", resolved.cubeBox ? 1 : 0);
  material.setFloat("uCubeFace", resolved.cubeFace ? 1 : 0);
  material.setFloat("uCubeHalf", resolved.cubeHalf ?? DEFAULT_CUBE_HALF);
  material.setVector3("uCameraPos", DEFAULT_LIGHT);
  material.setFloat("uCircleMask", resolved.circleMask ? 1 : 0);
  material.setFloat("uSilhouetteKind", resolved.silhouetteKind ?? 0);
  material.setFloat("uPolygonSides", resolved.polygonSides ?? 6);
  material.setFloat("uHeartScale", resolved.heartScale ?? 1);
  material.setFloat("uPreCropped", resolved.preCroppedToPlate ? 1 : 0);
  material.setFloat("uPhotoAspect", resolved.photoAspect ?? 1);
  material.setFloat(
    "uPhotoViewportFill",
    resolved.photoViewportFill ?? HOLOGRAM_DISPLAY_SPEC.photoFaceViewportFill
  );
  material.setFloat("uEdgeSoftness", edgeSoftness);
  material.backFaceCulling = true;
  material.forceDepthWrite = true;
  // Negative offset — inner photos sit inside the shell, not in front of the glass.
  material.zOffset = resolved.cubeBox ? -2 : -3;
  const needsBlend = useAlpha || edgeSoftness > 0.0001;
  material.metadata = { ...(material.metadata ?? {}), innerPhotoNeedsBlend: needsBlend };
  material.transparencyMode = needsBlend
    ? Material.MATERIAL_ALPHABLEND
    : Material.MATERIAL_OPAQUE;
}

export type InnerPhotoFrameOptions = {
  enabled: boolean;
  color?: Color3;
};

export function getInnerPhotoMaterialOptions(
  shapeId: PhotoCrystalShapeId,
  layout: "cube" | "portrait",
  useAlpha: boolean,
  frame?: InnerPhotoFrameOptions & {
    circleMask?: boolean;
    silhouetteKind?: number;
    polygonSides?: number;
    heartScale?: number;
    preCroppedToPlate?: boolean;
    photoAspect?: number;
    photoViewportFill?: number;
    cubeHalf?: number;
    cubeBox?: boolean;
    cubeFace?: boolean;
  }
): JewelInnerPhotoMaterialOptions {
  const profile = getPhotoCrystalPhotoProfile(shapeId);
  const shapeSpec = resolvePhotoCrystalShape(shapeId);
  const isCubeLayout = layout === "cube";
  const textureBudget = resolveShowcaseGpuBudget();
  const rasterSpec = resolveJewelPhotoRasterSpec(shapeId, isCubeLayout ? "cube" : "portrait", {
    textureMaxEdge: textureBudget.textureMaxEdge,
    cubeTextureSize: textureBudget.cubeTextureSize,
  });
  const preCropped = rasterSpec.preCroppedToPlate;
  return {
    useAlpha,
    flipV: 0,
    frameEnabled: profile.frameEnabled && frame?.enabled !== false,
    cubeBox: frame?.cubeBox ?? isCubeLayout,
    cubeFace: frame?.cubeFace ?? isCubeLayout,
    cubeHalf: frame?.cubeHalf,
    frameColor: frame?.color,
    circleMask: frame?.circleMask ?? false,
    silhouetteKind: frame?.silhouetteKind ?? photoSilhouetteKindToShaderId(profile.silhouette),
    polygonSides: frame?.polygonSides ?? profile.polygonSides ?? 6,
    heartScale: frame?.heartScale ?? 1,
    preCroppedToPlate: frame?.preCroppedToPlate ?? preCropped,
    photoAspect: isCubeLayout
      ? 1
      : preCropped
        ? 1
        : frame?.photoAspect ?? shapeSpec.portraitAspect,
    photoViewportFill: isCubeLayout
      ? 1
      : preCropped
        ? 1
        : frame?.photoViewportFill ??
          profile.photoViewportFill ??
          HOLOGRAM_DISPLAY_SPEC.photoFaceViewportFill,
    edgeSoftness: isCubeLayout ? 0 : profile.edgeSoftness,
  };
}

export function setJewelInnerPhotoFrameColor(
  material: JewelInnerPhotoMaterial,
  color: Color3
): void {
  material.setVector3("uFrameColor", new Vector3(color.r, color.g, color.b));
}

export function setJewelInnerPhotoFrameEnabled(
  material: JewelInnerPhotoMaterial,
  enabled: boolean
): void {
  material.setFloat("uFrameEnabled", enabled ? 1 : 0);
}

export function setJewelInnerPhotoAlpha(material: JewelInnerPhotoMaterial, alpha: number): void {
  const a = Math.max(0, Math.min(1, alpha));
  material.setFloat("uAlpha", a);
  const needsBlend =
    a < 0.995 ||
    Boolean(
      (material.metadata as { innerPhotoNeedsBlend?: boolean } | undefined)?.innerPhotoNeedsBlend
    );
  material.transparencyMode = needsBlend
    ? Material.MATERIAL_ALPHABLEND
    : Material.MATERIAL_OPAQUE;
  material.forceDepthWrite = !needsBlend && a > 0.995;
}

export type JewelInnerPhotoTickContext = {
  cubeHalf?: number;
  cameraPos?: Vector3;
};

export function tickJewelInnerPhotoMaterial(
  material: JewelInnerPhotoMaterial,
  timeSec: number,
  power: number,
  lights?: ShowcaseShellLightSnapshot,
  ctx?: JewelInnerPhotoTickContext
): void {
  const p = Math.max(0, Math.min(1, power));
  material.setFloat("uPower", 0.62 + p * 0.22);
  material.setFloat("uTime", timeSec);
  if (ctx?.cameraPos) {
    material.setVector3("uCameraPos", ctx.cameraPos);
  }
  if (ctx?.cubeHalf !== undefined) {
    material.setFloat("uCubeHalf", ctx.cubeHalf);
  }
  if (lights) {
    material.setVector3("uOrbitLightPos", lights.orbit);
    material.setVector3("uOrbitLightPos2", lights.orbit2);
    material.setVector3("uOrbitLightPos3", lights.orbit3);
    material.setVector3("uKeyLightPos", lights.key);
    material.setVector3("uRimLightPos", lights.rim);
  }
}
