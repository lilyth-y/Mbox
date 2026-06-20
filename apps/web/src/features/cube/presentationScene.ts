import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  type CubeFrameFinishId,
  type CubeFramePresetId,
  CUBE_FACE_PHOTO_Z,
  CUBE_FOCUS_PULSE_Z_MAX,
  CUBE_PARALLAX_PEAK_MAX,
  CUBE_VOLUMAX_MOUNT_MODE,
  clampCubeSizeScale,
  isTransparentMatteDataUrl,
  isVoluMaxCutoutReady,
  resolveSubjectForegroundUrl,
  getOrbitalFaceLayouts,
  type OrbitalShapeId,
  showcaseHoldParallaxEnvelope,
} from "@mbox/shared";
import { createFaceClipMaterial } from "./cubeFaceClipMaterial";
import {
  auditAllCubeFaceRigs,
  type CubeFaceIntegrityReport,
  type CubeFaceRigAuditInput,
} from "./cubeFaceIntegrity";
import type { ProcessedImage } from "../../shared/types";
import { createDepthTexture, createFallbackDepthTexture } from "../../shared/lib/depthTexture";
import type { PresentationEffectId } from "./presentationEffects";
import {
  CUBE_EDGE_LENGTH,
  CUBE_FACE_COUNT,
  getPresentationFace,
  PARALLAX_MAX,
} from "./cubeSequence";
import {
  canMountPlateBackedForeground,
  canMountVoluMaxDualLayer,
  canUseDualLayerParallax,
} from "../../shared/lib/cutoutPresentation";
import { hasDepthSeparationBoost } from "../../shared/lib/subjectPortrait";
import { configurePresentationTexture } from "./presentationTextures";
import {
  createDualLayerParallaxMaterial,
  isDualLayerParallaxMaterial,
  setDualLayerFramePreset,
  setDualLayerParallaxAmount,
  updateDualLayerParallaxMaterial,
  type DualLayerParallaxOptions,
} from "./cubeDualLayerParallaxMaterial";
import {
  createParallaxMaterial,
  isParallaxMaterial,
  setParallaxAmount,
  setParallaxFramePreset,
  type ParallaxMaterialOptions,
} from "./cubeParallaxMaterial";
import {
  createFramedFlatMaterial,
  updateFramedFlatMaterialFrame,
} from "./framedFlatMaterial";
import {
  createCubeParticles,
  type CubeParticlesSystem,
  type ParticleThemeId,
} from "./cubeParticles";
import {
  createCs5FxRig,
  DEFAULT_CS5_FX_OPTIONS,
  type Cs5FxOptions,
} from "./cs5Fx";
import { ORBITAL_PIVOT_USERDATA_KEY } from "./orbitalPivot";
import { createHologramWireframeRig } from "./microModules/hologramWireframeEdges";
import {
  createCubeFaceGarlandBorder,
  type CubeFaceGarlandHandle,
} from "./cubeFaceGarlandBorder";
import {
  createCubeFaceCaption,
  type CubeFaceCaptionHandle,
} from "./cubeFaceCaption";
import type { FanPhase } from "./fanTiming";
import { gradientAccentRgb } from "./presentationGradient";
import { parseFrameColorHex } from "./frameColorUniforms";
import { frameBorderScale, type FrameBorderWidthId } from "./frameBorderWidth";
import {
  frameFinishUniformValue,
  isFrameBorderVisible,
} from "./frameFinishUniforms";
import {
  applyFaceLacquerLightToRoot,
} from "./faceLacquerUniforms";
import {
  applyCubeFrameShellFinishProps,
  createCubeFrameShellMaterial,
  isCubeFrameShellMaterial,
  updateCubeFrameShellLighting,
} from "./cubeFrameShellMaterial";
import {
  presentationFocusForImage,
  volumaxDualLayerOptions,
} from "./volumaxAnimation";
import {
  applyFaceUvInsetToMesh,
  buildCubeFaceLayouts,
  CUBE_FRAME_MESH_SCALE,
  applyShellFrameModeToMesh,
  resolveCubeFaceLayoutMetrics,
  type CubeFaceLayoutMetrics,
} from "./cubeFaceLayout";

function parallaxOptionsForImage(
  image: ProcessedImage,
  framePresetId: CubeFramePresetId,
  hologramMode: boolean = false
): ParallaxMaterialOptions {
  return {
    portraitBoost: hasDepthSeparationBoost(image),
    subjectBounds: image.subject.bounds,
    framePresetId,
    hologramMode,
  };
}

const DEFAULT_FOCUS_CENTER = { x: 50, y: 50 } as const;

/** Framed default at scene build; `setFrameFinish("none")` snaps to tight full-bleed cube. */
const FRAMED_FACE_LAYOUT = resolveCubeFaceLayoutMetrics(true);
const CUBE_FACE_PLANE_SIZE = FRAMED_FACE_LAYOUT.planeSize;

/** Updated by `setFrameFinish` — reapplied after every face material rebuild. */
let activeFaceLayoutMetrics: CubeFaceLayoutMetrics = resolveCubeFaceLayoutMetrics(false);
let activeFrameFinishId: CubeFrameFinishId = "none";

const FRAME_OUTER_COLORS: Record<CubeFramePresetId, number> = {
  rose_gold: 0xe5b3b3,
  pearl_white: 0xe2e8f0,
  classic_black: 0x3a3a3a,
  sage_garden: 0x8aa882,
  royal_navy: 0x2a4568,
};

function createFrameShellMaterial(
  color: number,
  finishId: CubeFrameFinishId = "glossy"
): THREE.ShaderMaterial {
  return createCubeFrameShellMaterial(color, finishId);
}

const FACE_GARLAND_Z = CUBE_FACE_PHOTO_Z + 0.014;

interface CubeFaceRig {
  faceIndex: number;
  group: THREE.Group;
  fgMesh: THREE.Mesh;
  bgMesh: THREE.Mesh;
  backPlateMesh: THREE.Mesh;
  fgMaterial: THREE.Material;
  /** Full-scene plate — mesh fallback when not using displacement shader. */
  bgMaterial: THREE.Material;
  /** flat = single photo; volumax_disp = VoluMax UV warp shader; volumax_mesh = legacy Z-split meshes. */
  mode: "flat" | "volumax_disp" | "volumax_mesh";
  imageSlot: number;
  /** Plane scale from `applyCubeFaceLayoutToRigs` — preserved across motion sync. */
  facePlaneScale: number;
  /** Local Z for photo plane at rest (framed faces sit farther out). */
  facePhotoZ: number;
  /** Local Z for bg plate / back-plate (behind photo). */
  faceBgZ: number;
  lastParallax: number;
  lastFocusPulse: number;
  garland?: CubeFaceGarlandHandle;
  caption?: CubeFaceCaptionHandle;
}

function faceMaterial(mesh: THREE.Mesh): THREE.Material {
  const material = mesh.material;
  return Array.isArray(material) ? material[0]! : material;
}

function voluMaxParallaxNorm(amount: number): number {
  return Math.min(1, Math.max(0, amount / CUBE_PARALLAX_PEAK_MAX));
}

function rigFacePlaneScale(rig: CubeFaceRig): number {
  return rig.facePlaneScale > 0 ? rig.facePlaneScale : 1;
}

function rigFacePhotoZ(rig: CubeFaceRig): number {
  return rig.facePhotoZ > 0 ? rig.facePhotoZ : FACE_PHOTO_Z;
}

function rigFaceBgZ(rig: CubeFaceRig): number {
  return rig.faceBgZ;
}

/** Full-bleed face planes — frame inset is shader-only when a border is active. */
function rigContentScale(_rig: CubeFaceRig): number {
  return 1;
}

/** AI silhouette matte on fg mesh — must never take the full-photo scale-pop path. */
function isCutoutMatteFaceMaterial(material: THREE.Material): boolean {
  if (isDualLayerParallaxMaterial(material)) {
    return (material.uniforms.uTrustFgAlpha?.value ?? 0) > 0.5;
  }
  if (material instanceof THREE.ShaderMaterial && material.uniforms?.uPhotoInsetExpand) {
    return (material.uniforms.uPhotoInsetExpand.value ?? 1) < 0.5 && material.transparent;
  }
  if (material instanceof THREE.MeshBasicMaterial && material.transparent) {
    return Boolean(material.alphaMap ?? material.map);
  }
  return false;
}

/** AI cutout: mesh split (coplanar fg/bg). Disp UV warp misaligns subject from plate at rest. */
function resolveVoluMaxMountMode(image: ProcessedImage): "disp" | "mesh" {
  if (isVoluMaxCutoutReady(image)) {
    return "mesh";
  }
  return CUBE_VOLUMAX_MOUNT_MODE;
}

function applyRigPlaneScaleToFaceMeshes(rig: CubeFaceRig): void {
  const planeScale = rigFacePlaneScale(rig);
  const photoZ = rigFacePhotoZ(rig);
  const bgZ = rigFaceBgZ(rig);
  rig.fgMesh.scale.set(planeScale, planeScale, 1);
  rig.bgMesh.scale.set(planeScale, planeScale, 1);
  rig.fgMesh.position.set(0, 0, photoZ);
  rig.bgMesh.position.set(0, 0, bgZ);
}

function disposeFaceMaterial(material: THREE.Material): void {
  material.dispose();
}

