import * as THREE from "three";
import type { CubeFramePresetId } from "@mbox/shared";
import type { ProcessedImage } from "../../shared/types";
import { createDepthTexture, createFallbackDepthTexture } from "../../shared/lib/depthTexture";
import type { PresentationEffectId } from "./presentationEffects";
import {
  CUBE_EDGE_LENGTH,
  CUBE_FACE_COUNT,
  getPresentationFace,
} from "./cubeSequence";
import { canUseSubjectBackgroundSeparation } from "../../shared/lib/cutoutPresentation";
import { hasDepthSeparationBoost } from "../../shared/lib/subjectPortrait";
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
  updateParallaxMaterial,
  type ParallaxMaterialOptions,
} from "./cubeParallaxMaterial";
import {
  createFramedFlatMaterial,
  updateFramedFlatMaterialFrame,
} from "./framedFlatMaterial";

function parallaxOptionsForImage(
  image: ProcessedImage,
  framePresetId: CubeFramePresetId
): ParallaxMaterialOptions {
  return {
    portraitBoost: hasDepthSeparationBoost(image),
    subjectBounds: image.subject.bounds,
    framePresetId,
  };
}

const DEFAULT_FOCUS_CENTER = { x: 50, y: 50 } as const;
const PLANE_SIZE = 2.35;

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
  framePresetId: CubeFramePresetId
): THREE.ShaderMaterial {
  return createFramedFlatMaterial(texture, framePresetId);
}

function toDualLayerOptions(
  image: ProcessedImage,
  framePresetId: CubeFramePresetId
): DualLayerParallaxOptions {
  return {
    portraitBoost: hasDepthSeparationBoost(image),
    subjectBounds: image.subject.bounds,
    bgParallaxMul: 0.62,
    framePresetId,
  };
}

function createPageMaterial(
  texture: THREE.Texture,
  image: ProcessedImage,
  depthTexture: THREE.Texture,
  plateTexture: THREE.Texture | null,
  framePresetId: CubeFramePresetId,
  parallaxOptions: ParallaxMaterialOptions = parallaxOptionsForImage(image, framePresetId)
): THREE.Material {
  if (!canUseSubjectBackgroundSeparation(image)) {
    return createFlatPresentationMaterial(texture, framePresetId);
  }

  if (plateTexture) {
    return createDualLayerParallaxMaterial(
      texture,
      plateTexture,
      image.center ?? DEFAULT_FOCUS_CENTER,
      depthTexture,
      image.depth?.subjectDepth ?? 0.75,
      shouldUseDepthMap(image),
      toDualLayerOptions(image, framePresetId)
    );
  }

  const material = createParallaxMaterial(
    texture,
    image.center ?? DEFAULT_FOCUS_CENTER,
    depthTexture,
    image.depth?.subjectDepth ?? 0.75,
    shouldUseDepthMap(image),
    parallaxOptions
  );
  material.transparent = true;
  return material;
}

function applyParallaxAmount(material: THREE.Material, amount: number): void {
  if (isDualLayerParallaxMaterial(material)) {
    setDualLayerParallaxAmount(material, amount);
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
  setParallaxAmount: (step: number, amount: number) => void;
  setFramePreset: (framePresetId: CubeFramePresetId) => void;
  dispose: () => void;
}

export function createPresentationScene(
  effect: PresentationEffectId,
  orderedImages: ProcessedImage[],
  textures: THREE.Texture[],
  plateTextures: Array<THREE.Texture | null> = [],
  framePresetId: CubeFramePresetId = "rose_gold"
): PresentationScene {
  const depthTextures = orderedImages.map((image) => getDepthTexture(image));
  const disposables: Array<THREE.Material | THREE.BufferGeometry | THREE.Texture> = [];

  if (effect === "cube_focus") {
    const materials: THREE.Material[] = Array.from(
      { length: CUBE_FACE_COUNT },
      () => new THREE.MeshBasicMaterial({ color: 0x334155 })
    );

    for (let index = 0; index < Math.min(CUBE_FACE_COUNT, orderedImages.length); index += 1) {
      const faceIndex = getPresentationFace(index);
      const image = orderedImages[index];
      if (!image) {
        continue;
      }
      materials[faceIndex] = createPageMaterial(
        textures[index],
        image,
        depthTextures[index],
        plateTextures[index] ?? null,
        framePresetId
      );
    }

    const geometry = new THREE.BoxGeometry(CUBE_EDGE_LENGTH, CUBE_EDGE_LENGTH, CUBE_EDGE_LENGTH);
    const cube = new THREE.Mesh(geometry, materials);
    const root = new THREE.Group();
    root.add(cube);
    disposables.push(geometry, ...materials);

    let appliedStep = -1;

    return {
      root,
      applyStepTexture: (step) => {
        if (step === appliedStep) {
          return;
        }
        const faceIndex = getPresentationFace(step);
        const texture = textures[step];
        const image = orderedImages[step];
        if (!texture || !image) {
          return;
        }
        const material = materials[faceIndex];
        const plateTexture = plateTextures[step] ?? null;
        if (isDualLayerParallaxMaterial(material) && plateTexture) {
          updateDualLayerParallaxMaterial(
            material,
            texture,
            plateTexture,
            image.center ?? DEFAULT_FOCUS_CENTER,
            depthTextures[step],
            image.depth?.subjectDepth ?? 0.75,
            shouldUseDepthMap(image),
            0,
            toDualLayerOptions(image, framePresetId)
          );
        } else if (isParallaxMaterial(material)) {
          updateParallaxMaterial(
            material,
            texture,
            image.center ?? DEFAULT_FOCUS_CENTER,
            depthTextures[step],
            image.depth?.subjectDepth ?? 0.75,
            shouldUseDepthMap(image),
            0,
            parallaxOptionsForImage(image, framePresetId)
          );
        }
        appliedStep = step;
      },
      setParallaxAmount: (step, amount) => {
        applyParallaxAmount(materials[getPresentationFace(step)], amount);
      },
      setFramePreset: (nextPreset) => {
        materials.forEach((material) => applyFramePresetToMaterial(material, nextPreset));
      },
      dispose: () => {
        disposables.forEach((item) => item.dispose());
        depthTextures.forEach((texture) => texture.dispose());
      },
    };
  }

  const root = new THREE.Group();
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
    disposables.push(spineGeometry, spineMaterial);

    const backGeometry = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE);
    const backMaterial = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const backMesh = new THREE.Mesh(backGeometry, backMaterial);
    backMesh.position.set(-PLANE_SIZE / 2, 0, -0.03);
    backMesh.rotation.y = 0.08;
    root.add(backMesh);
    disposables.push(backGeometry, backMaterial);

    pagePivot.position.set(-PLANE_SIZE / 2, 0, 0);
    pageMesh.position.set(PLANE_SIZE / 2, 0, 0);
  } else if (effect === "turntable") {
    const baseGeometry = new THREE.CylinderGeometry(1.55, 1.7, 0.12, 48);
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = -1.35;
    root.add(base);
    disposables.push(baseGeometry, baseMaterial);
    pageMesh.position.set(0, 0.05, 0);
    pageMesh.rotation.x = -0.08;
  } else if (effect === "orbit_gallery") {
    pageMesh.position.set(0, 0, 0);
  } else {
    pagePivot.position.set(-PLANE_SIZE / 2, 0, 0);
    pageMesh.position.set(PLANE_SIZE / 2, 0, 0);
  }

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
        framePresetId
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
    dispose: () => {
      disposables.forEach((item) => item.dispose());
      depthTextures.forEach((texture) => texture.dispose());
    },
  };
}
