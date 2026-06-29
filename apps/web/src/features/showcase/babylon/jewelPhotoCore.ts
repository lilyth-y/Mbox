import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { HOLOGRAM_DISPLAY_SPEC } from "@mbox/shared";
import { INNER_SIZE } from "./jewelCubeMaterials";
import { computePhotoCrystalPortraitLayout } from "./photoCrystalPortraitLayout";
import {
  applyJewelPhotoDisplayMaterial,
  createJewelPhotoDisplayMaterial,
  setJewelPhotoDisplayAlpha,
  type JewelPhotoDisplayMaterial,
} from "./jewelPhotoMaterialBridge";
import type { HoloContentTextures } from "./holoContentTextures";
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
  createInnerPhotoPortraitPlaneMesh,
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
import type { JewelCubePhysicsRig } from "./jewelCubeFactory";
import { JEWEL_CUBE_FACE_INDICES } from "./jewelCubeFaceLayout";
import type { ShowcaseShellLightSnapshot } from "./showcaseJewelLighting";

export type JewelPhotoLayout = Exclude<PhotoCrystalPhotoLayoutId, "auto">;

export interface JewelPhotoCoreLayer {
  root: TransformNode;
  mesh: TransformNode;
  faces: Mesh[];
  material: JewelPhotoDisplayMaterial;
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

/** Cube with 2+ images — one photo per face (classic photo cube). */
export function shouldBindPerFaceCubePhotos(
  photoLayout: JewelPhotoLayout,
  imageCount: number
): boolean {
  return photoLayout === "cube" && imageCount > 1;
}

function resolveCubeFacePhotoIndex(face: Mesh, faceOrder: number): number {
  const match = face.name.match(/-face-(\d+)$/);
  if (!match) {
    return faceOrder;
  }
  const faceId = Number(match[1]);
  const orderIndex = (JEWEL_CUBE_FACE_INDICES as readonly number[]).indexOf(faceId);
  return orderIndex >= 0 ? orderIndex : faceOrder;
}

function buildCubeFaceMaterialOptions(
  rig: Pick<JewelCubePhysicsRig, "shapeId" | "photoLayout" | "framePresetId" | "bgLayerA">,
  useAlpha: boolean
) {
  const profile = getPhotoCrystalPhotoProfile(rig.shapeId);
  const effectiveFramePreset = resolveShowcaseFramePresetForLayout(
    rig.framePresetId,
    rig.shapeId,
    rig.photoLayout
  );
  const frameEnabled = isShowcasePhotoFrameEnabled(effectiveFramePreset);
  const { photoFrameColorHex } = getShowcaseCatalogColorState();
  const frameColor = frameEnabled
    ? parseHexColor3(photoFrameColorHex, getShowcasePhotoFrameColor3(effectiveFramePreset))
    : undefined;
  return getInnerPhotoMaterialOptions(rig.shapeId, rig.photoLayout, useAlpha, {
    enabled: frameEnabled,
    color: frameColor,
    silhouetteKind: photoSilhouetteKindToShaderId(profile.silhouette),
    polygonSides: profile.polygonSides,
    heartScale: rig.shapeId === "heart" ? getHeartTablePhotoRadius(rig.shapeId) : undefined,
    ...(rig.photoLayout === "cube"
      ? { photoAspect: 1, photoViewportFill: 1, cubeFace: true, cubeBox: false }
      : {}),
    cubeHalf: rig.photoLayout === "cube" ? rig.bgLayerA.cubeHalf : undefined,
  });
}

function applyHoloToCubeLayerFace(
  rig: JewelCubePhysicsRig,
  layer: JewelPhotoCoreLayer,
  face: Mesh,
  faceOrder: number,
  content: HoloContentTextures,
  useAlpha: boolean
): void {
  const bgTex = content.hasDepthSplit ? content.background : content.composite;
  const matOptions = buildCubeFaceMaterialOptions(rig, useAlpha);
  if (faceOrder === 0 && face.material === layer.material) {
    applyJewelPhotoDisplayMaterial(layer.material, bgTex, matOptions);
    return;
  }
  const scene = face.getScene();
  if (!face.material || face.material === layer.material) {
    face.material = createJewelPhotoDisplayMaterial(scene, bgTex, matOptions);
  } else {
    applyJewelPhotoDisplayMaterial(face.material as JewelPhotoDisplayMaterial, bgTex, matOptions);
  }
}

function buildPortraitMaterialOptions(
  rig: Pick<JewelCubePhysicsRig, "shapeId" | "photoLayout" | "framePresetId">,
  useAlpha: boolean
) {
  const shapeSpec = resolvePhotoCrystalShape(rig.shapeId);
  const profile = getPhotoCrystalPhotoProfile(rig.shapeId);
  const effectiveFramePreset = resolveShowcaseFramePresetForLayout(
    rig.framePresetId,
    rig.shapeId,
    rig.photoLayout
  );
  const frameEnabled = isShowcasePhotoFrameEnabled(effectiveFramePreset);
  const { photoFrameColorHex } = getShowcaseCatalogColorState();
  const frameColor = frameEnabled
    ? parseHexColor3(photoFrameColorHex, getShowcasePhotoFrameColor3(effectiveFramePreset))
    : undefined;
  return getInnerPhotoMaterialOptions(rig.shapeId, rig.photoLayout, useAlpha, {
    enabled: frameEnabled,
    color: frameColor,
    silhouetteKind: photoSilhouetteKindToShaderId(profile.silhouette),
    polygonSides: profile.polygonSides,
    heartScale: rig.shapeId === "heart" ? getHeartTablePhotoRadius(rig.shapeId) : undefined,
    circleMask: rig.shapeId === "sphere",
    ...(rig.photoLayout === "cube"
      ? { photoAspect: 1, photoViewportFill: 1, cubeFace: true, cubeBox: false }
      : {
          photoAspect: shapeSpec.portraitAspect,
          photoViewportFill: profile.photoViewportFill,
        }),
    cubeHalf: undefined,
  });
}

function jewelRigHasMorphTwin(
  rig: Pick<JewelCubePhysicsRig, "bgLayerA" | "bgLayerB">
): boolean {
  return rig.bgLayerB !== rig.bgLayerA;
}

/** Bind holo photo to every mesh in a portrait / heart layer (shared or per-face mats). */
export function applyHoloToJewelPhotoLayer(
  rig: Pick<JewelCubePhysicsRig, "shapeId" | "photoLayout" | "framePresetId">,
  layer: JewelPhotoCoreLayer,
  holo: HoloContentTextures,
  useAlpha: boolean
): void {
  const bgTex = holo.hasDepthSplit ? holo.background : holo.composite;
  const matOptions = buildPortraitMaterialOptions(rig as JewelCubePhysicsRig, useAlpha);
  applyJewelPhotoDisplayMaterial(layer.material, bgTex, matOptions);
  for (const face of layer.faces) {
    if (face.material && face.material !== layer.material) {
      applyJewelPhotoDisplayMaterial(
        face.material as JewelPhotoDisplayMaterial,
        bgTex,
        matOptions
      );
    }
    face.isVisible = true;
    face.visibility = 1;
  }
  setJewelPhotoDisplayAlpha(layer.material, 1);
  setJewelPhotoCoreLayerEnabled(layer, true);
}

function applyPortraitHoloToRig(rig: JewelCubePhysicsRig, holo: HoloContentTextures): void {
  if (jewelRigHasMorphTwin(rig)) {
    setJewelPhotoCoreLayerEnabled(rig.bgLayerB, false);
    if (rig.fgLayerB) {
      setJewelPhotoCoreLayerEnabled(rig.fgLayerB, false);
    }
  }
  applyHoloToJewelPhotoLayer(rig, rig.bgLayerA, holo, false);
  if (holo.hasDepthSplit && holo.foreground && rig.fgMatA && rig.fgLayerA) {
    applyHoloToJewelPhotoLayer(
      rig,
      rig.fgLayerA,
      {
        composite: holo.foreground,
        background: holo.background,
        foreground: holo.foreground,
        hasDepthSplit: true,
      },
      true
    );
  } else if (rig.fgLayerA) {
    setJewelPhotoCoreLayerEnabled(rig.fgLayerA, false);
  }
  rig.hasDepthSplit = holo.hasDepthSplit && holo.foreground !== null;
  rig.photoTexture = holo.composite;
  rig.photoMorph.active = false;
  rig.photoMorph.elapsedMs = 0;
}

export function bindCubeLayerPerFacePhotos(
  rig: JewelCubePhysicsRig,
  layer: JewelPhotoCoreLayer,
  faceContents: HoloContentTextures[]
): void {
  if (layer.layout !== "cube" || faceContents.length === 0) {
    return;
  }
  layer.faces.forEach((face, order) => {
    const faceIndex = resolveCubeFacePhotoIndex(face, order);
    const content = faceContents[faceIndex % faceContents.length]!;
    applyHoloToCubeLayerFace(rig, layer, face, order, content, false);
    face.isVisible = true;
    face.visibility = 1;
  });
  setJewelPhotoDisplayAlpha(layer.material, 1);
}

export type JewelFacePhotoRuntime = {
  getHoloContent: (sourceUrl: string) => HoloContentTextures;
};

/** Attach photos to every shape face — cube: one image per face; heart/portrait: all plates. */
export function syncJewelRigFacePhotos(
  rig: JewelCubePhysicsRig,
  runtime: JewelFacePhotoRuntime,
  imageUrls: string[],
  activeImageIndex = 0
): void {
  const urls = imageUrls.filter((url) => typeof url === "string" && url.length > 0);
  if (urls.length === 0) {
    return;
  }

  if (shouldBindPerFaceCubePhotos(rig.photoLayout, urls.length)) {
    const faceContents: HoloContentTextures[] = [];
    for (const url of urls) {
      try {
        faceContents.push(runtime.getHoloContent(url));
      } catch (error) {
        console.warn("[showcase] skip cube face — holo not ready", url.slice(0, 64), error);
        return;
      }
    }
    bindCubeLayerPerFacePhotos(rig, rig.bgLayerA, faceContents);
    if (rig.bgLayerB !== rig.bgLayerA && rig.bgLayerB.root.isEnabled()) {
      bindCubeLayerPerFacePhotos(rig, rig.bgLayerB, faceContents);
    }
    const heroIndex = ((activeImageIndex % urls.length) + urls.length) % urls.length;
    syncCubePullHeroTextures(rig, faceContents[heroIndex]!);
    rig.photoTexture = faceContents[heroIndex]!.composite;
    return;
  }

  const index = ((activeImageIndex % urls.length) + urls.length) % urls.length;
  let holo: HoloContentTextures;
  try {
    holo = runtime.getHoloContent(urls[index]!);
  } catch (error) {
    console.warn("[showcase] portrait holo not ready", urls[index]?.slice(0, 64), error);
    return;
  }
  applyPortraitHoloToRig(rig, holo);
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
  const material = createJewelPhotoDisplayMaterial(scene, texture, matOptions);
  const faces: Mesh[] = [];

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
    for (const face of cubeFaces) {
      face.material = material;
      faces.push(face);
    }
  } else if (shapeId === "heart") {
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
  const framePresetId = options.framePresetId ?? "none";

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
    pullHeroLayer?: JewelPhotoCoreLayer | null;
    pullHeroFgLayer?: JewelPhotoCoreLayer | null;
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
    layer: JewelPhotoCoreLayer,
    p: number
  ) => {
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
    const p = Math.max(0, Math.min(1, holoPower));
    const materials = new Set<JewelPhotoDisplayMaterial>();
    materials.add(layer.material);
    for (const face of layer.faces) {
      const faceMat = face.material as JewelPhotoDisplayMaterial | null;
      if (faceMat) {
        materials.add(faceMat);
      }
    }
    for (const mat of materials) {
      tickMaterial(mat, layer, p);
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
  if (rig.pullHeroLayer?.root.isEnabled()) {
    tickLayer(rig.pullHeroLayer);
  }
  if (rig.pullHeroFgLayer?.root.isEnabled()) {
    tickLayer(rig.pullHeroFgLayer);
  }
}

const CUBE_PULL_HERO_SHAPE: PhotoCrystalShapeId = "cube";

function cubePullHeroMaterialOptions(
  shapeId: PhotoCrystalShapeId,
  framePresetId: ShowcasePhotoFramePresetId,
  useAlpha: boolean
) {
  const shapeSpec = resolvePhotoCrystalShape(shapeId);
  const photoProfile = getPhotoCrystalPhotoProfile(shapeId);
  const effectiveFramePreset = resolveShowcaseFramePresetForLayout(
    framePresetId,
    shapeId,
    "portrait"
  );
  const frameEnabled = isShowcasePhotoFrameEnabled(effectiveFramePreset);
  const presetColor = getShowcasePhotoFrameColor3(effectiveFramePreset);
  const { photoFrameColorHex } = getShowcaseCatalogColorState();
  return getInnerPhotoMaterialOptions(shapeId, "portrait", useAlpha, {
    enabled: frameEnabled,
    color: frameEnabled ? parseHexColor3(photoFrameColorHex, presetColor) : undefined,
    silhouetteKind: photoSilhouetteKindToShaderId(photoProfile.silhouette),
    polygonSides: photoProfile.polygonSides,
    photoAspect: shapeSpec.portraitAspect,
    photoViewportFill: photoProfile.photoViewportFill,
  });
}

/** Single front portrait plate — sellable pull-hold hero for cube six-face layout. */
export function createCubePullHeroPortraitLayer(
  scene: Scene,
  parent: Mesh,
  name: string,
  texture: BaseTexture,
  useAlpha: boolean,
  framePresetId: ShowcasePhotoFramePresetId,
  kind: "background" | "foreground" = "background",
  depthBias = 0
): JewelPhotoCoreLayer {
  const shapeId = CUBE_PULL_HERO_SHAPE;
  const pose = computeInnerPhotoMeshPose(shapeId, "portrait", kind, depthBias);
  const portraitLayout = computePhotoCrystalPortraitLayout(shapeId);
  const root = new TransformNode(name, scene);
  root.parent = parent;
  root.position.copyFrom(pose.position);

  const matOptions = cubePullHeroMaterialOptions(shapeId, framePresetId, useAlpha);
  const material = createJewelPhotoDisplayMaterial(scene, texture, matOptions);
  const photoProfile = getPhotoCrystalPhotoProfile(shapeId);
  const plateW = photoProfile.useSquarePlate
    ? Math.max(portraitLayout.width, portraitLayout.height)
    : portraitLayout.width;
  const plateH = photoProfile.useSquarePlate
    ? Math.max(portraitLayout.width, portraitLayout.height)
    : portraitLayout.height;

  const face = createInnerPhotoPortraitPlaneMesh(scene, `${name}-hero`, plateW, plateH);
  face.parent = root;
  face.material = material;

  return { root, mesh: root, faces: [face], material, layout: "portrait" };
}

export type CubePullHeroRig = {
  shapeId: PhotoCrystalShapeId;
  photoLayout: JewelPhotoLayout;
  framePresetId: ShowcasePhotoFramePresetId;
  collider: Mesh;
  pullHeroLayer?: JewelPhotoCoreLayer | null;
  pullHeroFgLayer?: JewelPhotoCoreLayer | null;
};

export function attachCubePullHeroLayers(
  rig: CubePullHeroRig,
  scene: Scene,
  holoContent: HoloContentTextures,
  hasDepthSplit: boolean
): void {
  if (rig.shapeId !== "cube" || rig.photoLayout !== "cube" || rig.pullHeroLayer) {
    return;
  }

  const bgTex = hasDepthSplit ? holoContent.background : holoContent.composite;
  rig.pullHeroLayer = createCubePullHeroPortraitLayer(
    scene,
    rig.collider,
    `jewel-pull-hero-${rig.collider.name}`,
    bgTex,
    false,
    rig.framePresetId
  );
  setJewelPhotoCoreLayerEnabled(rig.pullHeroLayer, false);

  if (hasDepthSplit && holoContent.foreground) {
    rig.pullHeroFgLayer = createCubePullHeroPortraitLayer(
      scene,
      rig.collider,
      `jewel-pull-hero-fg-${rig.collider.name}`,
      holoContent.foreground,
      true,
      rig.framePresetId,
      "foreground",
      0.005
    );
    setJewelPhotoCoreLayerEnabled(rig.pullHeroFgLayer, false);
  }
}

export function syncCubePullHeroTextures(
  rig: CubePullHeroRig,
  content: HoloContentTextures
): void {
  if (!rig.pullHeroLayer) {
    return;
  }
  const bgTex = content.hasDepthSplit ? content.background : content.composite;
  applyJewelPhotoDisplayMaterial(
    rig.pullHeroLayer.material,
    bgTex,
    cubePullHeroMaterialOptions(rig.shapeId, rig.framePresetId, false)
  );
  if (rig.pullHeroFgLayer && content.foreground) {
    applyJewelPhotoDisplayMaterial(
      rig.pullHeroFgLayer.material,
      content.foreground,
      cubePullHeroMaterialOptions(rig.shapeId, rig.framePresetId, true)
    );
  }
}

/** Max visible cube photo faces on any single enabled six-face layer. */
export function maxVisibleCubePhotoFacesPerLayer(
  rig: {
    photoLayout: JewelPhotoLayout;
    bgLayerA: JewelPhotoCoreLayer;
    bgLayerB: JewelPhotoCoreLayer;
    fgLayerA: JewelPhotoCoreLayer | null;
    fgLayerB: JewelPhotoCoreLayer | null;
    pullHeroLayer?: JewelPhotoCoreLayer | null;
  }
): number {
  if (rig.photoLayout !== "cube") {
    return 0;
  }

  if (rig.pullHeroLayer?.root.isEnabled()) {
    return 0;
  }

  const layers = [rig.bgLayerA, rig.bgLayerB, rig.fgLayerA, rig.fgLayerB].filter(
    (layer): layer is JewelPhotoCoreLayer =>
      layer != null && layer.root.isEnabled() && layer.layout === "cube"
  );

  let maxVisible = 0;
  for (const layer of layers) {
    let layerVisible = 0;
    for (const face of layer.faces) {
      if (face.isVisible) {
        layerVisible += 1;
      }
    }
    maxVisible = Math.max(maxVisible, layerVisible);
  }
  return maxVisible;
}

/** @deprecated Use maxVisibleCubePhotoFacesPerLayer — kept for diagnostics. */
export function countVisibleCubePhotoFaces(
  rig: Parameters<typeof maxVisibleCubePhotoFacesPerLayer>[0]
): number {
  return maxVisibleCubePhotoFacesPerLayer(rig);
}

export type CubePhotoDuplicateFaceAudit = {
  pass: boolean;
  visibleFaces: number;
  morphTwinEnabled: boolean;
};

/** commercial_launch zero-tolerance: pull-hold shows portrait hero, not six-face duplicate. */
export function auditCubePhotoDuplicateFace(
  rig: Parameters<typeof maxVisibleCubePhotoFacesPerLayer>[0] & {
    pullHeroLayer?: JewelPhotoCoreLayer | null;
    pullHeroFgLayer?: JewelPhotoCoreLayer | null;
  },
  inPullHold: boolean
): CubePhotoDuplicateFaceAudit {
  if (rig.photoLayout !== "cube" || !inPullHold) {
    return {
      pass: true,
      visibleFaces: maxVisibleCubePhotoFacesPerLayer(rig),
      morphTwinEnabled: false,
    };
  }

  const morphTwinEnabled =
    rig.bgLayerB.root.isEnabled() && rig.bgLayerB !== rig.bgLayerA;

  const cubeFaceVisible = maxVisibleCubePhotoFacesPerLayer(rig);
  const heroVisible =
    (rig.pullHeroLayer?.root.isEnabled()
      ? rig.pullHeroLayer.faces.filter((f) => f.isVisible).length
      : 0) +
    (rig.pullHeroFgLayer?.root.isEnabled()
      ? rig.pullHeroFgLayer.faces.filter((f) => f.isVisible).length
      : 0);

  const usingHero = Boolean(rig.pullHeroLayer?.root.isEnabled());
  const visibleFaces = usingHero ? heroVisible : cubeFaceVisible;
  const maxHeroFaces = rig.pullHeroFgLayer ? 2 : 1;
  const pass =
    !morphTwinEnabled &&
    (usingHero
      ? cubeFaceVisible === 0 && visibleFaces <= maxHeroFaces
      : visibleFaces <= 1);

  return { pass, visibleFaces, morphTwinEnabled };
}

/**
 * Cube six-face layout during spin; pull-hold swaps to a portrait hero plate (commercial).
 */
export function updateCubePhotoFaceVisibility(
  rig: {
    photoLayout: JewelPhotoLayout;
    bgLayerA: JewelPhotoCoreLayer;
    bgLayerB: JewelPhotoCoreLayer;
    fgLayerA: JewelPhotoCoreLayer | null;
    fgLayerB: JewelPhotoCoreLayer | null;
    pullHeroLayer?: JewelPhotoCoreLayer | null;
    pullHeroFgLayer?: JewelPhotoCoreLayer | null;
  },
  _cameraPos: Vector3,
  heroLock: boolean,
  _facingThreshold = 0.72
): void {
  if (rig.photoLayout !== "cube") {
    return;
  }

  const usePullHero = heroLock && rig.pullHeroLayer != null;

  const cubeLayers = [rig.bgLayerA, rig.bgLayerB, rig.fgLayerA, rig.fgLayerB].filter(
    (layer): layer is JewelPhotoCoreLayer => layer != null
  );

  for (const layer of cubeLayers) {
    if (layer.layout !== "cube" || !layer.root.isEnabled()) {
      continue;
    }
    for (const face of layer.faces) {
      face.isVisible = !usePullHero;
    }
  }

  if (rig.pullHeroLayer) {
    setJewelPhotoCoreLayerEnabled(rig.pullHeroLayer, usePullHero);
    for (const face of rig.pullHeroLayer.faces) {
      face.isVisible = usePullHero;
    }
  }
  if (rig.pullHeroFgLayer) {
    setJewelPhotoCoreLayerEnabled(rig.pullHeroFgLayer, usePullHero);
    for (const face of rig.pullHeroFgLayer.faces) {
      face.isVisible = usePullHero;
    }
  }
}