/** Bg plate behind fg matte — slight Z split so alpha holes reveal the plate. */
function applyCutoutCoplanarStack(rig: CubeFaceRig, focusPulse = 0): void {
  const photoZ = rigFacePhotoZ(rig);
  const fgZ = photoZ + focusPulse * CUBE_FOCUS_PULSE_Z_MAX;
  const bgZ = photoZ - 0.004;
  rig.fgMesh.position.set(0, 0, fgZ);
  rig.bgMesh.position.set(0, 0, bgZ);
  rig.fgMesh.renderOrder = 10;
  rig.bgMesh.renderOrder = 9;
  for (const mesh of [rig.fgMesh, rig.bgMesh]) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      material.polygonOffset = false;
      material.depthTest = true;
      material.side = THREE.FrontSide;
    }
  }
  const fgMat = faceMaterial(rig.fgMesh);
  fgMat.depthWrite = false;
  const bgMat = faceMaterial(rig.bgMesh);
  bgMat.depthWrite = false;
}

/** Photo plane wins depth buffer over cube shell and bg plates during rotation. */
function applyFacePhotoDepthBias(mesh: THREE.Mesh, doubleSided = true): void {
  mesh.renderOrder = 10;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = -4;
    material.polygonOffsetUnits = -8;
    if (!material.transparent) {
      material.depthWrite = true;
    }
    material.depthTest = true;
    material.side = doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  }
}

/** Bg / back-plate must not occlude the photo plane in the depth buffer. */
function applyFaceBgDepthBias(mesh: THREE.Mesh): void {
  mesh.renderOrder = 0;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = 2;
    material.polygonOffsetUnits = 4;
    material.depthWrite = false;
    material.depthTest = true;
    material.side = THREE.FrontSide;
  }
}

function textureFromFaceMaterial(material: THREE.Material): THREE.Texture | null {
  if (material instanceof THREE.MeshBasicMaterial) {
    return material.map;
  }
  if (isDualLayerParallaxMaterial(material)) {
    return material.uniforms.uFgTexture.value as THREE.Texture;
  }
  if (material instanceof THREE.ShaderMaterial && material.uniforms?.uTexture) {
    return material.uniforms.uTexture.value as THREE.Texture;
  }
  return null;
}

function dualLayerTexturesFromMaterial(
  material: THREE.Material
): { fg: THREE.Texture; bg: THREE.Texture } | null {
  if (!isDualLayerParallaxMaterial(material)) {
    return null;
  }
  return {
    fg: material.uniforms.uFgTexture.value as THREE.Texture,
    bg: material.uniforms.uBgTexture.value as THREE.Texture,
  };
}

/** Photo planes sit flush on the cube face (local Z) — framework constants. */
const FACE_PHOTO_Z = CUBE_FACE_PHOTO_Z;

/** Framed face shader for 3D preview and hologram export (hologramMode selects GLSL variant). */
function createCubeFacePhotoMaterial(
  texture: THREE.Texture,
  framePresetId: CubeFramePresetId,
  hologramMode: boolean,
  transparent = false,
  _image?: ProcessedImage
): THREE.Material {
  configurePresentationTexture(texture);
  const useTransparent = transparent;
  const material = createFramedFlatMaterial(texture, framePresetId, hologramMode, {
    photoInsetExpand: useTransparent ? 0 : 1,
  });
  material.transparent = useTransparent;
  material.depthWrite = !useTransparent;
  if (!useTransparent) {
    material.side = THREE.DoubleSide;
  } else {
    material.side = THREE.FrontSide;
  }
  if (useTransparent) {
    material.alphaTest = 0.04;
  }
  return material;
}

function mountFramedFlatFace(
  rig: CubeFaceRig,
  texture: THREE.Texture,
  framePresetId: CubeFramePresetId,
  hologramMode: boolean,
  image?: ProcessedImage,
  plateBackTexture?: THREE.Texture | null
): void {
  const prior = faceMaterial(rig.fgMesh);
  const priorBg = faceMaterial(rig.bgMesh);
  const plateBack = plateBackTexture ?? null;
  if (
    rig.mode === "flat" &&
    textureFromFaceMaterial(prior) === texture &&
    textureFromFaceMaterial(priorBg) === plateBack &&
    !isDualLayerParallaxMaterial(prior)
  ) {
    return;
  }
  // Avoid shader/material churn at step transitions: update uTexture in-place when possible.
  if (
    prior instanceof THREE.ShaderMaterial &&
    !isDualLayerParallaxMaterial(prior) &&
    prior.uniforms?.uTexture &&
    prior.uniforms?.uPhotoInsetExpand
  ) {
    configurePresentationTexture(texture);
    prior.uniforms.uTexture.value = texture;
    prior.uniforms.uPhotoInsetExpand.value = 1;
    if (prior.uniforms.uHologramMode) {
      prior.uniforms.uHologramMode.value = hologramMode ? 1.0 : 0.0;
    }
    updateFramedFlatMaterialFrame(prior, framePresetId);
    prior.transparent = false;
    prior.depthWrite = true;
    prior.side = THREE.DoubleSide;
    prior.alphaTest = 0;
    rig.fgMesh.material = prior;
    rig.fgMaterial = prior;
  } else {
    if (isDualLayerParallaxMaterial(prior) || prior instanceof THREE.ShaderMaterial) {
      disposeFaceMaterial(prior);
    } else if (prior instanceof THREE.MeshBasicMaterial && prior.map !== texture) {
      disposeFaceMaterial(prior);
    }
    const material = createCubeFacePhotoMaterial(texture, framePresetId, hologramMode, false, image);
    rig.fgMesh.material = material;
    rig.fgMaterial = material;
  }
  applyFacePhotoDepthBias(rig.fgMesh, true);
  rig.fgMesh.visible = true;
  if (plateBack) {
    if (priorBg instanceof THREE.ShaderMaterial && priorBg.uniforms?.uTexture) {
      configurePresentationTexture(plateBack);
      priorBg.uniforms.uTexture.value = plateBack;
      priorBg.transparent = false;
      priorBg.depthWrite = false;
      priorBg.alphaTest = 0;
      priorBg.side = THREE.FrontSide;
      rig.bgMesh.material = priorBg;
      rig.bgMaterial = priorBg;
    } else {
      if (priorBg instanceof THREE.Material && textureFromFaceMaterial(priorBg) !== plateBack) {
        disposeFaceMaterial(priorBg);
      }
      const bgMat = createFaceClipMaterial(plateBack, {
        transparent: false,
        alphaTest: 0,
        depthWrite: false,
      });
      bgMat.side = THREE.FrontSide;
      rig.bgMesh.material = bgMat;
      rig.bgMaterial = bgMat;
    }
    applyFaceBgDepthBias(rig.bgMesh);
    rig.bgMesh.material.side = THREE.FrontSide;
    rig.bgMesh.visible = true;
    rig.bgMesh.position.set(0, 0, rigFaceBgZ(rig));
  } else {
    rig.bgMesh.visible = false;
  }
  rig.backPlateMesh.visible = false;
  rig.mode = "flat";
  rig.fgMesh.position.set(0, 0, rigFacePhotoZ(rig));
  rig.fgMesh.scale.set(1, 1, 1);
}

/** VoluMax-style split: original bg plate (MeshBasic) + subject matte (framed, transparent). */
function mountVolumaxMeshFace(
  rig: CubeFaceRig,
  matteTexture: THREE.Texture,
  plateTexture: THREE.Texture,
  framePresetId: CubeFramePresetId,
  hologramMode: boolean,
  image?: ProcessedImage
): void {
  const priorFg = faceMaterial(rig.fgMesh);
  const priorBg = faceMaterial(rig.bgMesh);
  if (
    rig.mode === "volumax_mesh" &&
    textureFromFaceMaterial(priorFg) === matteTexture &&
    textureFromFaceMaterial(priorBg) === plateTexture
  ) {
    return;
  }
  // Avoid shader/material churn at step transitions: update uTexture in-place when possible.
  if (
    priorFg instanceof THREE.ShaderMaterial &&
    !isDualLayerParallaxMaterial(priorFg) &&
    priorFg.uniforms?.uTexture &&
    priorFg.uniforms?.uPhotoInsetExpand
  ) {
    configurePresentationTexture(matteTexture);
    priorFg.uniforms.uTexture.value = matteTexture;
    priorFg.uniforms.uPhotoInsetExpand.value = 0;
    if (priorFg.uniforms.uHologramMode) {
      priorFg.uniforms.uHologramMode.value = hologramMode ? 1.0 : 0.0;
    }
    updateFramedFlatMaterialFrame(priorFg, framePresetId);
    priorFg.transparent = true;
    priorFg.depthWrite = false;
    priorFg.side = THREE.FrontSide;
    priorFg.alphaTest = 0.04;
    rig.fgMesh.material = priorFg;
    rig.fgMaterial = priorFg;
  } else {
    const prior = priorFg;
    if (
      isDualLayerParallaxMaterial(prior) ||
      prior instanceof THREE.ShaderMaterial ||
      prior instanceof THREE.MeshBasicMaterial
    ) {
      disposeFaceMaterial(prior);
    }
    const fgMat = createCubeFacePhotoMaterial(
      matteTexture,
      framePresetId,
      hologramMode,
      true,
      image
    );
    rig.fgMesh.material = fgMat;
    rig.fgMaterial = fgMat;
  }
  applyFacePhotoDepthBias(rig.fgMesh, true);
  rig.fgMesh.visible = true;
  if (priorBg instanceof THREE.ShaderMaterial && priorBg.uniforms?.uTexture) {
    configurePresentationTexture(plateTexture);
    priorBg.uniforms.uTexture.value = plateTexture;
    priorBg.transparent = false;
    priorBg.depthWrite = false;
    priorBg.alphaTest = 0;
    priorBg.side = THREE.FrontSide;
    rig.bgMesh.material = priorBg;
    rig.bgMaterial = priorBg;
  } else {
    if (priorBg instanceof THREE.Material) {
      disposeFaceMaterial(priorBg);
    }
    const bgMat = createFaceClipMaterial(plateTexture, {
      transparent: false,
      alphaTest: 0,
      inset: 0,
      depthWrite: false,
    });
    bgMat.side = THREE.FrontSide;
    rig.bgMesh.material = bgMat;
    rig.bgMaterial = bgMat;
  }
  rig.bgMesh.visible = true;
  rig.backPlateMesh.visible = false;
  rig.mode = "volumax_mesh";
  applyRigPlaneScaleToFaceMeshes(rig);
  applyCutoutCoplanarStack(rig);
}

