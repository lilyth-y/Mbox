import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Scene } from "@babylonjs/core/scene";
import type { PhotoCrystalPhotoLayoutId, PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";
import { createJewelPhotoMorphState, type JewelPhotoMorphState } from "./jewelCubePhotoMorph";
import type { HoloContentTextures } from "./holoContentTextures";
import { attachHoloOpticsToJewelRig, createHoloOpticsRig, disposeHoloOptics, type HoloOpticsRig } from "./holoOptics";
import { bindShowcaseShellGlow } from "./showcaseShellGlow";
import { configureCrystalShellEdges } from "./jewelCubeMaterials";
import {
  createJewelPhotoCoreLayer,
  disposeJewelPhotoCoreLayer,
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
  usesJewelPhotoMorphTwin,
} from "../showcaseGpuProfile";
import { isRenderWorkerExportSession } from "../../../shared/lib/renderExportProfile";
import { isLocalGpuSession } from "../../../shared/lib/gpuSession";
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

export function isJewelShellRenderable(rig: JewelCubePhysicsRig): boolean {
  return !rig.shellMesh.name.includes("pending");
}

function createJewelShellStub(
  scene: Scene,
  collider: Mesh,
  label: string
): { shellMesh: Mesh; shellMaterial: JewelCrystalShellMaterial } {
  const shellMesh = MeshBuilder.CreateBox(`jewel-shell-pending-${label}`, { size: 0.01 }, scene);
  shellMesh.parent = collider;
  shellMesh.isVisible = false;
  shellMesh.isPickable = false;
  const shellMaterial = new StandardMaterial(`jewel-shell-pending-mat-${label}`, scene);
  shellMaterial.alpha = 0;
  shellMesh.material = shellMaterial;
  return {
    shellMesh,
    shellMaterial: shellMaterial as unknown as JewelCrystalShellMaterial,
  };
}

function collectJewelRigDrawMeshes(rig: JewelCubePhysicsRig): Mesh[] {
  const meshes: Mesh[] = [];
  if (isJewelShellRenderable(rig)) {
    meshes.push(rig.shellMesh);
    if (rig.shellInnerMesh) {
      meshes.push(rig.shellInnerMesh);
    }
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

  const pairs: Array<{ material: Material | null; mesh: Mesh }> = [];
  if (isJewelShellRenderable(rig)) {
    pairs.push(
      { material: rig.shellMaterial, mesh: rig.shellMesh },
      { material: rig.shellInnerMaterial, mesh: rig.shellInnerMesh ?? rig.shellMesh }
    );
  }
  pairs.push(
    { material: rig.bgMatA, mesh: rig.collider },
    { material: rig.bgMatB, mesh: rig.collider },
    { material: rig.fgMatA, mesh: rig.collider },
    { material: rig.fgMatB, mesh: rig.collider }
  );
  for (const layer of [rig.bgLayerA, rig.bgLayerB, rig.fgLayerA, rig.fgLayerB]) {
    if (!layer?.faceMaterials?.length) {
      continue;
    }
    for (let i = 0; i < layer.faces.length; i++) {
      const material = layer.faceMaterials[i];
      const mesh = layer.faces[i];
      if (material && mesh) {
        pairs.push({ material, mesh });
      }
    }
  }
  const seen = new Set<Material>();
  const staggerCompile = isLocalGpuSession();

  const compileOne = async (material: Material, mesh: Mesh): Promise<void> => {
    try {
      await material.forceCompilationAsync(mesh, {
        useInstances: false,
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
  /** Per-face holo content for cube six-face mode. */
  faceHoloContents?: HoloContentTextures[];
  /** One distinct photo per cube face — disables morph twin. */
  cubePerFace?: boolean;
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
  const { holoContent } = options;
  const subsystems = resolveShowcaseSubsystemFlags();
  const cubePerFace = options.cubePerFace ?? false;
  const morphTwin = !cubePerFace && usesJewelPhotoMorphTwin(subsystems);
  const hasDepthSplit =
    morphTwin &&
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
  const faceTextures =
    cubePerFace && options.faceHoloContents && options.faceHoloContents.length >= 6
      ? options.faceHoloContents.map((content) =>
          hasDepthSplit ? content.background : content.composite
        )
      : undefined;
  const spawnSlice = options.spawnSlice ?? "full";
  const layerA = createJewelPhotoCoreLayer(
    scene,
    collider,
    `jewel-bg-a-${collider.name}`,
    bgTexA,
    false,
    true,
    { kind: "background", shapeId, photoLayout, framePresetId, faceTextures }
  );

  let layerB: JewelPhotoCoreLayer | null = null;
  if (morphTwin && spawnSlice !== "layerA") {
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

  const resolvedLayerB = layerB ?? layerA;

  if (spawnSlice === "layerA" || spawnSlice === "photos") {
    const { shellMesh: shellPending, shellMaterial: pendingMat } = createJewelShellStub(
      scene,
      collider,
      collider.name
    );

    const layerBRoot =
      layerB?.root ??
      (morphTwin
        ? (() => {
            const pending = new TransformNode(`jewel-bg-b-pending-${collider.name}`, scene);
            pending.parent = collider;
            pending.setEnabled(false);
            return pending;
          })()
        : layerA.root);

    const aggregate = createKinematicPhysicsAggregateStub();

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
      bgLayerB: resolvedLayerB,
      fgLayerA: fgLayerA,
      fgLayerB: fgLayerB,
      bgMatA: layerA.material,
      bgMatB: resolvedLayerB.material,
      fgMatA: fgLayerA?.material ?? null,
      fgMatB: fgLayerB?.material ?? null,
      innerA: layerA.root,
      innerB: layerB?.root ?? layerBRoot,
      materialA: layerA.material,
      materialB: resolvedLayerB.material,
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
        disposeJewelPhotoCoreLayer(layerA);
        if (layerB && layerB !== layerA) {
          disposeJewelPhotoCoreLayer(layerB);
        } else if (morphTwin && !layerB) {
          layerBRoot.dispose();
        }
        if (fgLayerA) {
          disposeJewelPhotoCoreLayer(fgLayerA);
        }
        if (fgLayerB) {
          disposeJewelPhotoCoreLayer(fgLayerB);
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

  let shell: Mesh;
  let shellMaterial: JewelCrystalShellMaterial;
  let shellInner: Mesh | null = null;
  let shellInnerMaterial: JewelCrystalShellMaterial | null = null;

  if (subsystems.crystalShell) {
    shellMaterial = createJewelCrystalShellMaterial(scene, options.envTexture);
    shell = createPhotoCrystalShellMesh(scene, `jewel-shell-${collider.name}`, shapeId);
    shell.parent = collider;
    shell.material = shellMaterial;
    shell.renderingGroupId = 2;
    shell.isPickable = false;
    shell.inheritVisibility = false;
    configureCrystalShellEdges(shell);
    shellMaterial.backFaceCulling = true;
    shellMaterial.zOffset = 0;

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
  } else {
    const stub = createJewelShellStub(scene, collider, collider.name);
    shell = stub.shellMesh;
    shellMaterial = stub.shellMaterial;
  }

  const aggregate = createKinematicPhysicsAggregateStub();

  const rigPartial = {
    collider,
    shapeId,
    photoLayout,
    framePresetId,
    bgA: layerA.root,
    bgB: resolvedLayerB.root,
    fgA: fgLayerA?.root ?? null,
    fgB: fgLayerB?.root ?? null,
    bgLayerA: layerA,
    bgLayerB: resolvedLayerB,
    fgLayerA: fgLayerA,
    fgLayerB: fgLayerB,
    bgMatA: layerA.material,
    bgMatB: resolvedLayerB.material,
    fgMatA: fgLayerA?.material ?? null,
    fgMatB: fgLayerB?.material ?? null,
    innerA: layerA.root,
    innerB: resolvedLayerB.root,
    materialA: layerA.material,
    materialB: resolvedLayerB.material,
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

  const dispose = () => {
    aggregate.dispose();
    disposeJewelPhotoCoreLayer(layerA);
    if (layerB && layerB !== layerA) {
      disposeJewelPhotoCoreLayer(layerB);
    }
    if (fgLayerA) {
      disposeJewelPhotoCoreLayer(fgLayerA);
    }
    if (fgLayerB) {
      disposeJewelPhotoCoreLayer(fgLayerB);
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
  if (!subsystems.crystalShell) {
    return;
  }
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
  shellMaterial.zOffset = -1;

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
  if (!usesJewelPhotoMorphTwin()) {
    return;
  }
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
  // RTX / localhost — full shell + photos in one pass (no invisible pending shell gap).
  if (isLocalGpuSession()) {
    return false;
  }
  if (isRenderWorkerExportSession()) {
    return false;
  }
  if (isShowcaseAutomationSession()) {
    return true;
  }
  return resolveShowcaseGpuTier() === "simplified";
}
