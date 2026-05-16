import * as THREE from "three";
import type { ProcessedImage } from "../../shared/types";
import { createDepthTexture, createFallbackDepthTexture } from "../../shared/lib/depthTexture";
import type { PresentationEffectId } from "./presentationEffects";
import {
  CUBE_EDGE_LENGTH,
  CUBE_FACE_COUNT,
  getPresentationFace,
} from "./cubeSequence";
import { hasDepthSeparationBoost } from "../../shared/lib/subjectPortrait";
import {
  createParallaxMaterial,
  isParallaxMaterial,
  setParallaxAmount,
  updateParallaxMaterial,
  type ParallaxMaterialOptions,
} from "./cubeParallaxMaterial";

function parallaxOptionsForImage(image: ProcessedImage): ParallaxMaterialOptions {
  return {
    portraitBoost: hasDepthSeparationBoost(image),
    subjectBounds: image.subject.bounds,
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

function createPageMaterial(
  texture: THREE.Texture,
  image: ProcessedImage,
  depthTexture: THREE.Texture,
  parallaxOptions: ParallaxMaterialOptions = parallaxOptionsForImage(image)
): THREE.Material {
  return createParallaxMaterial(
    texture,
    image.center ?? DEFAULT_FOCUS_CENTER,
    depthTexture,
    image.depth?.subjectDepth ?? 0.75,
    shouldUseDepthMap(image),
    parallaxOptions
  );
}

export interface PresentationScene {
  root: THREE.Object3D;
  applyStepTexture: (step: number) => void;
  setParallaxAmount: (step: number, amount: number) => void;
  dispose: () => void;
}

export function createPresentationScene(
  effect: PresentationEffectId,
  orderedImages: ProcessedImage[],
  textures: THREE.Texture[]
): PresentationScene {
  const depthTextures = orderedImages.map((image) => getDepthTexture(image));
  const disposables: Array<THREE.Material | THREE.BufferGeometry | THREE.Texture> = [];

  if (effect === "cube_focus") {
    const materials: THREE.Material[] = Array.from(
      { length: CUBE_FACE_COUNT },
      () => new THREE.MeshStandardMaterial({ color: 0x334155 })
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
        parallaxOptionsForImage(image)
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
        if (isParallaxMaterial(material)) {
          updateParallaxMaterial(
            material,
            texture,
            image.center ?? DEFAULT_FOCUS_CENTER,
            depthTextures[step],
            image.depth?.subjectDepth ?? 0.75,
            shouldUseDepthMap(image),
            0,
            parallaxOptionsForImage(image)
          );
        }
        appliedStep = step;
      },
      setParallaxAmount: (step, amount) => {
        const material = materials[getPresentationFace(step)];
        if (isParallaxMaterial(material)) {
          setParallaxAmount(material, amount);
        }
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
  const pageMaterial: THREE.Material = new THREE.MeshStandardMaterial({ color: 0x334155 });
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
      const nextMaterial = createPageMaterial(texture, image, depthTextures[step], parallaxOptionsForImage(image));
      pageMesh.material = nextMaterial;
      if (pageMaterial !== nextMaterial) {
        pageMaterial.dispose();
      }
      disposables.push(nextMaterial);
      appliedStep = step;
    },
    setParallaxAmount: (_step, amount) => {
      if (isParallaxMaterial(pageMesh.material)) {
        setParallaxAmount(pageMesh.material, amount);
      }
    },
    dispose: () => {
      disposables.forEach((item) => item.dispose());
      depthTextures.forEach((texture) => texture.dispose());
    },
  };
}