/** VoluMax UV warp: fg matte + bg plate composed in one shader (official-style parallax). */
function mountVolumaxDispFace(
  rig: CubeFaceRig,
  matteTexture: THREE.Texture,
  plateTexture: THREE.Texture,
  depthTexture: THREE.Texture,
  image: ProcessedImage,
  framePresetId: CubeFramePresetId,
  hologramMode: boolean
): void {
  const priorFg = faceMaterial(rig.fgMesh);
  const priorLayers = dualLayerTexturesFromMaterial(priorFg);
  if (
    rig.mode === "volumax_disp" &&
    priorLayers?.fg === matteTexture &&
    priorLayers.bg === plateTexture
  ) {
    return;
  }
  // Avoid material churn: update dual-layer shader uniforms in-place when possible.
  if (isDualLayerParallaxMaterial(priorFg)) {
    updateDualLayerParallaxMaterial(
      priorFg,
      matteTexture,
      plateTexture,
      presentationFocusForImage(image, hologramMode),
      depthTexture,
      image.depth?.subjectDepth ?? 0.75,
      shouldUseDepthMap(image),
      0,
      volumaxDualLayerOptions(image, framePresetId, hologramMode)
    );
    priorFg.side = THREE.DoubleSide;
    rig.fgMesh.material = priorFg;
    rig.fgMaterial = priorFg;
  } else {
    if (priorFg instanceof THREE.Material) {
      disposeFaceMaterial(priorFg);
    }
    const priorBg = faceMaterial(rig.bgMesh);
    if (priorBg instanceof THREE.Material && priorBg !== priorFg) {
      disposeFaceMaterial(priorBg);
    }
    const material = createDualLayerParallaxMaterial(
      matteTexture,
      plateTexture,
      presentationFocusForImage(image, hologramMode),
      depthTexture,
      image.depth?.subjectDepth ?? 0.75,
      shouldUseDepthMap(image),
      volumaxDualLayerOptions(image, framePresetId, hologramMode)
    );
    rig.fgMesh.material = material;
    rig.fgMaterial = material;
    material.side = THREE.DoubleSide;
  }
  applyFacePhotoDepthBias(rig.fgMesh, true);
  rig.fgMesh.visible = true;
  rig.bgMesh.visible = false;
  rig.backPlateMesh.visible = false;
  rig.mode = "volumax_disp";
  applyRigPlaneScaleToFaceMeshes(rig);
}

function resolveCutoutForegroundTexture(
  image: ProcessedImage,
  matteTexture: THREE.Texture,
  fullTexture: THREE.Texture
): THREE.Texture | null {
  const fgUrl = resolveSubjectForegroundUrl(image);
  if (!fgUrl || !isTransparentMatteDataUrl(fgUrl) || matteTexture === fullTexture) {
    return null;
  }
  return matteTexture;
}

function resolvePresentationFgTexture(
  image: ProcessedImage,
  imageIndex: number,
  faceTexture: THREE.Texture,
  subjectForegroundTextures: Array<THREE.Texture | null>
): THREE.Texture {
  const fgUrl = resolveSubjectForegroundUrl(image);
  const fgTex = subjectForegroundTextures[imageIndex];
  if (fgTex && fgUrl && isTransparentMatteDataUrl(fgUrl)) {
    return fgTex;
  }
  return faceTexture;
}

function resolveSafeFlatFaceTexture(
  image: ProcessedImage,
  fullTexture: THREE.Texture,
  _plateTexture: THREE.Texture | null
): THREE.Texture {
  // fullTexture is rasterized from resolveCubeFaceDisplayUrl (composite/JPEG) — never bg-only plate.
  void image;
  void _plateTexture;
  return fullTexture;
}

function findFirstLoadedFaceSlot(
  textures: THREE.Texture[],
  orderedImages: ProcessedImage[]
): number {
  for (let i = 0; i < orderedImages.length; i += 1) {
    if (orderedImages[i] && textures[i]) {
      return i;
    }
  }
  return -1;
}

/** Prefer slot image; fall back to first loaded texture so no cube face stays empty. */
function resolveFaceSlotAssets(
  slotIndex: number,
  textures: THREE.Texture[],
  orderedImages: ProcessedImage[],
  resolveSlotImageIndex: (slot: number) => number
): { imageIndex: number; image: ProcessedImage; texture: THREE.Texture } | null {
  const primary = resolveSlotImageIndex(slotIndex);
  const fallback = findFirstLoadedFaceSlot(textures, orderedImages);
  const candidates =
    fallback >= 0 && fallback !== primary ? [primary, fallback] : [primary];
  for (const imageIndex of candidates) {
    const image = orderedImages[imageIndex];
    const texture = textures[imageIndex];
    if (image && texture) {
      return { imageIndex, image, texture };
    }
  }
  return null;
}

function assignCubeFaceTextures(
  rig: CubeFaceRig,
  imageIndex: number,
  image: ProcessedImage,
  matteTexture: THREE.Texture,
  fullTexture: THREE.Texture,
  plateTexture: THREE.Texture | null,
  depthTexture: THREE.Texture,
  framePresetId: CubeFramePresetId,
  hologramMode: boolean
): void {
  const cutoutFg = resolveCutoutForegroundTexture(image, matteTexture, fullTexture);
  const plateDistinct =
    Boolean(plateTexture) &&
    plateTexture !== fullTexture &&
    plateTexture !== cutoutFg;
  const plateSplit =
    Boolean(cutoutFg && plateDistinct) && canMountPlateBackedForeground(image);
  const mountDual =
    plateSplit && canMountVoluMaxDualLayer(image, cutoutFg!, fullTexture, plateTexture);

  // VoluMax dual-layer (disp/mesh + depth) only when fully ready; plate+matte still uses mesh stack.
  if (mountDual && cutoutFg && plateTexture) {
    if (resolveVoluMaxMountMode(image) === "disp") {
      mountVolumaxDispFace(
        rig,
        cutoutFg,
        plateTexture,
        depthTexture,
        image,
        framePresetId,
        hologramMode
      );
    } else {
      mountVolumaxMeshFace(rig, cutoutFg, plateTexture, framePresetId, hologramMode, image);
    }
  } else if (plateSplit && cutoutFg && plateTexture) {
    mountVolumaxMeshFace(rig, cutoutFg, plateTexture, framePresetId, hologramMode, image);
  } else {
    rig.backPlateMesh.visible = false;
    mountFramedFlatFace(
      rig,
      resolveSafeFlatFaceTexture(image, fullTexture, plateTexture),
      framePresetId,
      hologramMode,
      image,
      plateTexture ?? fullTexture
    );
  }
  rig.imageSlot = imageIndex;
  applyFaceLayoutUniformsToRig(rig, activeFaceLayoutMetrics, activeFrameFinishId);
}

function applyFramePresetToCubeFaceRig(rig: CubeFaceRig, framePresetId: CubeFramePresetId): void {
  const fgMat = faceMaterial(rig.fgMesh);
  if (isDualLayerParallaxMaterial(fgMat)) {
    setDualLayerFramePreset(fgMat, framePresetId);
  } else if (fgMat instanceof THREE.ShaderMaterial && fgMat.uniforms?.uTexture) {
    updateFramedFlatMaterialFrame(fgMat, framePresetId);
  } else if (fgMat instanceof THREE.MeshBasicMaterial) {
    void framePresetId;
  }
  const backPlate = rig.backPlateMesh.material;
  if (backPlate instanceof THREE.MeshStandardMaterial) {
    backPlate.color.setHex(FRAME_OUTER_COLORS[framePresetId]);
    backPlate.needsUpdate = true;
  }
  rig.garland?.setFramePreset(framePresetId);
}

