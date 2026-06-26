import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { HOLOGRAM_DISPLAY_SPEC } from "@mbox/shared";
import { INNER_SIZE } from "./jewelCubeMaterials";
import {
  createJewelPhotoDisplayMaterial,
  setJewelPhotoDisplayAlpha,
  type JewelPhotoDisplayMaterial,
} from "./jewelPhotoMaterialBridge";
import {
  getInnerPhotoMaterialOptions,
  tickJewelInnerPhotoMaterial,
  type JewelInnerPhotoTickContext,
} from "./jewelInnerPhotoMaterial";
import {
  computeInnerPhotoMeshPose,
  createInnerPhotoCubeFaceMeshes,
  getCubePhotoCavityMetrics,
  createInnerPhotoHeartTableMeshes,
  createInnerPhotoPortraitDualPlateMeshes,
  createInnerPhotoSphereDualDiscMeshes,
  getSphereInnerPhotoDiscMetrics,
  getHeartTablePhotoRadius,
  getPortraitSlabDimensions,
} from "./jewelPhotoInnerMesh";
import type { PhotoCrystalPhotoLayoutId, PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";
import { getConvexShellPhotoTuning } from "./photoCrystalShapeFactory";
import {
  getCrystalPhotoGain,
} from "./showcaseCatalogColorState";
import { resolvePhotoCrystalShape } from "./photoCrystalShapeCatalog";
import { getPhotoCrystalPhotoProfile, photoSilhouetteKindToShaderId } from "./photoCrystalPhotoProfile";
import type { ShowcasePhotoFramePresetId } from "./showcasePhotoFrameColor";
import {
  getShowcasePhotoFrameColor3,
  isShowcasePhotoFrameEnabled,
  resolveShowcaseFramePresetForLayout,
} from "./showcasePhotoFrameColor";
import { getShowcaseCatalogColorState } from "./showcaseCatalogColorState";
import { parseHexColor3 } from "./showcaseColorParse";
import type { ShowcaseShellLightSnapshot } from "./showcaseJewelLighting";

export type JewelPhotoLayout = Exclude<PhotoCrystalPhotoLayoutId, "auto">;

export interface JewelPhotoCoreLayer {
  root: TransformNode;
  mesh: TransformNode;
  faces: Mesh[];
  material: JewelPhotoDisplayMaterial;
  /** Per-face materials when cube uses distinct face textures. */
  faceMaterials?: JewelPhotoDisplayMaterial[];
  layout: JewelPhotoLayout;
  /** Half-edge for cube-box photo UV (cube layout only). */
  cubeHalf?: number;
}

export interface JewelPhotoCoreLayerOptions {
  kind?: "background" | "foreground";
  depthBias?: number;
  shapeId?: PhotoCrystalShapeId;
  photoLayout?: PhotoCrystalPhotoLayoutId;
  framePresetId?: ShowcasePhotoFramePresetId;
  /** Per-face textures for cube layout (6 entries). */
  faceTextures?: BaseTexture[];
}

export function resolveJewelPhotoLayout(
  shapeId: PhotoCrystalShapeId,
  override?: PhotoCrystalPhotoLayoutId
): JewelPhotoLayout {
  if (override && override !== "auto") {
    return override;
  }
  return resolvePhotoCrystalShape(shapeId).photoMode;
}

function createInnerPhotoMeshLayer(
  scene: Scene,
  parent: Mesh,
  name: string,
  texture: BaseTexture,
  useAlpha: boolean,
  shapeId: PhotoCrystalShapeId,
  layout: JewelPhotoLayout,
  kind: "background" | "foreground",
  depthBias: number,
  framePresetId: ShowcasePhotoFramePresetId,
  faceTextures?: BaseTexture[]
): JewelPhotoCoreLayer {
  const pose = computeInnerPhotoMeshPose(shapeId, layout, kind, depthBias);
  const root = new TransformNode(name, scene);
  root.parent = parent;
  root.position.copyFrom(pose.position);

  const photoProfile = getPhotoCrystalPhotoProfile(shapeId);
  const effectiveFramePreset = resolveShowcaseFramePresetForLayout(
    framePresetId,
    shapeId,
    layout
  );
  const frameEnabled = isShowcasePhotoFrameEnabled(effectiveFramePreset);
  const presetColor = getShowcasePhotoFrameColor3(effectiveFramePreset);
  const { photoFrameColorHex } = getShowcaseCatalogColorState();
  const shapeSpec = resolvePhotoCrystalShape(shapeId);
  const cubeHalf = layout === "cube" ? pose.size * 0.5 : undefined;
  const matOptions = getInnerPhotoMaterialOptions(shapeId, layout, useAlpha, {
    enabled: frameEnabled,
    color: frameEnabled ? parseHexColor3(photoFrameColorHex, presetColor) : undefined,
    silhouetteKind: photoSilhouetteKindToShaderId(photoProfile.silhouette),
    polygonSides: photoProfile.polygonSides,
    heartScale: shapeId === "heart" ? getHeartTablePhotoRadius(shapeId) : undefined,
    circleMask: shapeId === "sphere",
    ...(layout === "cube"
      ? { photoAspect: 1, photoViewportFill: 1, cubeFace: true, cubeBox: false }
      : {
          photoAspect: shapeSpec.portraitAspect,
          photoViewportFill: photoProfile.photoViewportFill,
        }),
    cubeHalf,
  });
  const faces: Mesh[] = [];
  let material: JewelPhotoDisplayMaterial;
  let faceMaterials: JewelPhotoDisplayMaterial[] | undefined;

  if (layout === "cube") {
    const { edgeSize, faceHalf } = getCubePhotoCavityMetrics(shapeId);
    const cubeFaces = createInnerPhotoCubeFaceMeshes(
      scene,
      `${name}-inner`,
      edgeSize,
      root,
      0,
      faceHalf
    );
    if (faceTextures && faceTextures.length >= cubeFaces.length) {
      faceMaterials = cubeFaces.map((face, index) => {
        const faceMat = createJewelPhotoDisplayMaterial(scene, faceTextures[index]!, matOptions);
        face.material = faceMat;
        return faceMat;
      });
      material = faceMaterials[0]!;
    } else {
      material = createJewelPhotoDisplayMaterial(scene, texture, matOptions);
      for (const face of cubeFaces) {
        face.material = material;
      }
    }
    faces.push(...cubeFaces);
  } else if (shapeId === "heart") {
    material = createJewelPhotoDisplayMaterial(scene, texture, matOptions);
    const tableRadius = getHeartTablePhotoRadius(shapeId);
    const heartFaces = createInnerPhotoHeartTableMeshes(
      scene,
      `${name}-heart`,
      tableRadius,
      shapeId
    );
    for (const face of heartFaces) {
      face.parent = root;
      face.material = material;
      faces.push(face);
    }
  } else if (shapeId === "sphere") {
    material = createJewelPhotoDisplayMaterial(scene, texture, matOptions);
    const { diameter, zInset } = getSphereInnerPhotoDiscMetrics(shapeId);
    const sphereFaces = createInnerPhotoSphereDualDiscMeshes(
      scene,
      `${name}-sphere-disc`,
      diameter,
      zInset
    );
    for (const face of sphereFaces) {
      face.parent = root;
      face.material = material;
      faces.push(face);
    }
  } else {
    material = createJewelPhotoDisplayMaterial(scene, texture, matOptions);
    const { width, height } = getPortraitSlabDimensions(shapeId);
    const plateW = photoProfile.useSquarePlate ? Math.max(width, height) : width;
    const plateH = photoProfile.useSquarePlate ? Math.max(width, height) : height;
    const zInset = Math.max(pose.slabDepth * 0.5, INNER_SIZE * 0.011);
    const dualFaces = createInnerPhotoPortraitDualPlateMeshes(
      scene,
      `${name}-dual-portrait`,
      plateW,
      plateH,
      zInset
    );
    for (const face of dualFaces) {
      face.parent = root;
      face.material = material;
      faces.push(face);
    }
  }

  return { root, mesh: root, faces, material, faceMaterials, layout, cubeHalf };
}

export function disposeJewelPhotoCoreLayer(layer: JewelPhotoCoreLayer): void {
  if (layer.faceMaterials) {
    const seen = new Set<JewelPhotoDisplayMaterial>();
    for (const mat of layer.faceMaterials) {
      if (seen.has(mat)) {
        continue;
      }
      seen.add(mat);
      mat.dispose(false, false);
    }
  } else {
    layer.material.dispose(false, false);
  }
  for (const face of layer.faces) {
    face.dispose();
  }
  layer.root.dispose();
}

export function createJewelPhotoCoreLayer(
  scene: Scene,
  parent: Mesh,
  name: string,
  texture: BaseTexture,
  useAlpha: boolean,
  enabled: boolean,
  options: JewelPhotoCoreLayerOptions = {}
): JewelPhotoCoreLayer {
  const kind = options.kind ?? "background";
  const depthBias = options.depthBias ?? 0;
  const shapeId = options.shapeId ?? "cube";
  const layout = resolveJewelPhotoLayout(shapeId, options.photoLayout);
  const framePresetId = options.framePresetId ?? "rose_gold";

  const layer = createInnerPhotoMeshLayer(
    scene,
    parent,
    name,
    texture,
    useAlpha,
    shapeId,
    layout,
    kind,
    depthBias,
    framePresetId,
    options.faceTextures
  );

  layer.root.setEnabled(enabled);
  for (const face of layer.faces) {
    face.visibility = 1;
    face.isVisible = true;
  }
  setJewelPhotoDisplayAlpha(layer.material, enabled ? 1 : 0);
  return layer;
}

export function setJewelPhotoCoreLayerZ(layer: JewelPhotoCoreLayer, localZ: number): void {
  layer.root.position.z = localZ;
}

export function setJewelPhotoCoreLayerEnabled(layer: JewelPhotoCoreLayer, enabled: boolean): void {
  layer.root.setEnabled(enabled);
  setJewelPhotoDisplayAlpha(layer.material, enabled ? 1 : 0);
}

export function getJewelPhotoCoreZOffset(kind: "background" | "foreground"): number {
  const spec = HOLOGRAM_DISPLAY_SPEC;
  const mul = kind === "background" ? spec.backgroundZOffset : spec.foregroundZOffset;
  return mul * INNER_SIZE;
}

export function tickJewelPhotoCoreLayers(
  rig: {
    shapeId: PhotoCrystalShapeId;
    bgLayerA: JewelPhotoCoreLayer;
    bgLayerB: JewelPhotoCoreLayer;
    fgLayerA: JewelPhotoCoreLayer | null;
    fgLayerB: JewelPhotoCoreLayer | null;
    fxTimeSec: number;
    holoPower: number;
  },
  lights?: ShowcaseShellLightSnapshot,
  cameraPos?: Vector3
): void {
  const { fxTimeSec, holoPower, shapeId } = rig;
  const shapePhotoMul = getConvexShellPhotoTuning(shapeId).photoPowerMul;
  const baseGain = getCrystalPhotoGain();
  const photoGain =
    baseGain <= 1.001
      ? 1
      : Math.min(baseGain * shapePhotoMul * 0.95, 14);

  const tickMaterial = (
    mat: JewelPhotoDisplayMaterial,
    layer: JewelPhotoCoreLayer
  ) => {
    const p = Math.max(0, Math.min(1, holoPower));
    if (mat.getClassName?.() === "StandardMaterial") {
      const std = mat as import("@babylonjs/core/Materials/standardMaterial").StandardMaterial;
      const intensity = (0.94 + 0.26 * p) * Math.min(photoGain, 6.5);
      std.emissiveColor.set(intensity, intensity, intensity);
      setJewelPhotoDisplayAlpha(std, p < 0.02 ? 0 : 1);
      return;
    }
    if (mat.getClassName?.() !== "ShaderMaterial") {
      return;
    }
    const shaderMat = mat as import("./jewelInnerPhotoMaterial").JewelInnerPhotoMaterial;
    const ctx: JewelInnerPhotoTickContext = { cameraPos, cubeHalf: layer.cubeHalf };
    tickJewelInnerPhotoMaterial(shaderMat, fxTimeSec, holoPower, lights, ctx);
    shaderMat.setFloat("uPower", (0.82 + p * 0.32) * Math.min(photoGain, 6.5));
    shaderMat.setFloat("uPhotoGain", photoGain);
  };

  const tickLayer = (layer: JewelPhotoCoreLayer) => {
    const materials = layer.faceMaterials ?? [layer.material];
    for (const mat of materials) {
      tickMaterial(mat, layer);
    }
  };

  tickLayer(rig.bgLayerA);
  if (rig.bgLayerB.root.isEnabled()) {
    tickLayer(rig.bgLayerB);
  }
  if (rig.fgLayerA) {
    tickLayer(rig.fgLayerA);
  }
  if (rig.fgLayerB?.root.isEnabled() && rig.fgLayerB) {
    tickLayer(rig.fgLayerB);
  }
}

/** Cube six-face layout — always keep all faces visible (closed box). */
export function updateCubePhotoFaceVisibility(
  rig: {
    photoLayout: JewelPhotoLayout;
    bgLayerA: JewelPhotoCoreLayer;
    bgLayerB: JewelPhotoCoreLayer;
    fgLayerA: JewelPhotoCoreLayer | null;
    fgLayerB: JewelPhotoCoreLayer | null;
  },
  _cameraPos: Vector3,
  _heroLock: boolean,
  _facingThreshold = 0.72
): void {
  if (rig.photoLayout !== "cube") {
    return;
  }

  const layers = [rig.bgLayerA, rig.bgLayerB, rig.fgLayerA, rig.fgLayerB].filter(
    (layer): layer is JewelPhotoCoreLayer => layer != null
  );

  for (const layer of layers) {
    if (layer.layout !== "cube") {
      continue;
    }
    for (const face of layer.faces) {
      // Six-face cube must stay closed — hiding sides reads as the box opening.
      face.isVisible = true;
    }
  }
}
