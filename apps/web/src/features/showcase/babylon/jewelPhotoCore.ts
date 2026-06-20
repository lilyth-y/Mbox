import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { HOLOGRAM_DISPLAY_SPEC, CUBE_FACE_BG_Z, CUBE_FACE_PHOTO_Z } from "@mbox/shared";
import { INNER_SIZE, OUTER_SIZE } from "./jewelCubeMaterials";
import {
  createJewelInnerPhotoMaterial,
  getInnerPhotoMaterialOptions,
  setJewelInnerPhotoAlpha,
  tickJewelInnerPhotoMaterial,
  type JewelInnerPhotoMaterial,
  type JewelInnerPhotoTickContext,
} from "./jewelInnerPhotoMaterial";
import {
  computeInnerPhotoMeshPose,
  createInnerPhotoCubeFaceMeshes,
  createInnerPhotoHeartDualMeshes,
  createInnerPhotoPortraitDualPlateMeshes,
  createInnerPhotoSphereDualDiscMeshes,
  getCubePhotoCavityMetrics,
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
} from "./showcasePhotoFrameColor";
import { getShowcaseCatalogColorState } from "./showcaseCatalogColorState";
import { parseHexColor3 } from "./showcaseColorParse";
import type { ShowcaseShellLightSnapshot } from "./showcaseJewelLighting";

export type JewelPhotoLayout = Exclude<PhotoCrystalPhotoLayoutId, "auto">;

export interface JewelPhotoCoreLayer {
  root: TransformNode;
  mesh: TransformNode;
  faces: Mesh[];
  material: JewelInnerPhotoMaterial;
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
  framePresetId: ShowcasePhotoFramePresetId
): JewelPhotoCoreLayer {
  const pose = computeInnerPhotoMeshPose(shapeId, layout, kind, depthBias);
  const root = new TransformNode(name, scene);
  root.parent = parent;
  root.position.copyFrom(pose.position);

  const photoProfile = getPhotoCrystalPhotoProfile(shapeId);
  const frameEnabled =
    photoProfile.frameEnabled && isShowcasePhotoFrameEnabled(framePresetId);
  const presetColor = getShowcasePhotoFrameColor3(framePresetId);
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
    photoAspect: shapeSpec.portraitAspect,
    photoViewportFill: photoProfile.photoViewportFill,
    cubeHalf,
  });
  const material = createJewelInnerPhotoMaterial(scene, texture, matOptions);
  const faces: Mesh[] = [];

  if (layout === "cube") {
    const cavity = getCubePhotoCavityMetrics(shapeId);
    const faceZScale = OUTER_SIZE / 3.2;
    const faceDepth =
      (kind === "foreground" ? CUBE_FACE_PHOTO_Z : CUBE_FACE_BG_Z) * faceZScale + depthBias;
    const faceMeshes = createInnerPhotoCubeFaceMeshes(
      scene,
      name,
      pose.size,
      root,
      faceDepth,
      cavity.faceHalf
    );
    for (const face of faceMeshes) {
      face.material = material;
      faces.push(face);
    }
  } else if (shapeId === "heart") {
    const tableRadius = getHeartTablePhotoRadius(shapeId);
    const heartFaces = createInnerPhotoHeartDualMeshes(
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

  return { root, mesh: root, faces, material, layout, cubeHalf };
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
    framePresetId
  );

  layer.root.setEnabled(enabled);
  for (const face of layer.faces) {
    face.visibility = 1;
    face.isVisible = true;
  }
  setJewelInnerPhotoAlpha(layer.material, enabled ? 1 : 0);
  return layer;
}

export function setJewelPhotoCoreLayerZ(layer: JewelPhotoCoreLayer, localZ: number): void {
  layer.root.position.z = localZ;
}

export function setJewelPhotoCoreLayerEnabled(layer: JewelPhotoCoreLayer, enabled: boolean): void {
  layer.root.setEnabled(enabled);
  setJewelInnerPhotoAlpha(layer.material, enabled ? 1 : 0);
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
  const photoGain = Math.min(getCrystalPhotoGain() * shapePhotoMul * 0.52, 9.5);

  const tickLayer = (layer: JewelPhotoCoreLayer) => {
    const ctx: JewelInnerPhotoTickContext = { cameraPos, cubeHalf: layer.cubeHalf };
    tickJewelInnerPhotoMaterial(layer.material, fxTimeSec, holoPower, lights, ctx);
    const p = Math.max(0, Math.min(1, holoPower));
    layer.material.setFloat("uPower", (0.72 + p * 0.28) * Math.min(photoGain, 4.5));
    layer.material.setFloat("uPhotoGain", photoGain);
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

function cubeFaceFacingDot(face: Mesh, cameraPos: Vector3): number {
  const group = face.parent;
  if (!group) {
    return -1;
  }
  const worldNormal = Vector3.TransformNormal(
    new Vector3(0, 0, 1),
    group.getWorldMatrix()
  ).normalize();
  const toCam = cameraPos.subtract(face.getAbsolutePosition());
  if (toCam.lengthSquared() < 1e-8) {
    return -1;
  }
  toCam.normalize();
  return Vector3.Dot(worldNormal, toCam);
}

/** Hide side/back cube faces during hero framing — prevents doubled stretched photos. */
export function updateCubePhotoFaceVisibility(
  rig: {
    photoLayout: JewelPhotoLayout;
    bgLayerA: JewelPhotoCoreLayer;
    bgLayerB: JewelPhotoCoreLayer;
    fgLayerA: JewelPhotoCoreLayer | null;
    fgLayerB: JewelPhotoCoreLayer | null;
  },
  cameraPos: Vector3,
  heroLock: boolean,
  facingThreshold = 0.72
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
      if (!heroLock) {
        face.isVisible = true;
        continue;
      }
      face.isVisible = cubeFaceFacingDot(face, cameraPos) >= facingThreshold;
    }
  }
}