function syncCubeFaceMotion(
  rig: CubeFaceRig,
  amount: number,
  focusPulse: number,
  _rotationY: number,
  _rotationX: number,
  isActiveFace = false,
  depthParallaxEnabled = true
): void {
  const pulse = isActiveFace ? focusPulse : 0;
  if (rig.mode === "flat") {
    const photoZ = rigFacePhotoZ(rig);
    const planeScale = rigFacePlaneScale(rig);
    const content = rigContentScale(rig);
    const fgZ = photoZ + pulse * CUBE_FOCUS_PULSE_Z_MAX;
    rig.fgMesh.scale.set(planeScale * content, planeScale * content, 1);
    rig.bgMesh.scale.set(planeScale * content, planeScale * content, 1);
    rig.fgMesh.position.set(0, 0, fgZ);
    rig.bgMesh.position.set(0, 0, rigFaceBgZ(rig));
    rig.bgMesh.visible = Boolean(textureFromFaceMaterial(faceMaterial(rig.bgMesh)));
    return;
  }

  const fgMat = faceMaterial(rig.fgMesh);
  if (rig.mode === "volumax_disp" && isDualLayerParallaxMaterial(fgMat)) {
    const depthOn = depthParallaxEnabled && isActiveFace;
    const effectiveAmount = depthOn ? amount : 0;
    const effectivePulse = depthOn || pulse > 0 ? (depthOn ? focusPulse : pulse) : 0;
    setDualLayerParallaxAmount(fgMat, effectiveAmount, effectivePulse);
    const planeScale = rigFacePlaneScale(rig);
    const trustCutout = (fgMat.uniforms.uTrustFgAlpha?.value ?? 0) > 0.5;
    if (trustCutout) {
      rig.fgMesh.scale.set(planeScale, planeScale, 1);
      rig.fgMesh.position.z = rigFacePhotoZ(rig);
    } else {
      const contentScale = rigContentScale(rig);
      const norm = depthOn ? Math.min(1, Math.max(0, amount / PARALLAX_MAX)) : 0;
      const pop = contentScale * (1 + norm * 0.06 + effectivePulse * 0.08) * planeScale;
      rig.fgMesh.scale.set(pop, pop, 1);
      rig.fgMesh.position.z =
        rigFacePhotoZ(rig) + effectivePulse * CUBE_FOCUS_PULSE_Z_MAX * 1.05 + norm * 0.008;
    }
    rig.bgMesh.visible = false;
    return;
  }

  if (rig.mode === "volumax_mesh") {
    const depthOn = depthParallaxEnabled && isActiveFace;
    const norm = depthOn ? voluMaxParallaxNorm(amount) : 0;
    const activePulse = depthOn ? focusPulse : pulse;
    const atRest = norm <= 0.001 && activePulse <= 0.001;
    const planeScale = rigFacePlaneScale(rig);
    const photoZ = rigFacePhotoZ(rig);
    const fgMat = faceMaterial(rig.fgMesh);
    const cutoutMatte = isCutoutMatteFaceMaterial(fgMat);

    if (!isActiveFace) {
      rig.fgMesh.position.set(0, 0, photoZ);
      rig.fgMesh.scale.set(planeScale, planeScale, 1);
      if (cutoutMatte) {
        applyCutoutCoplanarStack(rig, 0);
      } else {
        rig.bgMesh.position.set(0, 0, rigFaceBgZ(rig));
      }
      rig.bgMesh.scale.set(planeScale, planeScale, 1);
      rig.bgMesh.visible = Boolean(textureFromFaceMaterial(faceMaterial(rig.bgMesh)));
      return;
    }

    rig.bgMesh.visible = true;
    rig.bgMesh.scale.set(planeScale, planeScale, 1);

    if (cutoutMatte) {
      applyCutoutCoplanarStack(rig, activePulse);
      return;
    }

    rig.bgMesh.position.set(0, 0, rigFaceBgZ(rig));

    if (atRest) {
      rig.fgMesh.scale.set(planeScale, planeScale, 1);
      rig.fgMesh.position.set(0, 0, photoZ + activePulse * CUBE_FOCUS_PULSE_Z_MAX);
      return;
    }

    const contentScale = rigContentScale(rig);
    const zPop = norm * 0.16 + activePulse * 0.1;
    rig.bgMesh.position.set(0, 0, rigFaceBgZ(rig));
    rig.bgMesh.scale.set(contentScale * planeScale, contentScale * planeScale, 1);
    const forwardScale = contentScale * (1 + norm * 0.045 + activePulse * 0.03) * planeScale;
    rig.fgMesh.scale.set(forwardScale, forwardScale, 1);
    rig.fgMesh.position.set(0, 0, photoZ + zPop + activePulse * CUBE_FOCUS_PULSE_Z_MAX);
    return;
  }
}

const PLANE_SIZE = 2.35;

interface VoluMaxFxRig {
  group: THREE.Group;
  setEnabled: (enabled: boolean) => void;
  setIntensity: (intensity: "soft" | "medium" | "strong") => void;
  update: (deltaMs: number) => void;
  dispose: () => void;
}

function createGlowSpriteTexture(color: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.2, color);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createVoluMaxFxRig(
  enabled: boolean,
  intensity: "soft" | "medium" | "strong" = "medium"
): VoluMaxFxRig {
  const group = new THREE.Group();
  group.visible = enabled;
  group.renderOrder = 3;

  const ringColor = 0x7cc8ff;
  const ringMats: THREE.MeshBasicMaterial[] = [];
  const rings: THREE.Mesh[] = [];
  const ringBase = [1.22, 1.55, 1.9];
  for (let i = 0; i < ringBase.length; i += 1) {
    const outer = ringBase[i];
    const geo = new THREE.RingGeometry(outer - 0.01, outer, 96);
    const mat = new THREE.MeshBasicMaterial({
      color: ringColor,
      transparent: true,
      opacity: 0.12 - i * 0.02,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.02 - i * 0.01;
    rings.push(ring);
    ringMats.push(mat);
    group.add(ring);
  }

  const glowTexture = createGlowSpriteTexture("rgba(124,200,255,0.7)");
  const flareMat = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xb6e6ff,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flare = new THREE.Sprite(flareMat);
  flare.scale.set(1.9, 1.9, 1.9);
  flare.position.set(0, 0.15, 0);
  group.add(flare);

  let elapsed = 0;
  const intensityMul = (v: "soft" | "medium" | "strong") =>
    v === "soft" ? 0.7 : v === "strong" ? 1.35 : 1.0;
  let mul = intensityMul(intensity);

  return {
    group,
    setEnabled: (next) => {
      group.visible = next;
    },
    setIntensity: (next) => {
      mul = intensityMul(next);
    },
    update: (deltaMs) => {
      if (!group.visible) {
        return;
      }
      elapsed += deltaMs;
      const t = elapsed * 0.001;
      // Reference-like "scanner/radar" breathing around the cube.
      group.rotation.y += deltaMs * 0.00011 * mul;
      rings.forEach((ring, idx) => {
        ring.rotation.z = t * (0.15 + idx * 0.08);
        const pulse = 0.88 + 0.14 * Math.sin(t * 1.4 + idx * 0.95);
        ring.scale.setScalar(pulse);
        ringMats[idx].opacity =
          (0.14 + 0.14 * (0.5 + 0.5 * Math.sin(t * 1.6 + idx))) * mul;
      });
      flare.material.opacity = (0.18 + 0.16 * (0.5 + 0.5 * Math.sin(t * 2.1))) * mul;
      flare.scale.setScalar(1.75 + 0.2 * mul + 0.2 * Math.sin(t * 1.3));
    },
    dispose: () => {
      rings.forEach((ring) => {
        (ring.geometry as THREE.BufferGeometry).dispose();
      });
      ringMats.forEach((mat) => mat.dispose());
      glowTexture.dispose();
      flareMat.dispose();
    },
  };
}

function presentationFocusCenter(
  image: ProcessedImage,
  hologramMode: boolean
): { x: number; y: number } {
  if (hologramMode) {
    return DEFAULT_FOCUS_CENTER;
  }
  return image.center ?? DEFAULT_FOCUS_CENTER;
}

function getDepthTexture(image: ProcessedImage): THREE.Texture {
  const expectedLength = image.depth?.gridSize ? image.depth.gridSize * image.depth.gridSize : 0;
  if (image.depth && image.depth.values.length === expectedLength && expectedLength > 0) {
    return createDepthTexture(image.depth);
  }
  return createFallbackDepthTexture();
}

function shouldUseDepthMap(image: ProcessedImage): boolean {
  const expectedLength = image.depth?.gridSize ? image.depth.gridSize * image.depth.gridSize : 0;
  return Boolean(image.depth && image.depth.values.length === expectedLength && expectedLength > 0);
}

function createFlatPresentationMaterial(
  texture: THREE.Texture,
  framePresetId: CubeFramePresetId,
  hologramMode: boolean = false
): THREE.ShaderMaterial {
  return createFramedFlatMaterial(texture, framePresetId, hologramMode);
}

function resolvePresentationFrameColor(
  framePresetId: CubeFramePresetId,
  customFrameColor: string | null | undefined,
  shift: number,
  gradientEnabled: boolean
): THREE.Color {
  const baseRgb = parseFrameColorHex(customFrameColor);
  const [gr, gg, gb] = gradientEnabled ? gradientAccentRgb(shift) : [1, 1, 1];
  if (baseRgb) {
    return new THREE.Color(baseRgb.x * gr, baseRgb.y * gg, baseRgb.z * gb);
  }
  if (gradientEnabled) {
    return new THREE.Color(gr, gg, gb);
  }
  return new THREE.Color(FRAME_OUTER_COLORS[framePresetId]);
}

function applyPresentationFrameColors(
  root: THREE.Object3D,
  options: {
    shift: number;
    gradientEnabled: boolean;
    customFrameColor: string | null | undefined;
    framePresetId: CubeFramePresetId;
    outerFrameMaterial?: THREE.Material | null;
  }
): void {
  const resolved = resolvePresentationFrameColor(
    options.framePresetId,
    options.customFrameColor,
    options.shift,
    options.gradientEnabled
  );
  const baseRgb = parseFrameColorHex(options.customFrameColor);
  const useCustom = Boolean(baseRgb);

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof THREE.ShaderMaterial && isCubeFrameShellMaterial(material)) {
        material.uniforms.uBaseColor.value.copy(resolved);
        continue;
      }
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.copy(resolved);
        continue;
      }
      if (!(material instanceof THREE.ShaderMaterial)) {
        continue;
      }
      if (material.uniforms.uGradientShift) {
        material.uniforms.uGradientShift.value = options.shift;
      }
      if (material.uniforms.uGradientEnabled) {
        material.uniforms.uGradientEnabled.value = options.gradientEnabled ? 1 : 0;
      }
      if (material.uniforms.uCustomFrameColor && material.uniforms.uUseCustomFrameColor) {
        if (useCustom && baseRgb) {
          material.uniforms.uUseCustomFrameColor.value = 1;
          material.uniforms.uCustomFrameColor.value.copy(baseRgb);
        } else {
          material.uniforms.uUseCustomFrameColor.value = 0;
        }
      }
    }
  });

  if (options.outerFrameMaterial instanceof THREE.ShaderMaterial && isCubeFrameShellMaterial(options.outerFrameMaterial)) {
    options.outerFrameMaterial.uniforms.uBaseColor.value.copy(resolved);
  } else if (options.outerFrameMaterial instanceof THREE.MeshStandardMaterial) {
    options.outerFrameMaterial.color.copy(resolved);
  }
}

