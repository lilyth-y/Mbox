import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Scene } from "@babylonjs/core/scene";
import type { PhotoCrystalPhotoLayoutId, PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";
import { createJewelPhotoMorphState, type JewelPhotoMorphState } from "./jewelCubePhotoMorph";
import type { HoloContentTextures } from "./holoContentTextures";
import { attachHoloOpticsToJewelRig, createHoloOpticsRig, disposeHoloOptics, type HoloOpticsRig } from "./holoOptics";
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
import type { JewelPhotoDisplayMaterial } from "./jewelPhotoMaterialBridge";
import {
  applyCrystalMediaReflectionStrength,
  applyUserCrystalSurfaceColor,
} from "./showcaseCrystalColor";
import type { ShowcasePhotoFramePresetId } from "./showcasePhotoFrameColor";
import {
  applyShowcaseFrameSettingsToRig,
  resolveShowcasePhotoFramePresetId,
} from "./showcasePhotoFrameColor";
import {
  resolveShowcaseSubsystemFlags,
  resolveShowcaseGpuTier,
  shouldDeferHavokUntilJewelStable,
  shouldUseKinematicShowcasePreview,
} from "../showcaseGpuProfile";
import { isLocalGpuExportSession, isRenderWorkerExportSession } from "../../../shared/lib/renderExportProfile";
import { isShowcaseAutomationSession } from "../showcaseAutomation";
import { createKinematicPhysicsAggregateStub } from "./jewelKinematicStub";
import { spreadGpuWork, waitGpuFrames } from "./showcaseGpuLoadScheduler";
import {
  pauseShowcaseRender,
  resumeShowcaseRender,
  withPausedShowcaseRender,
} from "./showcaseRenderControl";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Engine } from "@babylonjs/core/Engines/engine";

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
  bgMatA: JewelPhotoDisplayMaterial;
  bgMatB: JewelPhotoDisplayMaterial;
  fgMatA: JewelPhotoDisplayMaterial | null;
  fgMatB: JewelPhotoDisplayMaterial | null;
  /** @deprecated use bgA */
  innerA: TransformNode;
  /** @deprecated use bgB */
  innerB: TransformNode;
  /** @deprecated use bgMatA */
  materialA: JewelPhotoDisplayMaterial;
  /** @deprecated use bgMatB */
  materialB: JewelPhotoDisplayMaterial;
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

function collectJewelRigDrawMeshes(rig: JewelCubePhysicsRig): Mesh[] {
  const meshes: Mesh[] = [rig.shellMesh];
  if (rig.shellInnerMesh) {
    meshes.push(rig.shellInnerMesh);
  }
  for (const layer of [rig.bgLayerA, rig.bgLayerB, rig.fgLayerA, rig.fgLayerB]) {
    if (!layer) {
      continue;
    }
    meshes.push(...layer.faces);
  }
  return meshes;
}

