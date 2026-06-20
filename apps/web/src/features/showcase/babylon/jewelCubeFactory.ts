import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Scene } from "@babylonjs/core/scene";
import type { PhotoCrystalPhotoLayoutId, PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";
import { createJewelPhotoMorphState, type JewelPhotoMorphState } from "./jewelCubePhotoMorph";
import type { HoloContentTextures } from "./holoContentTextures";
import { attachHoloOpticsToJewelRig, disposeHoloOptics, type HoloOpticsRig } from "./holoOptics";
import { bindShowcaseShellGlow } from "./showcaseShellGlow";
import { configureCrystalShellEdges } from "./jewelCubeMaterials";
import {
  createJewelPhotoCoreLayer,
  resolveJewelPhotoLayout,
  type JewelPhotoCoreLayer,
  type JewelPhotoLayout,
} from "./jewelPhotoCore";
import { createPhotoCrystalCollider, createPhotoCrystalShellMesh, createCrystalShellInnerLayer, getCrystalShellInnerInset, shapeUsesCrystalShellInnerLayer } from "./photoCrystalShapeFactory";
import {
  createJewelCrystalShellInnerMaterial,
  createJewelCrystalShellMaterial,
  applyConvexCrystalShellTuning,
  type JewelCrystalShellMaterial,
} from "./shaders/jewelCrystalShellShader";
import type { JewelInnerPhotoMaterial } from "./jewelInnerPhotoMaterial";
import {
  applyCrystalMediaReflectionStrength,
  applyUserCrystalSurfaceColor,
} from "./showcaseCrystalColor";
import type { ShowcasePhotoFramePresetId } from "./showcasePhotoFrameColor";
import {
  applyShowcaseFrameSettingsToRig,
  resolveShowcasePhotoFramePresetId,
} from "./showcasePhotoFrameColor";

export interface JewelCubePhysicsRig {
  collider: Mesh;
  shapeId: PhotoCrystalShapeId;
  photoLayout: JewelPhotoLayout;
  framePresetId: ShowcasePhotoFramePresetId;
  bgA: TransformNode;
  bgB: TransformNode;
  fgA: TransformNode | null;
  fgB: TransformNode | null;
  bgLayerA: JewelPhotoCoreLayer;
  bgLayerB: JewelPhotoCoreLayer;
  fgLayerA: JewelPhotoCoreLayer | null;
  fgLayerB: JewelPhotoCoreLayer | null;
  bgMatA: JewelInnerPhotoMaterial;
  bgMatB: JewelInnerPhotoMaterial;
  fgMatA: JewelInnerPhotoMaterial | null;
  fgMatB: JewelInnerPhotoMaterial | null;
  /** @deprecated use bgA */
  innerA: TransformNode;
  /** @deprecated use bgB */
  innerB: TransformNode;
  /** @deprecated use bgMatA */
  materialA: JewelInnerPhotoMaterial;
  /** @deprecated use bgMatB */
  materialB: JewelInnerPhotoMaterial;
  aggregate: PhysicsAggregate;
  photoTexture: BaseTexture;
  shellMesh: Mesh;
  shellInnerMesh: Mesh | null;
  shellMaterial: JewelCrystalShellMaterial;
  shellInnerMaterial: JewelCrystalShellMaterial | null;
  photoMorph: JewelPhotoMorphState;
  holoOptics: HoloOpticsRig;
  hasDepthSplit: boolean;
  holoPower: number;
  fxTimeSec: number;
  /** Runtime scale from catalog slider */
  crystalSizeScale: number;
  dispose: () => void;
}

export interface JewelCubeSpawnOptions {
  holoContent: HoloContentTextures;
  envTexture: BaseTexture | null;
  shapeId?: PhotoCrystalShapeId;
  photoLayout?: PhotoCrystalPhotoLayoutId;
  framePresetId?: ShowcasePhotoFramePresetId;
  photoFrameColorHex?: string;
  spawnY?: number;
  spawnX?: number;
  spawnZ?: number;
  mass?: number;
  restitution?: number;
}

export function createJewelCubePhysicsRig(
  scene: Scene,
  options: JewelCubeSpawnOptions
): JewelCubePhysicsRig {
  const spawnY = options.spawnY ?? 7.2;
  const spawnX = options.spawnX ?? 0;
  const spawnZ = options.spawnZ ?? 0;
  const mass = options.mass ?? 1.35;
  const restitution = options.restitution ?? 0.58;
  const { holoContent } = options;
  const hasDepthSplit = holoContent.hasDepthSplit && holoContent.foreground !== null;
  const shapeId = options.shapeId ?? "cube";
  const photoLayout = resolveJewelPhotoLayout(shapeId, options.photoLayout);
  const framePresetId = resolveShowcasePhotoFramePresetId(options.framePresetId);

  const collider = createPhotoCrystalCollider(scene, `jewel-collider-${Date.now()}`, shapeId);
  collider.position = new Vector3(spawnX, spawnY, spawnZ);
  collider.isVisible = false;
  collider.visibility = 0;
  collider.material = null;
  collider.isPickable = false;

  const bgTexA = hasDepthSplit ? holoContent.background : holoContent.composite;
  const layerA = createJewelPhotoCoreLayer(
    scene,
    collider,
    `jewel-bg-a-${collider.name}`,
    bgTexA,
    false,
    true,
    { kind: "background", shapeId, photoLayout, framePresetId }
  );
  const layerB = createJewelPhotoCoreLayer(
    scene,
    collider,
    `jewel-bg-b-${collider.name}`,
    bgTexA,
    false,
    false,
    { kind: "background", depthBias: -0.004, shapeId, photoLayout, framePresetId }
  );

  let fgLayerA: JewelPhotoCoreLayer | null = null;
  let fgLayerB: JewelPhotoCoreLayer | null = null;
  if (hasDepthSplit && holoContent.foreground) {
    fgLayerA = createJewelPhotoCoreLayer(
      scene,
      collider,
      `jewel-fg-a-${collider.name}`,
      holoContent.foreground,
      true,
      true,
      { kind: "foreground", shapeId, photoLayout, framePresetId }
    );
    fgLayerB = createJewelPhotoCoreLayer(
      scene,
      collider,
      `jewel-fg-b-${collider.name}`,
      holoContent.foreground,
      true,
      false,
      { kind: "foreground", depthBias: 0.005, shapeId, photoLayout, framePresetId }
    );
  }

  const shellMaterial = createJewelCrystalShellMaterial(scene, options.envTexture);
  const shell = createPhotoCrystalShellMesh(scene, `jewel-shell-${collider.name}`, shapeId);
  shell.parent = collider;
  shell.material = shellMaterial;
  shell.renderingGroupId = 2;
  shell.isPickable = false;
  shell.inheritVisibility = false;
  configureCrystalShellEdges(shell);
  shellMaterial.backFaceCulling = false;

  let shellInner: Mesh | null = null;
  let shellInnerMaterial: JewelCrystalShellMaterial | null = null;
  if (shapeUsesCrystalShellInnerLayer(shapeId, photoLayout)) {
    shellInnerMaterial = createJewelCrystalShellInnerMaterial(scene, options.envTexture);
    shellInner = createCrystalShellInnerLayer(shell, getCrystalShellInnerInset(shapeId));
    shellInner.material = shellInnerMaterial;
    shellInner.renderingGroupId = 0;
    configureCrystalShellEdges(shellInner);
    shellInnerMaterial.backFaceCulling = false;
    shellInnerMaterial.setFloat("uShellAlpha", 0.06);
    shellInnerMaterial.setFloat("uGlossBoost", 0.52);
  }

  applyConvexCrystalShellTuning(shellMaterial, shapeId);
  applyUserCrystalSurfaceColor(shellMaterial);
  applyCrystalMediaReflectionStrength(shellMaterial);
  if (shellInnerMaterial) {
    applyUserCrystalSurfaceColor(shellInnerMaterial);
  }

  const aggregate = new PhysicsAggregate(
    collider,
    PhysicsShapeType.BOX,
    { mass, restitution, friction: 0.38 },
    scene
  );

  const rigPartial = {
    collider,
    shapeId,
    photoLayout,
    framePresetId,
    bgA: layerA.root,
    bgB: layerB.root,
    fgA: fgLayerA?.root ?? null,
    fgB: fgLayerB?.root ?? null,
    bgLayerA: layerA,
    bgLayerB: layerB,
    fgLayerA: fgLayerA,
    fgLayerB: fgLayerB,
    bgMatA: layerA.material,
    bgMatB: layerB.material,
    fgMatA: fgLayerA?.material ?? null,
    fgMatB: fgLayerB?.material ?? null,
    innerA: layerA.root,
    innerB: layerB.root,
    materialA: layerA.material,
    materialB: layerB.material,
    aggregate,
    photoTexture: holoContent.composite,
    shellMesh: shell,
    shellInnerMesh: shellInner,
    shellMaterial,
    shellInnerMaterial,
    photoMorph: createJewelPhotoMorphState(),
    hasDepthSplit,
    holoPower: 0,
    fxTimeSec: 0,
    crystalSizeScale: 1,
  };

  applyShowcaseFrameSettingsToRig(rigPartial, framePresetId, options.photoFrameColorHex);

  const holoOptics = attachHoloOpticsToJewelRig(rigPartial, scene);

  const disposeLayer = (layer: JewelPhotoCoreLayer) => {
    layer.material.dispose(false, false);
    for (const face of layer.faces) {
      face.dispose();
    }
    layer.root.dispose();
  };

  const dispose = () => {
    aggregate.dispose();
    disposeLayer(layerA);
    disposeLayer(layerB);
    if (fgLayerA) {
      disposeLayer(fgLayerA);
    }
    if (fgLayerB) {
      disposeLayer(fgLayerB);
    }
    bindShowcaseShellGlow(null);
    shellInner?.dispose();
    shell.dispose();
    shellInnerMaterial?.dispose();
    shellMaterial.dispose();
    disposeHoloOptics(holoOptics);
    collider.dispose();
  };

  return { ...rigPartial, holoOptics, dispose };
}