function applyFrameBorderScaleToRoot(root: THREE.Object3D, scale: number): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (
        material instanceof THREE.ShaderMaterial &&
        material.uniforms.uFrameBorderScale
      ) {
        material.uniforms.uFrameBorderScale.value = scale;
      }
    }
  });
}

function applyFaceLayoutUniformsToRig(
  rig: CubeFaceRig,
  metrics: CubeFaceLayoutMetrics,
  finishId: CubeFrameFinishId
): void {
  applyFaceUvInsetToMesh(rig.fgMesh, metrics.uvInset);
  applyFaceUvInsetToMesh(rig.bgMesh, metrics.uvInset);
  applyShellFrameModeToMesh(rig.fgMesh, metrics.borderVisible);
  applyShellFrameModeToMesh(rig.bgMesh, metrics.borderVisible);
  const finishValue = frameFinishUniformValue(finishId);
  for (const mesh of [rig.fgMesh, rig.bgMesh]) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material instanceof THREE.ShaderMaterial && material.uniforms?.uFrameFinish) {
        material.uniforms.uFrameFinish.value = finishValue;
      }
    }
  }
}

function applyCubeFaceLayoutToRigs(
  faceRigs: Array<CubeFaceRig | null>,
  metrics: CubeFaceLayoutMetrics,
  referencePlaneSize: number
): void {
  const layouts = buildCubeFaceLayouts(metrics.faceHalf);
  const planeScale = metrics.planeSize / referencePlaneSize;
  faceRigs.forEach((rig) => {
    if (!rig) {
      return;
    }
    const layout = layouts[rig.faceIndex];
    if (!layout) {
      return;
    }
    rig.group.position.set(...layout.position);
    rig.group.rotation.set(...layout.rotation);
    rig.facePlaneScale = planeScale;
    rig.facePhotoZ = metrics.facePhotoZ;
    rig.faceBgZ = metrics.faceBgZ;
    const content = rigContentScale(rig);
    rig.fgMesh.scale.set(planeScale * content, planeScale * content, 1);
    rig.bgMesh.scale.set(planeScale * content, planeScale * content, 1);
    rig.fgMesh.position.z = metrics.facePhotoZ;
    rig.bgMesh.position.z = metrics.faceBgZ;
    applyFaceUvInsetToMesh(rig.fgMesh, metrics.uvInset);
    applyFaceUvInsetToMesh(rig.bgMesh, metrics.uvInset);
    applyShellFrameModeToMesh(rig.fgMesh, metrics.borderVisible);
    applyShellFrameModeToMesh(rig.bgMesh, metrics.borderVisible);
    rig.backPlateMesh.scale.set(planeScale, planeScale, 1);
    rig.backPlateMesh.position.z = metrics.faceBgZ;
    applyFacePhotoDepthBias(rig.fgMesh, rig.mode === "flat");
    applyFaceBgDepthBias(rig.bgMesh);
    applyFaceBgDepthBias(rig.backPlateMesh);
  });
}

function applyFrameFinishToRoot(root: THREE.Object3D, finishId: CubeFrameFinishId): void {
  const finishValue = frameFinishUniformValue(finishId);
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof THREE.ShaderMaterial && isCubeFrameShellMaterial(material)) {
        applyCubeFrameShellFinishProps(material, finishId);
        continue;
      }
      if (material instanceof THREE.ShaderMaterial && material.uniforms.uFrameFinish) {
        material.uniforms.uFrameFinish.value = finishValue;
      }
      if (material instanceof THREE.ShaderMaterial && material.uniforms.uFaceGloss) {
        material.uniforms.uFaceGloss.value = 0;
      }
    }
  });
}

function applyPresentationLighting(
  root: THREE.Object3D,
  camera: THREE.Camera | null,
  rotationY: number,
  rotationX: number,
  showcasePulse: number,
  finishId: CubeFrameFinishId
): void {
  applyFaceLacquerLightToRoot(root, rotationY, rotationX, showcasePulse, finishId);
  if (!camera) {
    return;
  }
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof THREE.ShaderMaterial && isCubeFrameShellMaterial(material)) {
        updateCubeFrameShellLighting(material, camera, showcasePulse, finishId);
      }
    }
  });
}

function toDualLayerOptions(
  image: ProcessedImage,
  framePresetId: CubeFramePresetId,
  turntableEffect: boolean,
  hologramMode: boolean
): DualLayerParallaxOptions {
  const fgUrl = resolveSubjectForegroundUrl(image);
  return {
    portraitBoost: hasDepthSeparationBoost(image),
    subjectBounds: image.subject.bounds,
    bgParallaxMul: turntableEffect ? 0.32 : hologramMode ? 0.48 : 0.62,
    framePresetId,
    hologramMode,
    trustFgAlpha: Boolean(fgUrl && isTransparentMatteDataUrl(fgUrl)),
  };
}

function createPageMaterial(
  texture: THREE.Texture,
  image: ProcessedImage,
  depthTexture: THREE.Texture,
  plateTexture: THREE.Texture | null,
  framePresetId: CubeFramePresetId,
  hologramMode: boolean = false,
  turntableDualLayer = false,
  parallaxOptions: ParallaxMaterialOptions = parallaxOptionsForImage(image, framePresetId, hologramMode)
): THREE.Material {
  if (plateTexture && canUseDualLayerParallax(image)) {
    return createDualLayerParallaxMaterial(
      texture,
      plateTexture,
      presentationFocusCenter(image, hologramMode),
      depthTexture,
      image.depth?.subjectDepth ?? 0.75,
      shouldUseDepthMap(image),
      {
        ...toDualLayerOptions(image, framePresetId, turntableDualLayer, hologramMode),
        hologramMode,
      }
    );
  }

  if (!canUseDualLayerParallax(image)) {
    return createFlatPresentationMaterial(texture, framePresetId, hologramMode);
  }

  const material = createParallaxMaterial(
    texture,
    presentationFocusCenter(image, hologramMode),
    depthTexture,
    image.depth?.subjectDepth ?? 0.75,
    shouldUseDepthMap(image),
    parallaxOptions
  );
  material.transparent = true;
  return material;
}

function applyParallaxAmount(material: THREE.Material, amount: number, focusPulse: number = 0): void {
  if (isDualLayerParallaxMaterial(material)) {
    setDualLayerParallaxAmount(material, amount, focusPulse);
    return;
  }
  if (isParallaxMaterial(material)) {
    setParallaxAmount(material, amount);
  }
}

function applyFramePresetToMaterial(
  material: THREE.Material,
  framePresetId: CubeFramePresetId
): void {
  if (isDualLayerParallaxMaterial(material)) {
    setDualLayerFramePreset(material, framePresetId);
    return;
  }
  if (isParallaxMaterial(material)) {
    setParallaxFramePreset(material, framePresetId);
    return;
  }
  if (material instanceof THREE.ShaderMaterial && material.uniforms.uFramePreset) {
    updateFramedFlatMaterialFrame(material, framePresetId);
  }
}

export interface PresentationScene {
  root: THREE.Object3D;
  applyStepTexture: (step: number) => void;
  setParallaxAmount: (step: number, amount: number, focusPulse?: number) => void;
  setFramePreset: (framePresetId: CubeFramePresetId) => void;
  setHologramMode: (enabled: boolean) => void;
  setVoluMaxFx: (enabled: boolean, intensity?: "soft" | "medium" | "strong") => void;
  setCs5Fx: (options: Cs5FxOptions | null) => void;
  updateParticles: (deltaMs: number) => void;
  updateTextureCarousel?: (rotationY: number) => void;
  updateRotationParallax?: (rotationY: number, rotationX: number) => void;
  /** Re-bind face materials after async texture load (wedding-simple loads sync). */
  refreshFaceTextures?: () => void;
  /** Runtime structural audit — fg + bg plate on every cube face. */
  auditFaceIntegrity?: () => CubeFaceIntegrityReport;
  /** Per-photo bottom captions (showcase_hold only). */
  updateFaceCaptions?: (step: number, phase: FanPhase, phaseU: number) => void;
  updateCaptionTexts?: (captions: string[]) => void;
  resetTextureCarousel?: () => void;
  /** Lock face textures during MP4 capture — no mid-record shader rebuild / carousel. */
  setRecordingExportMode?: (active: boolean) => void;
  setGradientShift: (
    shift: number,
    enabled: boolean,
    customFrameColor?: string | null
  ) => void;
  setFrameBorderWidth: (widthId: FrameBorderWidthId) => void;
  setFrameFinish: (finishId: CubeFrameFinishId) => void;
  /** User mesh scale — independent of fan timeline presentationScale. */
  setCubeSizeScale: (scale: number) => void;
  dispose: () => void;
}