/** Block draw until custom shaders link — prevents parallel-compile CONTEXT_LOST on ANGLE. */
export async function forceCompileJewelRigShaders(rig: JewelCubePhysicsRig): Promise<void> {
  const scene = rig.collider.getScene();
  const engine = scene.getEngine() as Engine;
  const drawMeshes = collectJewelRigDrawMeshes(rig);
  const visibilityRestore = drawMeshes.map((mesh) => ({
    mesh,
    isVisible: mesh.isVisible,
    enabled: mesh.isEnabled(),
  }));

  for (const mesh of drawMeshes) {
    mesh.setEnabled(false);
    mesh.isVisible = false;
  }

  const pairs: Array<{ material: Material | null; mesh: Mesh }> = [
    { material: rig.shellMaterial, mesh: rig.shellMesh },
    { material: rig.shellInnerMaterial, mesh: rig.shellInnerMesh ?? rig.shellMesh },
    { material: rig.bgMatA, mesh: rig.collider },
    { material: rig.bgMatB, mesh: rig.collider },
    { material: rig.fgMatA, mesh: rig.collider },
    { material: rig.fgMatB, mesh: rig.collider },
  ];
  const seen = new Set<Material>();
  const staggerCompile = isLocalGpuExportSession();

  const compileOne = async (material: Material, mesh: Mesh): Promise<void> => {
    try {
      await material.forceCompilationAsync(mesh, {
        useInstances: false,
        disableParallelCompilation: true,
      });
    } catch (error) {
      console.warn("[jewel] shader compile failed", error);
    }
  };

  try {
    if (staggerCompile) {
      for (const { material, mesh } of pairs) {
        if (!material || seen.has(material)) {
          continue;
        }
        seen.add(material);
        await withPausedShowcaseRender(engine, () => compileOne(material, mesh));
        await waitGpuFrames(12);
      }
    } else {
      await withPausedShowcaseRender(engine, async () => {
        for (const { material, mesh } of pairs) {
          if (!material || seen.has(material)) {
            continue;
          }
          seen.add(material);
          await compileOne(material, mesh);
        }
      });
    }
  } finally {
    for (const { mesh, isVisible, enabled } of visibilityRestore) {
      if (mesh.isDisposed()) {
        continue;
      }
      mesh.setEnabled(enabled);
      mesh.isVisible = isVisible;
    }
  }
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
  /** Internal staged spawn — spread GPU work across frames. */
  spawnSlice?: "layerA" | "photos" | "full";
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
  const subsystems = resolveShowcaseSubsystemFlags();
  const hasDepthSplit =
    subsystems.depthSplitForeground &&
    holoContent.hasDepthSplit &&
    holoContent.foreground !== null;
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
  const spawnSlice = options.spawnSlice ?? "full";
  const layerA = createJewelPhotoCoreLayer(
    scene,
    collider,
    `jewel-bg-a-${collider.name}`,
    bgTexA,
    false,
    true,
    { kind: "background", shapeId, photoLayout, framePresetId }
  );

  let layerB: JewelPhotoCoreLayer | null = null;
  if (spawnSlice !== "layerA") {
    layerB = createJewelPhotoCoreLayer(
      scene,
      collider,
      `jewel-bg-b-${collider.name}`,
      bgTexA,
      false,
      false,
      { kind: "background", depthBias: -0.004, shapeId, photoLayout, framePresetId }
    );
  }

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

  if (spawnSlice === "layerA" || spawnSlice === "photos") {
    const shellPending = MeshBuilder.CreateBox(
      `jewel-shell-pending-${collider.name}`,
      { size: 0.01 },
      scene
    );
    shellPending.parent = collider;
    shellPending.isVisible = false;
    shellPending.isPickable = false;
    const pendingMat = new StandardMaterial(`jewel-shell-pending-mat-${collider.name}`, scene);
    pendingMat.alpha = 0;
    shellPending.material = pendingMat;

    const layerBRoot =
      layerB?.root ??
      (() => {
        const pending = new TransformNode(`jewel-bg-b-pending-${collider.name}`, scene);
        pending.parent = collider;
        pending.setEnabled(false);
        return pending;
      })();

    const aggregate = shouldUseKinematicShowcasePreview() || shouldDeferHavokUntilJewelStable()
      ? createKinematicPhysicsAggregateStub()
      : new PhysicsAggregate(
          collider,
          PhysicsShapeType.BOX,
          { mass, restitution, friction: 0.38 },
          scene
        );

    const disposeLayer = (layer: JewelPhotoCoreLayer) => {
      layer.material.dispose(false, false);
      for (const face of layer.faces) {
        face.dispose();
      }
      layer.root.dispose();
    };

    const rigPartial = {
      collider,
      shapeId,
      photoLayout,
      framePresetId,
      bgA: layerA.root,
      bgB: layerBRoot,
      fgA: fgLayerA?.root ?? null,
      fgB: fgLayerB?.root ?? null,
      bgLayerA: layerA,
      bgLayerB: layerB ?? layerA,
      fgLayerA: fgLayerA,
      fgLayerB: fgLayerB,
      bgMatA: layerA.material,
      bgMatB: layerB?.material ?? layerA.material,
      fgMatA: fgLayerA?.material ?? null,
      fgMatB: fgLayerB?.material ?? null,
      innerA: layerA.root,
      innerB: layerB?.root ?? layerBRoot,
      materialA: layerA.material,
      materialB: layerB?.material ?? layerA.material,
      aggregate,
      photoTexture: holoContent.composite,
      shellMesh: shellPending,
      shellInnerMesh: null as Mesh | null,
      shellMaterial: pendingMat as unknown as JewelCrystalShellMaterial,
      shellInnerMaterial: null,
      photoMorph: createJewelPhotoMorphState(),
      hasDepthSplit,
      holoPower: 0,
      fxTimeSec: 0,
      crystalSizeScale: 1,
      holoOptics: createHoloOpticsRig(),
      dispose: () => {
        aggregate.dispose();
        disposeLayer(layerA);
        if (layerB) {
          disposeLayer(layerB);
        } else {
          layerBRoot.dispose();
        }
        if (fgLayerA) {
          disposeLayer(fgLayerA);
        }
        if (fgLayerB) {
          disposeLayer(fgLayerB);
        }
        bindShowcaseShellGlow(null);
        pendingMat.dispose();
        shellPending.dispose();
        collider.dispose();
      },
    };
    applyShowcaseFrameSettingsToRig(rigPartial, framePresetId, options.photoFrameColorHex);
    return rigPartial as JewelCubePhysicsRig;
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
  if (subsystems.shellInnerLayer && shapeUsesCrystalShellInnerLayer(shapeId, photoLayout)) {
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

  const aggregate = shouldUseKinematicShowcasePreview() || shouldDeferHavokUntilJewelStable()
    ? createKinematicPhysicsAggregateStub()
    : new PhysicsAggregate(
        collider,
        PhysicsShapeType.BOX,
        { mass, restitution, friction: 0.38 },
        scene
      );

  if (!layerB) {
    throw new Error("[jewel] layerB required for full spawn");
  }

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

/** Attach crystal shell shaders after photo layers warmed the GPU (simplified tier). */
export function attachJewelCrystalShell(
  rig: JewelCubePhysicsRig,
  scene: Scene,
  envTexture: BaseTexture | null
): void {
  const subsystems = resolveShowcaseSubsystemFlags();
  const shapeId = rig.shapeId;
  const photoLayout = rig.photoLayout;

  rig.shellMesh.dispose();
  rig.shellMaterial.dispose();

  const shellMaterial = createJewelCrystalShellMaterial(scene, envTexture);
  const shell = createPhotoCrystalShellMesh(scene, `jewel-shell-${rig.collider.name}`, shapeId);
  shell.parent = rig.collider;
  shell.material = shellMaterial;
  shell.renderingGroupId = 2;
  shell.isPickable = false;
  shell.inheritVisibility = false;
  configureCrystalShellEdges(shell);
  shellMaterial.backFaceCulling = false;

  let shellInner: Mesh | null = null;
  let shellInnerMaterial: JewelCrystalShellMaterial | null = null;
  if (subsystems.shellInnerLayer && shapeUsesCrystalShellInnerLayer(shapeId, photoLayout)) {
    shellInnerMaterial = createJewelCrystalShellInnerMaterial(scene, envTexture);
    shellInner = createCrystalShellInnerLayer(shell, getCrystalShellInnerInset(shapeId));
    shellInner.material = shellInnerMaterial;
    shellInner.renderingGroupId = 0;
    configureCrystalShellEdges(shellInner);
    shellInnerMaterial.backFaceCulling = false;
    shellInnerMaterial.setFloat("uShellAlpha", 0.06);
    shellInnerMaterial.setFloat("uGlossBoost", 0.52);
    applyUserCrystalSurfaceColor(shellInnerMaterial);
  }

  applyConvexCrystalShellTuning(shellMaterial, shapeId);
  applyUserCrystalSurfaceColor(shellMaterial);
  applyCrystalMediaReflectionStrength(shellMaterial);

  rig.shellMesh = shell;
  rig.shellMaterial = shellMaterial;
  rig.shellInnerMesh = shellInner;
  rig.shellInnerMaterial = shellInnerMaterial;
  rig.holoOptics = attachHoloOpticsToJewelRig(rig, scene);
}

/** Second spread step — morph B-face after layer A shaders compiled. */
export function appendJewelBgLayerB(
  rig: JewelCubePhysicsRig,
  scene: Scene,
  options: JewelCubeSpawnOptions
): void {
  if (rig.bgLayerB !== rig.bgLayerA && rig.bgLayerB.root.name.includes("jewel-bg-b-")) {
    return;
  }

  const { holoContent } = options;
  const subsystems = resolveShowcaseSubsystemFlags();
  const hasDepthSplit =
    subsystems.depthSplitForeground &&
    holoContent.hasDepthSplit &&
    holoContent.foreground !== null;
  const shapeId = rig.shapeId;
  const photoLayout = rig.photoLayout;
  const framePresetId = rig.framePresetId;
  const bgTexA = hasDepthSplit ? holoContent.background : holoContent.composite;

  if (rig.bgB.name.includes("pending")) {
    rig.bgB.dispose();
  }

  const layerB = createJewelPhotoCoreLayer(
    scene,
    rig.collider,
    `jewel-bg-b-${rig.collider.name}`,
    bgTexA,
    false,
    false,
    { kind: "background", depthBias: -0.004, shapeId, photoLayout, framePresetId }
  );

  rig.bgB = layerB.root;
  rig.bgLayerB = layerB;
  rig.bgMatB = layerB.material;
  rig.innerB = layerB.root;
  rig.materialB = layerB.material;
}

/** Windows simplified: layer A → layer B → crystal shell across GPU frame gaps. */
export async function createJewelCubePhysicsRigStaged(
  scene: Scene,
  options: JewelCubeSpawnOptions
): Promise<JewelCubePhysicsRig> {
  const engine = scene.getEngine() as Engine;
  pauseShowcaseRender(engine);
  let core: JewelCubePhysicsRig | null = null;

  try {
    await spreadGpuWork([
      () => {
        core = createJewelCubePhysicsRig(scene, { ...options, spawnSlice: "layerA" });
      },
      () => {
        if (core) {
          appendJewelBgLayerB(core, scene, options);
        }
      },
    ]);

    if (!core) {
      throw new Error("[jewel] staged spawn failed");
    }
    await forceCompileJewelRigShaders(core);
    await waitGpuFrames(6);
    return core;
  } finally {
    resumeShowcaseRender(engine);
  }
}

export function shouldStageJewelCubeSpawn(): boolean {
  if (isLocalGpuExportSession()) {
    return true;
  }
  if (isRenderWorkerExportSession()) {
    return false;
  }
  if (isShowcaseAutomationSession()) {
    return true;
  }
  return resolveShowcaseGpuTier() === "simplified";
}

/** Swap kinematic stub for Havok aggregate after jewel shaders are stable. */
export function upgradeJewelRigToHavokPhysics(
  rig: JewelCubePhysicsRig,
  scene: Scene,
  mass = 1.35,
  restitution = 0.58
): void {
  rig.aggregate.dispose();
  rig.aggregate = new PhysicsAggregate(
    rig.collider,
    PhysicsShapeType.BOX,
    { mass, restitution, friction: 0.38 },
    scene
  );
}
