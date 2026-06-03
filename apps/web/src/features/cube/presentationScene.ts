import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
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
import { createCubeParticles, type ParticleThemeId } from "./cubeParticles";
import {
  createCs5FxRig,
  DEFAULT_CS5_FX_OPTIONS,
  type Cs5FxOptions,
} from "./cs5Fx";

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
          (0.06 + 0.06 * (0.5 + 0.5 * Math.sin(t * 1.6 + idx))) * mul;
      });
      flare.material.opacity = (0.10 + 0.11 * (0.5 + 0.5 * Math.sin(t * 2.1))) * mul;
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

function applyGradientToRoot(root: THREE.Object3D, shift: number, enabled: boolean): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!(material instanceof THREE.ShaderMaterial)) {
        continue;
      }
      if (material.uniforms.uGradientShift) {
        material.uniforms.uGradientShift.value = shift;
      }
      if (material.uniforms.uGradientEnabled) {
        material.uniforms.uGradientEnabled.value = enabled ? 1 : 0;
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
  return {
    portraitBoost: hasDepthSeparationBoost(image),
    subjectBounds: image.subject.bounds,
    bgParallaxMul: turntableEffect ? 0.32 : hologramMode ? 0.48 : 0.62,
    framePresetId,
    hologramMode,
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
  if (!canUseSubjectBackgroundSeparation(image)) {
    return createFlatPresentationMaterial(texture, framePresetId, hologramMode);
  }

  if (plateTexture) {
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
  resetTextureCarousel?: () => void;
  setGradientShift: (shift: number, enabled: boolean) => void;
  dispose: () => void;
}

export function createPresentationScene(
  effect: PresentationEffectId,
  orderedImages: ProcessedImage[],
  textures: THREE.Texture[],
  plateTextures: Array<THREE.Texture | null> = [],
  framePresetId: CubeFramePresetId = "rose_gold",
  hologramMode: boolean = false,
  particleTheme: ParticleThemeId = "none",
  faceCompositeTextures: Array<THREE.Texture | null> = []
): PresentationScene {
  const depthTextures = orderedImages.map((image) => getDepthTexture(image));
  const disposables: Array<THREE.Material | THREE.BufferGeometry | THREE.Texture> = [];
  const overlayObjects: THREE.Object3D[] = [];
  const isTurntableEffect = effect === "turntable";
  const dualLayerOptions = (image: ProcessedImage) =>
    toDualLayerOptions(image, framePresetId, isTurntableEffect, hologramMode);

  let currentHologramMode = hologramMode;

  const root = new THREE.Group();
  const voluMaxFx = createVoluMaxFxRig(hologramMode, "medium");
  root.add(voluMaxFx.group);
  const cs5FxRig = createCs5FxRig();
  root.add(cs5FxRig.group);
  const particles = createCubeParticles(particleTheme);
  if (particles) {
    root.add(particles.points);
    particles.points.visible = hologramMode;
  }

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
      const compositeTexture = faceCompositeTextures[index] ?? null;
      materials[faceIndex] =
        compositeTexture != null
          ? createFramedFlatMaterial(compositeTexture, framePresetId, hologramMode)
          : createPageMaterial(
              textures[index],
              image,
              depthTextures[index],
              plateTextures[index] ?? null,
              framePresetId,
              hologramMode
            );
    }

    const geometry = new RoundedBoxGeometry(CUBE_EDGE_LENGTH, CUBE_EDGE_LENGTH, CUBE_EDGE_LENGTH, 6, 0.06);
    const cube = new THREE.Mesh(geometry, materials);
    root.add(cube);
    disposables.push(geometry, ...materials);

    // In hologram preview we need a visible silhouette even when textures are dark/transparent.
    // This is a lightweight wireframe that makes "cube exists" obvious without changing export.
    let holoShell: THREE.Mesh | null = null;
    let holoEdges: THREE.LineSegments | null = null;
    if (hologramMode) {
      holoShell = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: 0x2a2130,
          transparent: true,
          opacity: 0.14,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      holoShell.renderOrder = 1;
      root.add(holoShell);
      disposables.push(holoShell.material as THREE.Material);

      const edgesGeo = new THREE.EdgesGeometry(geometry, 24);
      const edgesMat = new THREE.LineBasicMaterial({
        color: 0xffd7a6,
        transparent: true,
        opacity: 0.6,
      });
      holoEdges = new THREE.LineSegments(edgesGeo, edgesMat);
      holoEdges.renderOrder = 2;
      root.add(holoEdges);
      disposables.push(edgesGeo, edgesMat);
    }

    let appliedStep = -1;
    let nextImageIndex = 6;
    const canSwap = [true, true, true, true]; // Front(4), Right(0), Left(1), Back(5) 순서에 매핑

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
            presentationFocusCenter(image, currentHologramMode),
            depthTextures[step],
            image.depth?.subjectDepth ?? 0.75,
            shouldUseDepthMap(image),
            0,
            {
              ...dualLayerOptions(image),
              hologramMode: currentHologramMode,
            }
          );
        } else if (isParallaxMaterial(material)) {
          updateParallaxMaterial(
            material,
            texture,
            presentationFocusCenter(image, currentHologramMode),
            depthTextures[step],
            image.depth?.subjectDepth ?? 0.75,
            shouldUseDepthMap(image),
            0,
            parallaxOptionsForImage(image, framePresetId, currentHologramMode)
          );
        }
        appliedStep = step;
      },
      setParallaxAmount: (step, amount, focusPulse = 0) => {
        applyParallaxAmount(materials[getPresentationFace(step)], amount, focusPulse);
      },
      setFramePreset: (nextPreset) => {
        materials.forEach((material) => applyFramePresetToMaterial(material, nextPreset));
      },
      setHologramMode: (enabled) => {
        currentHologramMode = enabled;
        const val = enabled ? 1.0 : 0.0;
        materials.forEach((material) => {
          if (material instanceof THREE.ShaderMaterial && material.uniforms.uHologramMode) {
            material.uniforms.uHologramMode.value = val;
          }
        });
        if (particles) {
          particles.points.visible = enabled;
        }
        if (holoShell) {
          holoShell.visible = enabled;
        }
        if (holoEdges) {
          holoEdges.visible = enabled;
        }
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
      setGradientShift: (shift, enabled) => {
        applyGradientToRoot(root, shift, enabled);
      },
      updateTextureCarousel: (rotationY) => {
        const totalImages = orderedImages.length;
        if (totalImages <= 6) return;

        const sideFaces = [
          { idx: 4, offset: 0, swapKey: 0 },
          { idx: 0, offset: Math.PI / 2, swapKey: 1 },
          { idx: 1, offset: -Math.PI / 2, swapKey: 2 },
          { idx: 5, offset: Math.PI, swapKey: 3 }
        ];

        sideFaces.forEach((face) => {
          const angle = rotationY + face.offset;
          const cosAngle = Math.cos(angle);

          if (cosAngle < -0.96) {
            if (canSwap[face.swapKey]) {
              const image = orderedImages[nextImageIndex];
              const texture = textures[nextImageIndex];
              const depthTexture = depthTextures[nextImageIndex];
              const plateTexture = plateTextures[nextImageIndex] ?? null;

              if (image && texture && depthTexture) {
                const material = materials[face.idx];
                if (isDualLayerParallaxMaterial(material) && plateTexture) {
                  updateDualLayerParallaxMaterial(
                    material,
                    texture,
                    plateTexture,
                    presentationFocusCenter(image, currentHologramMode),
                    depthTexture,
                    image.depth?.subjectDepth ?? 0.75,
                    shouldUseDepthMap(image),
                    0,
                    {
                      ...dualLayerOptions(image),
                      hologramMode: currentHologramMode,
                    }
                  );
                } else if (isParallaxMaterial(material)) {
                  updateParallaxMaterial(
                    material,
                    texture,
                    presentationFocusCenter(image, currentHologramMode),
                    depthTexture,
                    image.depth?.subjectDepth ?? 0.75,
                    shouldUseDepthMap(image),
                    0,
                    parallaxOptionsForImage(image, framePresetId, currentHologramMode)
                  );
                }
                console.log(`[React Carousel] Swapped face index ${face.idx} to image ${nextImageIndex}`);
              }
              
              nextImageIndex = (nextImageIndex + 1) % totalImages;
              canSwap[face.swapKey] = false;
            }
          } else if (cosAngle > 0.3) {
            canSwap[face.swapKey] = true;
          }
        });
      },
      resetTextureCarousel: () => {
        nextImageIndex = 6;
        for (let i = 0; i < canSwap.length; i++) {
          canSwap[i] = true;
        }
        // 초기 6장 텍스처로 환원
        for (let index = 0; index < Math.min(CUBE_FACE_COUNT, orderedImages.length); index += 1) {
          const faceIndex = getPresentationFace(index);
          const material = materials[faceIndex];
          const texture = textures[index];
          const depthTexture = depthTextures[index];
          const plateTexture = plateTextures[index] ?? null;
          const image = orderedImages[index];

          if (material && texture && depthTexture && image) {
            if (isDualLayerParallaxMaterial(material) && plateTexture) {
              updateDualLayerParallaxMaterial(
                material,
                texture,
                plateTexture,
                presentationFocusCenter(image, currentHologramMode),
                depthTexture,
                image.depth?.subjectDepth ?? 0.75,
                shouldUseDepthMap(image),
                0,
                {
                  ...dualLayerOptions(image),
                  hologramMode: currentHologramMode,
                }
              );
            } else if (isParallaxMaterial(material)) {
              updateParallaxMaterial(
                material,
                texture,
                presentationFocusCenter(image, currentHologramMode),
                depthTexture,
                image.depth?.subjectDepth ?? 0.75,
                shouldUseDepthMap(image),
                0,
                parallaxOptionsForImage(image, framePresetId, currentHologramMode)
              );
            }
          }
        }
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
  } else if (effect === "photo_slideshow_3d") {
    const matGeometry = new THREE.PlaneGeometry(PLANE_SIZE * 1.06, PLANE_SIZE * 1.06);
    const matMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5f0ea,
      metalness: 0.12,
      roughness: 0.82,
    });
    const matMesh = new THREE.Mesh(matGeometry, matMaterial);
    matMesh.position.set(0, 0, -0.025);
    pagePivot.add(matMesh);
    overlayObjects.push(matMesh);
    disposables.push(matGeometry, matMaterial);

    const edgeGeometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(PLANE_SIZE * 1.06, PLANE_SIZE * 1.06));
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xe5c07b, transparent: true, opacity: 0.55 });
    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edgeLines.position.set(0, 0, -0.02);
    pagePivot.add(edgeLines);
    overlayObjects.push(edgeLines);
    disposables.push(edgeGeometry, edgeMaterial);

    pagePivot.position.set(0, 0, 0);
    pageMesh.position.set(0, 0, 0.02);
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
      if (particles) {
        particles.points.visible = enabled;
      }
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
    setGradientShift: (shift, enabled) => {
      applyGradientToRoot(root, shift, enabled);
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
