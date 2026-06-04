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
  PARALLAX_MAX,
} from "./cubeSequence";
import { canUseDualLayerParallax } from "../../shared/lib/cutoutPresentation";
import { hasDepthSeparationBoost } from "../../shared/lib/subjectPortrait";
import {
  createDualLayerParallaxMaterial,
  isDualLayerParallaxMaterial,
  setDualLayerFramePreset,
  setDualLayerParallaxAmount,
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

/** wedding-simple과 동일: 면마다 PlaneGeometry + MeshBasicMaterial (RoundedBox 멀티머티리얼 셰이더 이슈 회피). */
const CUBE_FACE_PLANE_SIZE = CUBE_EDGE_LENGTH * 1.02;
const CUBE_FACE_HALF = CUBE_EDGE_LENGTH / 2 + 0.02;

const CUBE_FACE_LAYOUT: Record<
  number,
  { position: THREE.Vector3Tuple; rotation: THREE.EulerTuple }
> = {
  4: { position: [0, 0, CUBE_FACE_HALF], rotation: [0, 0, 0] },
  5: { position: [0, 0, -CUBE_FACE_HALF], rotation: [0, Math.PI, 0] },
  0: { position: [CUBE_FACE_HALF, 0, 0], rotation: [0, Math.PI / 2, 0] },
  1: { position: [-CUBE_FACE_HALF, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  2: { position: [0, CUBE_FACE_HALF, 0], rotation: [-Math.PI / 2, 0, 0] },
  3: { position: [0, -CUBE_FACE_HALF, 0], rotation: [Math.PI / 2, 0, 0] },
};

const FRAME_OUTER_COLORS: Record<CubeFramePresetId, number> = {
  rose_gold: 0xe5b3b3,
  pearl_white: 0xe2e8f0,
  classic_black: 0x3a3a3a,
  sage_garden: 0x8aa882,
  royal_navy: 0x2a4568,
};

interface CubeFaceRig {
  faceIndex: number;
  group: THREE.Group;
  fgMesh: THREE.Mesh;
  bgMesh: THREE.Mesh;
  fgMaterial: THREE.MeshBasicMaterial;
  bgMaterial: THREE.MeshBasicMaterial;
  mode: "flat" | "volumax";
  imageSlot: number;
}

function assignCubeFaceTextures(
  rig: CubeFaceRig,
  imageIndex: number,
  image: ProcessedImage,
  fgTexture: THREE.Texture,
  plateTexture: THREE.Texture | null,
  voluMaxDepthEnabled: boolean
): void {
  fgTexture.colorSpace = THREE.SRGBColorSpace;
  rig.fgMaterial.map = fgTexture;
  const hasMatte =
    image.preprocessMode === "background_removed" ||
    (Boolean(image.subjectForegroundUrl) &&
      image.subjectForegroundUrl !== image.url &&
      (image.voluMaxPrepared ?? image.subjectForegroundUrl?.startsWith("data:image/png") ?? false));
  rig.fgMaterial.transparent = voluMaxDepthEnabled && hasMatte;
  rig.fgMaterial.depthWrite = !rig.fgMaterial.transparent;
  rig.fgMaterial.needsUpdate = true;

  if (voluMaxDepthEnabled && plateTexture && canUseDualLayerParallax(image) && hasMatte) {
    plateTexture.colorSpace = THREE.SRGBColorSpace;
    rig.bgMaterial.map = plateTexture;
    rig.bgMaterial.needsUpdate = true;
    rig.bgMesh.visible = true;
    rig.mode = "volumax";
    rig.fgMesh.position.z = 0.39;
    rig.bgMesh.position.z = -0.01;
  } else {
    rig.bgMesh.visible = false;
    rig.mode = "flat";
    rig.fgMesh.position.z = 0.06;
    rig.bgMesh.position.z = -0.06;
  }
  rig.imageSlot = imageIndex;
}

interface CubeFaceRig {
  faceIndex: number;
  group: THREE.Group;
  fgMesh: THREE.Mesh;
  bgMesh: THREE.Mesh;
  fgMaterial: THREE.MeshBasicMaterial;
  bgMaterial: THREE.MeshBasicMaterial;
  mode: "flat" | "volumax";
  imageSlot: number;
  lastParallax: number;
  lastFocusPulse: number;
}

const CUBE_FACE_ROT_OFFSET: Record<number, number> = {
  4: 0,
  0: Math.PI / 2,
  1: -Math.PI / 2,
  5: Math.PI,
  2: 0,
  3: 0,
};

function syncCubeFaceMotion(
  rig: CubeFaceRig,
  amount: number,
  focusPulse: number,
  rotationY: number,
  rotationX: number
): void {
  const norm = Math.min(1, Math.max(0, amount / PARALLAX_MAX));
  // Keep displacements well within face boundary (face half-size ≈ 1.175 units).
  // fgMul max ≈ 0.28+0.12=0.40, rotation-driven ≈ 0.10 → total fg X ≤ 0.50 (safe).
  const fgMul = rig.mode === "volumax" ? 0.28 + focusPulse * 0.12 : 0.10 + focusPulse * 0.04;
  const bgMul = rig.mode === "volumax" ? 0.18 + focusPulse * 0.06 : 0.05 + focusPulse * 0.02;
  const baseZ = rig.mode === "volumax" ? 0.39 : 0.06;
  const baseBgZ = rig.mode === "volumax" ? -0.01 : -0.06;
  let fx = norm * fgMul;
  let fy = norm * fgMul * 0.42;
  let bx = -norm * bgMul;
  let by = -norm * bgMul * 0.42;
  if (rig.mode === "volumax") {
    const angle = rotationY + (CUBE_FACE_ROT_OFFSET[rig.faceIndex] ?? 0);
    fx += Math.sin(angle) * 0.10;
    bx += -Math.sin(angle) * 0.07;
    fy += Math.sin(rotationX) * 0.08;
    by += -Math.sin(rotationX) * 0.06;
  }
  rig.fgMesh.position.set(fx, fy, baseZ + focusPulse * 0.06);
  rig.bgMesh.position.set(bx, by, baseBgZ);
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
  _faceCompositeTextures: Array<THREE.Texture | null> = [],
  voluMaxDepthEnabled: boolean = true,
  subjectForegroundTextures: Array<THREE.Texture | null> = []
): PresentationScene {
  const depthTextures = orderedImages.map((image) => getDepthTexture(image));
  const disposables: Array<THREE.Material | THREE.BufferGeometry | THREE.Texture> = [];
  const overlayObjects: THREE.Object3D[] = [];
  const isTurntableEffect = effect === "turntable";

  let currentHologramMode = hologramMode;

  const root = new THREE.Group();
  const cs5FxRig = createCs5FxRig();
  root.add(cs5FxRig.group);
  const particles = createCubeParticles(particleTheme);
  if (particles) {
    root.add(particles.points);
    particles.points.visible = hologramMode;
  }

  let voluMaxFx = createVoluMaxFxRig(hologramMode, "medium");
  root.add(voluMaxFx.group);

  if (effect === "cube_focus") {
    const cubeGroup = new THREE.Group();
    const frameGeometry = new RoundedBoxGeometry(
      CUBE_EDGE_LENGTH * 1.04,
      CUBE_EDGE_LENGTH * 1.04,
      CUBE_EDGE_LENGTH * 1.04,
      6,
      0.08
    );
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: FRAME_OUTER_COLORS[framePresetId],
      metalness: 0.92,
      roughness: 0.16,
      side: THREE.DoubleSide,
    });
    const frameMesh = new THREE.Mesh(frameGeometry, frameMaterial);
    cubeGroup.add(frameMesh);
    disposables.push(frameGeometry, frameMaterial);

    const facePlaneGeometry = new THREE.PlaneGeometry(CUBE_FACE_PLANE_SIZE, CUBE_FACE_PLANE_SIZE);
    disposables.push(facePlaneGeometry);

    const faceRigs: Array<CubeFaceRig | null> = Array.from({ length: CUBE_FACE_COUNT }, () => null);

    for (let index = 0; index < Math.min(CUBE_FACE_COUNT, orderedImages.length); index += 1) {
      const faceIndex = getPresentationFace(index);
      const image = orderedImages[index];
      const texture = textures[index];
      const plateTexture = plateTextures[index] ?? null;
      const layout = CUBE_FACE_LAYOUT[faceIndex];
      if (!image || !texture || !layout) {
        continue;
      }

      const group = new THREE.Group();
      group.position.set(...layout.position);
      group.rotation.set(...layout.rotation);

      const bgMaterial = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        color: 0x000000,
      });
      const bgMesh = new THREE.Mesh(facePlaneGeometry, bgMaterial);
      bgMesh.position.z = -0.06;

      const fgMaterial = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        transparent: true,
      });
      const fgMesh = new THREE.Mesh(facePlaneGeometry, fgMaterial);
      fgMesh.position.z = 0.06;

      group.add(bgMesh);
      group.add(fgMesh);
      cubeGroup.add(group);
      disposables.push(bgMaterial, fgMaterial);

      const fgTexture =
        voluMaxDepthEnabled && subjectForegroundTextures[index]
          ? subjectForegroundTextures[index]
          : texture;

      const rig: CubeFaceRig = {
        faceIndex,
        group,
        fgMesh,
        bgMesh,
        fgMaterial,
        bgMaterial,
        mode: "flat",
        imageSlot: index,
        lastParallax: 0,
        lastFocusPulse: 0,
      };
      assignCubeFaceTextures(
        rig,
        index,
        image,
        fgTexture ?? texture,
        plateTexture,
        voluMaxDepthEnabled
      );
      faceRigs[faceIndex] = rig;
    }

    root.add(cubeGroup);

    root.remove(voluMaxFx.group);
    cubeGroup.add(voluMaxFx.group);
    voluMaxFx.group.position.set(0, 0, 0);

    const voluMaxHalo = new THREE.Mesh(
      new THREE.RingGeometry(1.38, 1.42, 96),
      new THREE.MeshBasicMaterial({
        color: 0x9ed8ff,
        transparent: true,
        opacity: hologramMode ? 0.35 : 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    voluMaxHalo.position.z = 0.02;
    cubeGroup.add(voluMaxHalo);
    disposables.push(voluMaxHalo.geometry, voluMaxHalo.material as THREE.Material);

    let holoEdges: THREE.LineSegments | null = null;
    if (hologramMode) {
      const edgesGeo = new THREE.EdgesGeometry(frameGeometry, 24);
      const edgesMat = new THREE.LineBasicMaterial({
        color: 0xffd7a6,
        transparent: true,
        opacity: 0.55,
      });
      holoEdges = new THREE.LineSegments(edgesGeo, edgesMat);
      holoEdges.renderOrder = 2;
      cubeGroup.add(holoEdges);
      disposables.push(edgesGeo, edgesMat);
    }

    let appliedStep = -1;
    let nextImageIndex = 6;
    const canSwap = [true, true, true, true];
    let rootRotY = 0;
    let rootRotX = 0;

    const updateFaceRigTextures = (faceIndex: number, imageIndex: number) => {
      const rig = faceRigs[faceIndex];
      const image = orderedImages[imageIndex];
      const texture = textures[imageIndex];
      const plateTexture = plateTextures[imageIndex] ?? null;
      const fgTexture =
        voluMaxDepthEnabled && subjectForegroundTextures[imageIndex]
          ? subjectForegroundTextures[imageIndex]
          : texture;
      if (!rig || !image || !fgTexture) {
        return;
      }
      assignCubeFaceTextures(
        rig,
        imageIndex,
        image,
        fgTexture,
        plateTexture,
        voluMaxDepthEnabled
      );
    };

    return {
      root,
      applyStepTexture: (step) => {
        if (step === appliedStep) {
          return;
        }
        updateFaceRigTextures(getPresentationFace(step), step);
        appliedStep = step;
      },
      setParallaxAmount: (step, amount, focusPulse = 0) => {
        const rig = faceRigs[getPresentationFace(step)];
        if (!rig) {
          return;
        }
        rig.lastParallax = amount;
        rig.lastFocusPulse = focusPulse;
        syncCubeFaceMotion(rig, amount, focusPulse, rootRotY, rootRotX);
      },
      setFramePreset: (nextPreset) => {
        frameMaterial.color.setHex(FRAME_OUTER_COLORS[nextPreset]);
      },
      setHologramMode: (enabled) => {
        currentHologramMode = enabled;
        if (particles) {
          particles.points.visible = enabled;
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
          { idx: 5, offset: Math.PI, swapKey: 3 },
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
        faceRigs.forEach((rig) => {
          if (!rig) {
            return;
          }
          syncCubeFaceMotion(rig, rig.lastParallax, rig.lastFocusPulse, rotationY, rotationX);
        });
      },
      resetTextureCarousel: () => {
        nextImageIndex = 6;
        for (let i = 0; i < canSwap.length; i += 1) {
          canSwap[i] = true;
        }
        for (let index = 0; index < Math.min(CUBE_FACE_COUNT, orderedImages.length); index += 1) {
          updateFaceRigTextures(getPresentationFace(index), index);
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