function mountPresentationParticles(
  particleTheme: ParticleThemeId,
  camera: THREE.PerspectiveCamera | null,
  root: THREE.Object3D
): CubeParticlesSystem | null {
  if (particleTheme === "none") {
    return null;
  }
  const useScreenLayout = Boolean(camera);
  const particleCount =
    particleTheme === "gold_dust" && useScreenLayout
      ? 68
      : useScreenLayout
        ? 110
        : 100;
  const particles = createCubeParticles(
    particleTheme,
    particleCount,
    useScreenLayout && camera ? { layout: "screen", camera } : { layout: "cube" }
  );
  if (!particles) {
    return null;
  }
  if (useScreenLayout && camera) {
    camera.add(particles.points);
  } else {
    root.add(particles.points);
  }
  particles.points.visible = true;
  particles.points.renderOrder = useScreenLayout ? 160 : 150;
  return particles;
}

export interface CreatePresentationSceneOptions {
  /** Skip CS5 sprite/video overlays — used by Node integrity tests (no DOM). */
  lightweight?: boolean;
}

export function createPresentationScene(
  effect: PresentationEffectId,
  orderedImages: ProcessedImage[],
  textures: THREE.Texture[],
  plateTextures: Array<THREE.Texture | null> = [],
  framePresetId: CubeFramePresetId = "rose_gold",
  hologramMode: boolean = false,
  particleTheme: ParticleThemeId = "none",
  voluMaxDepthEnabled: boolean = false,
  subjectForegroundTextures: Array<THREE.Texture | null> = [],
  camera: THREE.PerspectiveCamera | null = null,
  orbitalShapeId: OrbitalShapeId = "octahedron",
  sceneOptions: CreatePresentationSceneOptions = {}
): PresentationScene {
  const lightweight = sceneOptions.lightweight ?? false;
  const depthTextures = orderedImages.map((image) => getDepthTexture(image));
  const disposables: Array<THREE.Material | THREE.BufferGeometry | THREE.Texture> = [];
  const overlayObjects: THREE.Object3D[] = [];
  const isTurntableEffect = effect === "turntable";

  let currentHologramMode = hologramMode;

  const root = new THREE.Group();
  const cs5FxRig = lightweight
    ? {
        group: new THREE.Group(),
        setOptions() {},
        update() {},
        dispose() {},
      }
    : createCs5FxRig();
  if (!lightweight) {
    root.add(cs5FxRig.group);
  }
  let currentParticleTheme = particleTheme;
  let particles = lightweight
    ? null
    : mountPresentationParticles(currentParticleTheme, camera, root);

  const syncParticleVisibility = () => {
    if (particles) {
      particles.points.visible = currentParticleTheme !== "none";
    }
  };

  let voluMaxFx: VoluMaxFxRig = lightweight
    ? {
        group: new THREE.Group(),
        setEnabled() {},
        setIntensity() {},
        update() {},
        dispose() {},
      }
    : createVoluMaxFxRig(hologramMode, "medium");
  if (!lightweight) {
    root.add(voluMaxFx.group);
  }

  if (effect === "cube_focus" || effect === "orbital_showcase") {
    const isOrbitalShowcase = effect === "orbital_showcase";
    const orbitalLayouts = isOrbitalShowcase ? getOrbitalFaceLayouts(orbitalShapeId) : null;
    const polyFaceCount = isOrbitalShowcase ? orbitalLayouts!.length : CUBE_FACE_COUNT;
    const resolvePresentationFaceIndex = (step: number) =>
      isOrbitalShowcase ? step % polyFaceCount : getPresentationFace(step);

    const cubeGroup = new THREE.Group();
    const cubeSizeGroup = new THREE.Group();
    let currentCubeSizeScale = 1;
    const frameGeometry = isOrbitalShowcase
      ? orbitalShapeId === "icosahedron"
        ? new THREE.IcosahedronGeometry(CUBE_EDGE_LENGTH * 0.78, 0)
        : new THREE.OctahedronGeometry(CUBE_EDGE_LENGTH * 0.78, 0)
      : new RoundedBoxGeometry(CUBE_EDGE_LENGTH, CUBE_EDGE_LENGTH, CUBE_EDGE_LENGTH, 6, 0.08);
    const frameMaterial = createFrameShellMaterial(FRAME_OUTER_COLORS[framePresetId], "glossy");
    const frameMesh = new THREE.Mesh(frameGeometry, frameMaterial);
    frameMesh.renderOrder = -1;
    frameMesh.visible = false;
    frameMesh.scale.setScalar(1);
    cubeGroup.add(frameMesh);
    disposables.push(frameGeometry, frameMaterial);

    const faceRigs: Array<CubeFaceRig | null> = Array.from({ length: CUBE_FACE_COUNT }, () => null);
    const imageCount = orderedImages.length;
    const resolveSlotImageIndex = (slotIndex: number) =>
      imageCount > 0 ? slotIndex % imageCount : 0;

    for (let index = 0; index < polyFaceCount; index += 1) {
      const faceIndex = isOrbitalShowcase ? index : getPresentationFace(index);
      const layoutSource = isOrbitalShowcase
        ? orbitalLayouts![index]
        : buildCubeFaceLayouts(FRAMED_FACE_LAYOUT.faceHalf)[faceIndex];
      const assets = resolveFaceSlotAssets(
        index,
        textures,
        orderedImages,
        resolveSlotImageIndex
      );
      if (!assets || !layoutSource) {
        continue;
      }
      const { imageIndex, image, texture } = assets;
      const plateTexture = plateTextures[imageIndex] ?? plateTextures[findFirstLoadedFaceSlot(textures, orderedImages)] ?? null;
      const layout = {
        position: layoutSource.position as THREE.Vector3Tuple,
        rotation: layoutSource.rotation as THREE.EulerTuple,
      };

      const group = new THREE.Group();
      group.position.set(...layout.position);
      group.rotation.set(...layout.rotation);

      const backPlateGeometry = new THREE.PlaneGeometry(
        CUBE_FACE_PLANE_SIZE,
        CUBE_FACE_PLANE_SIZE
      );
      const backPlateMaterial = createFrameShellMaterial(
        FRAME_OUTER_COLORS[framePresetId],
        "glossy"
      );
      const backPlateMesh = new THREE.Mesh(backPlateGeometry, backPlateMaterial);
      backPlateMesh.position.z = FRAMED_FACE_LAYOUT.faceBgZ;
      backPlateMesh.visible = false;
      applyFaceBgDepthBias(backPlateMesh);

      const bgGeometry = new THREE.PlaneGeometry(CUBE_FACE_PLANE_SIZE, CUBE_FACE_PLANE_SIZE);
      const fgGeometry = new THREE.PlaneGeometry(CUBE_FACE_PLANE_SIZE, CUBE_FACE_PLANE_SIZE);
      disposables.push(bgGeometry, fgGeometry);

      const bgMaterial = new THREE.MeshBasicMaterial({
        side: THREE.FrontSide,
        color: 0xffffff,
        depthWrite: false,
      });
      const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
      bgMesh.position.z = FRAMED_FACE_LAYOUT.faceBgZ;
      applyFaceBgDepthBias(bgMesh);

      const fgMaterial = createCubeFacePhotoMaterial(
        texture,
        framePresetId,
        hologramMode,
        false,
        image
      );
      const fgMesh = new THREE.Mesh(fgGeometry, fgMaterial);
      fgMesh.position.z = FRAMED_FACE_LAYOUT.facePhotoZ;
      applyFacePhotoDepthBias(fgMesh);

      group.add(backPlateMesh);
      group.add(bgMesh);
      group.add(fgMesh);

      let garland: CubeFaceGarlandHandle | undefined;
      if (hologramMode) {
        garland = createCubeFaceGarlandBorder(framePresetId, {
          planeSize: CUBE_FACE_PLANE_SIZE,
          zOffset: FACE_GARLAND_Z,
          visible: true,
        });
        group.add(garland.group);
      }

      let caption: CubeFaceCaptionHandle | undefined;
      if (!lightweight) {
        caption = createCubeFaceCaption(CUBE_FACE_PLANE_SIZE, framePresetId);
        caption.updateText(image.caption ?? "");
        caption.setOpacity(0);
        group.add(caption.mesh);
      }

      cubeGroup.add(group);
      disposables.push(backPlateGeometry, backPlateMaterial, bgMaterial, fgMaterial);

      const fgTexture = resolvePresentationFgTexture(
        image,
        imageIndex,
        texture,
        subjectForegroundTextures
      );

      const rig: CubeFaceRig = {
        faceIndex,
        group,
        fgMesh,
        bgMesh,
        backPlateMesh,
        fgMaterial,
        bgMaterial,
        mode: "flat",
        imageSlot: imageIndex,
        facePlaneScale: 1,
        facePhotoZ: FRAMED_FACE_LAYOUT.facePhotoZ,
        faceBgZ: FRAMED_FACE_LAYOUT.faceBgZ,
        lastParallax: 0,
        lastFocusPulse: 0,
        garland,
        caption,
      };
      assignCubeFaceTextures(
        rig,
        imageIndex,
        image,
        fgTexture ?? texture,
        texture,
        plateTexture,
        depthTextures[imageIndex]!,
        framePresetId,
        hologramMode
      );
      syncCubeFaceMotion(rig, 0, 0, 0, 0);
      faceRigs[faceIndex] = rig;
    }

    applyCubeFaceLayoutToRigs(
      faceRigs,
      activeFaceLayoutMetrics,
      CUBE_FACE_PLANE_SIZE
    );

    cubeSizeGroup.add(cubeGroup);
    root.add(cubeSizeGroup);

    if (isOrbitalShowcase) {
      const orbitGroup = new THREE.Group();
      const spinGroup = new THREE.Group();
      root.remove(cubeSizeGroup);
      spinGroup.add(cubeSizeGroup);
      orbitGroup.add(spinGroup);
      root.add(orbitGroup);
      root.userData[ORBITAL_PIVOT_USERDATA_KEY] = { orbitGroup, spinGroup };
    }

    root.remove(voluMaxFx.group);
    cubeGroup.add(voluMaxFx.group);
    voluMaxFx.group.position.set(0, 0, 0);

    let holoEdges: THREE.Object3D | null = null;
    if (hologramMode) {
      const wireframeRig = createHologramWireframeRig(frameGeometry);
      holoEdges = wireframeRig.group;
      cubeGroup.add(holoEdges);
      disposables.push(...wireframeRig.disposables);
    }

    let appliedStep = -1;
    let activeParallaxStep = 0;
    let nextImageIndex = 6;
    let currentFramePresetId = framePresetId;
    let currentFrameFinishId: CubeFrameFinishId = "none";
    activeFrameFinishId = "none";
    activeFaceLayoutMetrics = resolveCubeFaceLayoutMetrics(false);
    let lastGradientShift = 0;
    let lastGradientEnabled = false;
    let currentCustomFrameColor: string | null = null;
    const canSwap = [true, true, true, true, true, true];
    let recordingExportMode = false;
    let rootRotY = 0;
    let rootRotX = 0;

    const applyParallaxToFaceRigs = (step: number, amount: number, focusPulse: number) => {
      activeParallaxStep = step;
      const activeFace = resolvePresentationFaceIndex(step);
      let showcasePulse = 0;
      faceRigs.forEach((rig) => {
        if (!rig) {
          return;
        }
        const isActive = rig.faceIndex === activeFace;
        const parallax = isActive ? amount : 0;
        const pulse = isActive ? focusPulse : 0;
        if (isActive) {
          showcasePulse = pulse;
        }
        rig.lastParallax = parallax;
        rig.lastFocusPulse = pulse;
        const depthParallax = voluMaxDepthEnabled && rig.mode !== "flat";
        syncCubeFaceMotion(rig, parallax, pulse, rootRotY, rootRotX, isActive, depthParallax);
      });
      applyPresentationLighting(
        root,
        camera,
        rootRotY,
        rootRotX,
        showcasePulse,
        currentFrameFinishId
      );
    };

    const updateFaceRigTextures = (faceIndex: number, imageIndex: number) => {
      const rig = faceRigs[faceIndex];
      const fallbackIndex = findFirstLoadedFaceSlot(textures, orderedImages);
      const sourceIndex =
        orderedImages[imageIndex] && textures[imageIndex]
          ? imageIndex
          : fallbackIndex;
      if (!rig || sourceIndex < 0) {
        return;
      }
      const image = orderedImages[sourceIndex];
      const texture = textures[sourceIndex];
      const plateTexture = plateTextures[sourceIndex] ?? null;
      const fgTexture =
        image && texture
          ? resolvePresentationFgTexture(
              image,
              sourceIndex,
              texture,
              subjectForegroundTextures
            )
          : null;
      if (!image || !texture || !fgTexture) {
        return;
      }
      assignCubeFaceTextures(
        rig,
        imageIndex,
        image,
        fgTexture,
        texture,
        plateTexture,
        depthTextures[sourceIndex]!,
        framePresetId,
        currentHologramMode
      );
      rig.caption?.updateText(image.caption ?? "");
      syncCubeFaceMotion(rig, 0, 0, rootRotY, rootRotX);
    };

    return {
      root,
      applyStepTexture: (step) => {
        if (step === appliedStep) {
          return;
        }
        if (recordingExportMode) {
          const faceIndex = resolvePresentationFaceIndex(step);
          const rig = faceRigs[faceIndex];
          if (rig?.imageSlot === step) {
            appliedStep = step;
            return;
          }
        }
        if (imageCount <= polyFaceCount) {
          for (let slot = 0; slot < polyFaceCount; slot += 1) {
            const faceIdx = resolvePresentationFaceIndex(slot);
            const imgIdx = resolveSlotImageIndex(slot);
            updateFaceRigTextures(faceIdx, imgIdx);
          }
        } else {
          updateFaceRigTextures(resolvePresentationFaceIndex(step), step);
        }
        appliedStep = step;
        applyParallaxToFaceRigs(step, 0, 0);
      },
      refreshFaceTextures: () => {
        for (let slot = 0; slot < polyFaceCount; slot += 1) {
          const faceIdx = isOrbitalShowcase ? slot : getPresentationFace(slot);
          const rig = faceRigs[faceIdx];
          if (!rig) {
            continue;
          }
          const imgIdx =
            imageCount <= polyFaceCount ? resolveSlotImageIndex(slot) : rig.imageSlot;
          updateFaceRigTextures(faceIdx, imgIdx);
        }
      },
      setParallaxAmount: (step, amount, focusPulse = 0) => {
        applyParallaxToFaceRigs(step, amount, focusPulse);
      },
      setFramePreset: (nextPreset) => {
        currentFramePresetId = nextPreset;
        faceRigs.forEach((rig) => {
          if (rig) {
            applyFramePresetToCubeFaceRig(rig, nextPreset);
          }
        });
        applyPresentationFrameColors(root, {
          shift: lastGradientShift,
          gradientEnabled: lastGradientEnabled,
          customFrameColor: currentCustomFrameColor,
          framePresetId: nextPreset,
          outerFrameMaterial: frameMaterial,
        });
      },
      setHologramMode: (enabled) => {
        currentHologramMode = enabled;
        syncParticleVisibility();
        if (holoEdges) {
          holoEdges.visible = enabled;
        }
        faceRigs.forEach((rig) => {
          if (!rig) {
            return;
          }
          if (enabled && !rig.garland) {
            rig.garland = createCubeFaceGarlandBorder(currentFramePresetId, {
              planeSize: CUBE_FACE_PLANE_SIZE,
              zOffset: FACE_GARLAND_Z,
              visible: true,
            });
            rig.group.add(rig.garland.group);
          }
          rig.garland?.setVisible(enabled && isFrameBorderVisible(currentFrameFinishId));
          updateFaceRigTextures(rig.faceIndex, rig.imageSlot);
        });
        voluMaxFx.setEnabled(enabled);
      },
      setVoluMaxFx: (enabled, intensity = "medium") => {
        voluMaxFx.setEnabled(enabled);
        voluMaxFx.setIntensity(intensity);
      },
      setCs5Fx: (options) => {
        cs5FxRig.setOptions(options ?? DEFAULT_CS5_FX_OPTIONS);
      },
      updateParticles: (deltaMs) => {
        voluMaxFx.update(deltaMs);
        cs5FxRig.update(deltaMs);
        if (particles && particles.points.visible) {
          particles.update(deltaMs);
        }
      },
      setGradientShift: (shift, enabled, customFrameColor = null) => {
        lastGradientShift = shift;
        lastGradientEnabled = enabled;
        currentCustomFrameColor = customFrameColor ?? null;
        applyPresentationFrameColors(root, {
          shift,
          gradientEnabled: enabled,
          customFrameColor,
          framePresetId: currentFramePresetId,
          outerFrameMaterial: frameMaterial,
        });
      },
      setFrameBorderWidth: (widthId) => {
        applyFrameBorderScaleToRoot(root, frameBorderScale(widthId));
      },
      setFrameFinish: (finishId) => {
        currentFrameFinishId = finishId;
        activeFrameFinishId = finishId;
        applyFrameFinishToRoot(root, finishId);
        const showBorder = isFrameBorderVisible(finishId);
        activeFaceLayoutMetrics = resolveCubeFaceLayoutMetrics(showBorder);
        frameMesh.visible = showBorder;
        const frameShellScale = showBorder ? CUBE_FRAME_MESH_SCALE : 1;
        frameMesh.scale.setScalar(frameShellScale);
        if (holoEdges) {
          holoEdges.scale.setScalar(frameShellScale);
        }
        applyCubeFaceLayoutToRigs(
          faceRigs,
          activeFaceLayoutMetrics,
          CUBE_FACE_PLANE_SIZE
        );
        faceRigs.forEach((rig) => {
          if (!rig) {
            return;
          }
          applyFaceLayoutUniformsToRig(rig, activeFaceLayoutMetrics, finishId);
          rig.backPlateMesh.visible = false;
          rig.garland?.setVisible(showBorder && currentHologramMode);
          syncCubeFaceMotion(
            rig,
            rig.lastParallax,
            rig.lastFocusPulse,
            rootRotY,
            rootRotX,
            rig.faceIndex === resolvePresentationFaceIndex(activeParallaxStep),
            voluMaxDepthEnabled && rig.mode !== "flat"
          );
        });
        applyPresentationLighting(root, camera, rootRotY, rootRotX, 0, finishId);
      },
      updateTextureCarousel: (rotationY) => {
        if (recordingExportMode) {
          return;
        }
        const totalImages = orderedImages.length;
        if (totalImages <= 6) return;

        const sideFaces = [
          { idx: 4, offset: 0, swapKey: 0 },
          { idx: 0, offset: Math.PI / 2, swapKey: 1 },
          { idx: 1, offset: -Math.PI / 2, swapKey: 2 },
          { idx: 5, offset: Math.PI, swapKey: 3 },
          { idx: 2, offset: Math.PI / 2, swapKey: 4 },
          { idx: 3, offset: -Math.PI / 2, swapKey: 5 },
        ];

        sideFaces.forEach((face) => {
          const angle = rotationY + face.offset;
          const cosAngle = Math.cos(angle);

          if (cosAngle < -0.96) {
            if (canSwap[face.swapKey]) {
              updateFaceRigTextures(face.idx, nextImageIndex);
              nextImageIndex = (nextImageIndex + 1) % totalImages;
              canSwap[face.swapKey] = false;
            }
          } else if (cosAngle > 0.3) {
            canSwap[face.swapKey] = true;
          }
        });
      },
      updateRotationParallax: (rotationY, rotationX) => {
        rootRotY = rotationY;
        rootRotX = rotationX;
        applyParallaxToFaceRigs(
          activeParallaxStep,
          faceRigs[resolvePresentationFaceIndex(activeParallaxStep)]?.lastParallax ?? 0,
          faceRigs[resolvePresentationFaceIndex(activeParallaxStep)]?.lastFocusPulse ?? 0
        );
      },
      resetTextureCarousel: () => {
        nextImageIndex = 6;
        for (let i = 0; i < canSwap.length; i += 1) {
          canSwap[i] = true;
        }
        for (let index = 0; index < polyFaceCount; index += 1) {
          const imageIndex = resolveSlotImageIndex(index);
          updateFaceRigTextures(resolvePresentationFaceIndex(index), imageIndex);
        }
      },
      setRecordingExportMode: (active) => {
        recordingExportMode = active;
        if (active) {
          for (let index = 0; index < polyFaceCount; index += 1) {
            const imageIndex = resolveSlotImageIndex(index);
            updateFaceRigTextures(resolvePresentationFaceIndex(index), imageIndex);
          }
          appliedStep = -1;
        }
      },
      setCubeSizeScale: (scale) => {
        currentCubeSizeScale = clampCubeSizeScale(scale);
        cubeSizeGroup.scale.setScalar(currentCubeSizeScale);
      },
      updateFaceCaptions: (step, phase, phaseU) => {
        const activeFace = resolvePresentationFaceIndex(step);
        const holdOpacity =
          phase === "showcase_hold" ? showcaseHoldParallaxEnvelope(phaseU) : 0;
        faceRigs.forEach((rig) => {
          if (!rig?.caption) {
            return;
          }
          const isActive = rig.imageSlot === step && rig.faceIndex === activeFace;
          rig.caption.setOpacity(isActive ? holdOpacity : 0);
        });
      },
      updateCaptionTexts: (captions) => {
        faceRigs.forEach((rig) => {
          if (!rig?.caption) {
            return;
          }
          rig.caption.updateText(captions[rig.imageSlot] ?? "");
        });
      },
      auditFaceIntegrity: () => {
        const auditInputs: Array<CubeFaceRigAuditInput | null> = faceRigs.map((rig) =>
          rig
            ? {
                faceIndex: rig.faceIndex,
                mode: rig.mode,
                fgMesh: rig.fgMesh,
                bgMesh: rig.bgMesh,
                imageSlot: rig.imageSlot,
              }
            : null
        );
        return auditAllCubeFaceRigs(auditInputs, CUBE_FACE_COUNT);
      },
      dispose: () => {
        faceRigs.forEach((rig) => {
          rig?.garland?.dispose();
          rig?.caption?.dispose();
        });
        disposables.forEach((item) => item.dispose());
        depthTextures.forEach((texture) => texture.dispose());
        if (particles) {
          particles.dispose();
        }
        voluMaxFx.dispose();
        cs5FxRig.dispose();
      },
    };
  }

  const pagePivot = new THREE.Group();
  const pageGeometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
  const pageMaterial: THREE.Material = new THREE.MeshBasicMaterial({ color: 0x334155 });
  const pageMesh = new THREE.Mesh(pageGeometry, pageMaterial);
  pagePivot.add(pageMesh);
  root.add(pagePivot);
  disposables.push(pageGeometry, pageMaterial);

  if (effect === "book_spread") {
    const spineGeometry = new THREE.BoxGeometry(0.12, PLANE_SIZE, 0.18);
    const spineMaterial = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const spine = new THREE.Mesh(spineGeometry, spineMaterial);
    spine.position.set(-PLANE_SIZE / 2, 0, -0.02);
    root.add(spine);
    overlayObjects.push(spine);
    disposables.push(spineGeometry, spineMaterial);

    const backGeometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
    const backMaterial = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const backMesh = new THREE.Mesh(backGeometry, backMaterial);
    backMesh.position.set(-PLANE_SIZE / 2, 0, -0.03);
    backMesh.rotation.y = 0.08;
    root.add(backMesh);
    overlayObjects.push(backMesh);
    disposables.push(backGeometry, backMaterial);

    pagePivot.position.set(-PLANE_SIZE / 2, 0, 0);
    pageMesh.position.set(PLANE_SIZE / 2, 0, 0);
  } else if (effect === "turntable") {
    const baseGeometry = new THREE.CylinderGeometry(1.55, 1.7, 0.12, 48);
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = -1.35;
    root.add(base);
    overlayObjects.push(base);
    disposables.push(baseGeometry, baseMaterial);
    pageMesh.position.set(0, 0.05, 0);
    pageMesh.rotation.x = -0.08;
  } else if (effect === "orbit_gallery") {
    pageMesh.position.set(0, 0, 0);
  } else {
    pagePivot.position.set(-PLANE_SIZE / 2, 0, 0);
    pageMesh.position.set(PLANE_SIZE / 2, 0, 0);
  }

  // Set initial overlay visibility based on hologramMode
  overlayObjects.forEach((obj) => {
    obj.visible = !hologramMode;
  });

  let appliedStep = -1;

  return {
    root,
    applyStepTexture: (step) => {
      if (step === appliedStep) {
        return;
      }
      const texture = textures[step];
      const image = orderedImages[step];
      if (!texture || !image) {
        return;
      }
      const nextMaterial = createPageMaterial(
        texture,
        image,
        depthTextures[step],
        plateTextures[step] ?? null,
        framePresetId,
        currentHologramMode,
        isTurntableEffect
      );
      pageMesh.material = nextMaterial;
      if (pageMaterial !== nextMaterial) {
        pageMaterial.dispose();
      }
      disposables.push(nextMaterial);
      appliedStep = step;
    },
    setParallaxAmount: (_step, amount) => {
      applyParallaxAmount(pageMesh.material, amount);
    },
    setFramePreset: (nextPreset) => {
      applyFramePresetToMaterial(pageMesh.material, nextPreset);
    },
    setHologramMode: (enabled) => {
      currentHologramMode = enabled;
      const val = enabled ? 1.0 : 0.0;
      if (pageMesh.material instanceof THREE.ShaderMaterial && pageMesh.material.uniforms.uHologramMode) {
        pageMesh.material.uniforms.uHologramMode.value = val;
      }
      overlayObjects.forEach((obj) => {
        obj.visible = !enabled;
      });
      syncParticleVisibility();
      voluMaxFx.setEnabled(enabled);
    },
    setVoluMaxFx: (enabled, intensity = "medium") => {
      voluMaxFx.setEnabled(enabled);
      voluMaxFx.setIntensity(intensity);
    },
    setCs5Fx: (options) => {
      cs5FxRig.setOptions(options ?? DEFAULT_CS5_FX_OPTIONS);
    },
    updateParticles: (deltaMs) => {
      voluMaxFx.update(deltaMs);
      cs5FxRig.update(deltaMs);
      if (particles && particles.points.visible) {
        particles.update(deltaMs);
      }
    },
    setGradientShift: (shift, enabled, customFrameColor = null) => {
      applyPresentationFrameColors(root, {
        shift,
        gradientEnabled: enabled,
        customFrameColor,
        framePresetId,
      });
    },
    setFrameBorderWidth: (widthId) => {
      applyFrameBorderScaleToRoot(root, frameBorderScale(widthId));
    },
    setFrameFinish: (finishId) => {
      applyFrameFinishToRoot(root, finishId);
    },
    setCubeSizeScale: (scale) => {
      const s = clampCubeSizeScale(scale);
      pagePivot.scale.setScalar(s);
    },
    dispose: () => {
      disposables.forEach((item) => item.dispose());
      depthTextures.forEach((texture) => texture.dispose());
      if (particles) {
        particles.dispose();
      }
      voluMaxFx.dispose();
      cs5FxRig.dispose();
    },
  };
}
