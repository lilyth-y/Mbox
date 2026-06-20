import * as THREE from 'three';
import type { FanBladeFrameId } from '../../shared/src/fanBladeFrame.js';
import {
  isTransparentMatteDataUrl,
  isVoluMaxLayerReady,
  resolveVoluMaxForegroundKind,
  resolveSubjectForegroundUrl as resolveSharedSubjectForegroundUrl,
} from '../../shared/src/cubeEffectFramework.js';
import { createFanBladeOrnamentRing, type FanBladeOrnamentRingHandle } from './fanBladeOrnamentRing.js';

export { createFanBladeOrnamentRing } from './fanBladeOrnamentRing.js';
export type { FanBladeOrnamentRingHandle } from './fanBladeOrnamentRing.js';

export interface ProcessedImage {
  id: number;
  url: string;
  preCropSourceUrl?: string;
  faceCompositeUrl?: string;
  backgroundPlateUrl?: string;
  subjectForegroundUrl?: string;
  voluMaxPrepared?: boolean;
  voluMaxForegroundKind?: 'ai_cutout' | 'soft_matte' | 'none';
  subjectBounds?: { x0: number; y0: number; x1: number; y1: number };
  subject?: { bounds?: { x0: number; y0: number; x1: number; y1: number } };
  preprocessMode?: string;
  center?: { x: number; y: number };
  focus?: { x: number; y: number; onPrimarySubject?: boolean; centering?: string };
  label?: string;
  resolutionEnhanceScale?: number;
}

export interface CubePlayerConfig {
  container: HTMLDivElement;
  images: ProcessedImage[];
  presentationEffectId: string;
  framePresetId: string;
  customFrameColor?: string;
  backgroundTheme: string;
  particleTheme: string;
  bgmTrackId: string;
  fanBladeFrameId?: string;
  fanBladeBackdropColorId?: string;
  /** Full-viewport scene backdrop (data/background relative path). */
  viewportBackdropPath?: string | null;
  hologramMode: boolean;
  voluMaxDepthEnabled: boolean;
  voluMaxAiForegroundCutout?: boolean;
  voluMaxAutoPrepareLayers?: boolean;
  cubeRotationMode: string;
  gradientColorCycle?: boolean;
  fanSpeed?: number;
  onFrameUpdate?: (elapsedMs: number) => void;
}

function parseFrameColorHex(input?: string): { r: number; g: number; b: number } | null {
  if (!input || typeof input !== 'string') return null;
  const hex = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const value = parseInt(hex, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

function gradientAccentRgb(shift: number): [number, number, number] {
  const t = shift % (Math.PI * 2);
  return [
    0.78 + 0.14 * Math.sin(t),
    0.58 + 0.18 * Math.sin(t + 2.1),
    0.62 + 0.16 * Math.sin(t + 4.2),
  ];
}

// Global layout constants for cube faces
const CUBE_EDGE_LENGTH = 2.5;
const CUBE_FACE_PLANE_SIZE = CUBE_EDGE_LENGTH * 1.02;
const CUBE_FACE_HALF = CUBE_EDGE_LENGTH / 2 + 0.02;

const CUBE_FACE_ORDER = [4, 0, 1, 2, 3, 5];
const CUBE_FACE_LAYOUT: Record<number, { pos: [number, number, number]; rot: [number, number, number] }> = {
  4: { pos: [0, 0, CUBE_FACE_HALF], rot: [0, 0, 0] },
  0: { pos: [CUBE_FACE_HALF, 0, 0], rot: [0, Math.PI / 2, 0] },
  5: { pos: [0, 0, -CUBE_FACE_HALF], rot: [0, Math.PI, 0] },
  1: { pos: [-CUBE_FACE_HALF, 0, 0], rot: [0, -Math.PI / 2, 0] },
  2: { pos: [0, CUBE_FACE_HALF, 0], rot: [-Math.PI / 2, 0, 0] },
  3: { pos: [0, -CUBE_FACE_HALF, 0], rot: [Math.PI / 2, 0, 0] },
};

const FRAME_OUTER_COLORS: Record<string, number> = {
  rose_gold: 0xe5b3b3,
  silver_crystal: 0xe2e8f0,
  antique_bronze: 0x8c6239,
};

const FAN_BLADE_BACKDROP_HEX: Record<string, string> = {
  warm_ivory: '#FFF8F2',
  soft_blush: '#F9E8E8',
  champagne: '#F5E6D3',
  pearl_gray: '#E8EAED',
  sage_mist: '#E4EDE4',
  sky_veil: '#E8EEF5',
  deep_wine: '#2A1218',
  midnight: '#0F1420',
  pure_black: '#000000',
};

export class CubePlayer {
  private config: CubePlayerConfig;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private cubeGroup: THREE.Group | null = null;
  private specularLight: THREE.PointLight | null = null;
  private particleSystem: THREE.Points | null = null;
  
  private textures: THREE.Texture[] = [];
  private plateTextures: THREE.Texture[] = [];
  private foregroundTextures: THREE.Texture[] = [];
  private cubeFaces: Array<{
    faceIndex: number;
    group: THREE.Group;
    innerMesh: THREE.Mesh;
    bgMesh: THREE.Mesh;
    offsetAngle: number;
    imageSlot?: number;
  }> = [];

  private animationFrameId: number | null = null;
  private timelineStart = performance.now();
  private lastTime = performance.now();
  private isDestroyed = false;

  // Interaction variables
  private isDragging = false;
  private previousMousePosition = { x: 0, y: 0 };
  private targetRotation = { x: 0, y: 0.38 };
  /** Smoothed VoluMax drive — slow, readable pop on showcase hold. */
  private parallaxDisplay = 0;
  private focusPulseDisplay = 0;
  private readonly parallaxSmoothRate = 0.038;

  // Original state tracking for exporting
  private originalSize = { width: 0, height: 0 };
  private originalAspect = 1.0;
  private fanBladeOrnamentRing: FanBladeOrnamentRingHandle | null = null;
  private viewportBackdropTexture: THREE.Texture | null = null;
  private viewportBackdropVideo: HTMLVideoElement | null = null;
  private viewportBackdropLoadToken = 0;
  private textureLoadToken = 0;
  private static readonly FACE_TEXTURE_SIZE = 1024;

  private isVideoBackdropPath(assetPath: string): boolean {
    return /\.(mp4|webm|mov|m4v)$/i.test(assetPath.trim());
  }

  private disposeViewportBackdropMedia(): void {
    this.viewportBackdropTexture?.dispose();
    this.viewportBackdropTexture = null;
    if (this.viewportBackdropVideo) {
      this.viewportBackdropVideo.pause();
      this.viewportBackdropVideo.removeAttribute('src');
      this.viewportBackdropVideo.load();
      this.viewportBackdropVideo = null;
    }
  }

  constructor(config: CubePlayerConfig) {
    this.config = { ...config };
    void this.init();
  }

  private resolveViewportBackdropUrl(relativePath: string): string {
    const normalized = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
    if (normalized.startsWith('user-assets/')) {
      const rest = normalized.slice('user-assets/'.length);
      return `/user-assets/${rest.split('/').map(encodeURIComponent).join('/')}`;
    }
    return `/backgrounds/${normalized.split('/').map(encodeURIComponent).join('/')}`;
  }

  private applyViewportBackdrop() {
    if (!this.scene || !this.renderer) return;

    const path = this.config.viewportBackdropPath;
    if (!path) {
      this.viewportBackdropLoadToken += 1;
      this.disposeViewportBackdropMedia();
      const color = new THREE.Color(0x000000);
      this.scene.background = color;
      this.renderer.setClearColor(color, 1);
      return;
    }

    const token = ++this.viewportBackdropLoadToken;
    this.disposeViewportBackdropMedia();
    const url = this.resolveViewportBackdropUrl(path);

    if (this.isVideoBackdropPath(path)) {
      const video = document.createElement('video');
      video.src = url;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      this.viewportBackdropVideo = video;

      const onReady = () => {
        if (token !== this.viewportBackdropLoadToken) return;
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        this.viewportBackdropTexture = texture;
        this.scene!.background = texture;
        this.renderer!.setClearColor(0x000000, 1);
        void video.play().catch(() => undefined);
      };
      const onFail = () => {
        if (token !== this.viewportBackdropLoadToken) return;
        this.config.viewportBackdropPath = null;
        this.applyViewportBackdrop();
      };
      video.addEventListener('loadeddata', onReady, { once: true });
      video.addEventListener('error', onFail, { once: true });
      video.load();
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (texture) => {
        if (token !== this.viewportBackdropLoadToken) {
          texture.dispose();
          return;
        }
        this.viewportBackdropTexture = texture;
        texture.colorSpace = THREE.SRGBColorSpace;
        this.scene!.background = texture;
        this.renderer!.setClearColor(0x000000, 1);
      },
      undefined,
      () => {
        if (token === this.viewportBackdropLoadToken) {
          this.config.viewportBackdropPath = null;
          this.applyViewportBackdrop();
        }
      }
    );
  }

  private resolveFanBladeFrameId(): FanBladeFrameId {
    return (this.config.fanBladeFrameId ?? 'rose_gold_ring') as FanBladeFrameId;
  }

  private syncFanBladeOrnamentRing() {
    if (!this.config.hologramMode) {
      if (this.fanBladeOrnamentRing) {
        this.fanBladeOrnamentRing.dispose();
        this.fanBladeOrnamentRing = null;
      }
      return;
    }
    if (!this.camera) {
      return;
    }
    if (!this.fanBladeOrnamentRing) {
      this.fanBladeOrnamentRing = createFanBladeOrnamentRing(this.camera, this.resolveFanBladeFrameId());
      return;
    }
    this.fanBladeOrnamentRing.setFrameId(this.resolveFanBladeFrameId());
  }

  private async init() {
    const { container } = this.config;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const size = Math.min(width, height);

    this.scene = new THREE.Scene();
    this.applyViewportBackdrop();

    this.camera = new THREE.PerspectiveCamera(75, 1.0, 0.1, 1000);
    this.camera.position.set(0, 0, 5.0);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true,
    });
    this.renderer.setSize(size, size);
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(this.renderer.domElement);

    // Setup basic lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.95);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(4, 7, 5);
    this.scene.add(dirLight);

    this.specularLight = new THREE.PointLight(0xfff5e6, 2.5, 12);
    this.specularLight.position.set(0, 3, 4);
    this.scene.add(this.specularLight);

    await this.loadTexturesAsync();
    if (this.isDestroyed) return;

    this.buildCube();
    this.buildParticles();
    this.bindEvents();
    this.syncFanBladeOrnamentRing();

    this.timelineStart = performance.now();
    this.lastTime = performance.now();
    this.animate(this.lastTime);
  }

  private disposeFaceTextures() {
    for (const texture of [...this.textures, ...this.plateTextures, ...this.foregroundTextures]) {
      texture?.dispose();
    }
    this.textures = [];
    this.plateTextures = [];
    this.foregroundTextures = [];
  }

  private configureFaceTexture(texture: THREE.Texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.unpackAlignment = 1;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.flipY = true;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }

  private async loadImageElement(url: string): Promise<HTMLImageElement> {
    const image = new Image();
    if (!url.startsWith('data:')) {
      image.crossOrigin = 'anonymous';
    }
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('cube-core texture image load failed'));
      image.src = url;
    });
    if (typeof image.decode === 'function') {
      try {
        await image.decode();
      } catch {
        // onload dimensions are still valid
      }
    }
    return image;
  }

  private sampleCanvasMeanLuma(canvas: HTMLCanvasElement): number {
    const ctx = canvas.getContext('2d');
    if (!ctx) return -1;
    const w = canvas.width;
    const h = canvas.height;
    const cx = Math.floor(w * 0.5);
    const cy = Math.floor(h * 0.5);
    const r = Math.min(48, Math.floor(Math.min(w, h) * 0.12));
    const data = ctx.getImageData(cx - r, cy - r, r * 2, r * 2).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      n += 1;
    }
    return n ? sum / n : -1;
  }

  private async rasterizeFaceTexture(url: string): Promise<THREE.CanvasTexture> {
    const image = await this.loadImageElement(url);
    const size = CubePlayer.FACE_TEXTURE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      throw new Error('cube-core 2D canvas unavailable for face texture');
    }
    if (isTransparentMatteDataUrl(url)) {
      ctx.clearRect(0, 0, size, size);
    } else {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size, size);
    }
    ctx.drawImage(image, 0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    this.configureFaceTexture(texture);
    texture.needsUpdate = true;
    return texture;
  }

  private async loadTexturesAsync() {
    const token = ++this.textureLoadToken;
    const images = this.config.images;

    const [textures, plateTextures, foregroundTextures] = await Promise.all([
      Promise.all(images.map((img) => this.rasterizeFaceTexture(img.faceCompositeUrl || img.url))),
      Promise.all(images.map((img) => this.rasterizeFaceTexture(this.resolvePlateTextureUrl(img)))),
      Promise.all(
        images.map((img) =>
          this.rasterizeFaceTexture(
            this.imageHasVoluMaxLayers(img)
              ? this.resolveSubjectForegroundUrl(img)
              : img.faceCompositeUrl || img.url
          )
        )
      ),
    ]);

    if (token !== this.textureLoadToken || this.isDestroyed) {
      textures.forEach((t) => t.dispose());
      plateTextures.forEach((t) => t.dispose());
      foregroundTextures.forEach((t) => t.dispose());
      return;
    }

    this.disposeFaceTextures();
    this.textures = textures;
    this.plateTextures = plateTextures;
    this.foregroundTextures = foregroundTextures;
  }

  private async reloadTextures() {
    await this.loadTexturesAsync();
    if (this.isDestroyed || !this.cubeFaces.length) return;
    this.cubeFaces.forEach((_face, idx) => {
      this.applyTextureToFace(idx);
    });
  }

  private resolvePlateTextureUrl(img: ProcessedImage): string {
    const fg = resolveSharedSubjectForegroundUrl(img);
    if (img.backgroundPlateUrl && (!fg || img.backgroundPlateUrl !== fg)) {
      return img.backgroundPlateUrl;
    }
    if (img.preCropSourceUrl) {
      return img.preCropSourceUrl;
    }
    return img.url;
  }

  private imageHasVoluMaxLayers(img: ProcessedImage): boolean {
    if (resolveVoluMaxForegroundKind(img) === 'soft_matte') {
      return false;
    }
    if (!isVoluMaxLayerReady(img)) {
      return false;
    }
    const fg = resolveSharedSubjectForegroundUrl(img);
    if (fg && img.backgroundPlateUrl === fg) {
      return false;
    }
    return true;
  }

  private resolveSubjectForegroundUrl(img: ProcessedImage): string {
    return resolveSharedSubjectForegroundUrl(img) || img.url || '';
  }

  private buildCube() {
    if (!this.scene) return;

    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);

    // Create 3D Outer border framing
    const RoundedGeo = (THREE as any).RoundedBoxGeometry;
    let frameGeo: THREE.BufferGeometry;
    if (RoundedGeo) {
      frameGeo = new RoundedGeo(
        CUBE_EDGE_LENGTH * 1.04,
        CUBE_EDGE_LENGTH * 1.04,
        CUBE_EDGE_LENGTH * 1.04,
        6,
        0.08
      );
    } else {
      frameGeo = new THREE.BoxGeometry(CUBE_EDGE_LENGTH * 1.04, CUBE_EDGE_LENGTH * 1.04, CUBE_EDGE_LENGTH * 1.04);
    }

    const presetColor = FRAME_OUTER_COLORS[this.config.framePresetId] || 0xe5b3b3;
    const frameMat = new THREE.MeshStandardMaterial({
      color: presetColor,
      metalness: 0.92,
      roughness: 0.16,
      side: THREE.DoubleSide,
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    this.cubeGroup.add(frameMesh);

    // Create plane meshes for each of the 6 faces
    this.cubeFaces = [];
    CUBE_FACE_ORDER.forEach((faceIdx, idx) => {
      const layout = CUBE_FACE_LAYOUT[faceIdx];
      if (!layout) return;

      const group = new THREE.Group();
      group.position.set(...layout.pos);
      group.rotation.set(...layout.rot);

      // Back Plate
      const backGeo = new THREE.PlaneGeometry(2.4, 2.4);
      const backMat = new THREE.MeshStandardMaterial({
        color: presetColor,
        metalness: 0.88,
        roughness: 0.22,
        side: THREE.BackSide,
      });
      const backMesh = new THREE.Mesh(backGeo, backMat);
      backMesh.position.z = -0.01;
      group.add(backMesh);

      // Background Plate
      const bgGeo = new THREE.PlaneGeometry(CUBE_FACE_PLANE_SIZE, CUBE_FACE_PLANE_SIZE);
      const bgMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff });
      const bgMesh = new THREE.Mesh(bgGeo, bgMat);
      bgMesh.position.z = -0.01;
      bgMesh.visible = false; // toggled per-face in updateParallax / applyTextureToFace
      group.add(bgMesh);

      // Foreground (Main Photo)
      const fgGeo = new THREE.PlaneGeometry(CUBE_FACE_PLANE_SIZE, CUBE_FACE_PLANE_SIZE);
      const fgMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const fgMesh = new THREE.Mesh(fgGeo, fgMat);
      fgMesh.position.z = 0.05;
      group.add(fgMesh);

      this.cubeGroup?.add(group);

      // Map local rotation angle around Y for parallax calculation
      let offsetAngle = 0;
      if (faceIdx === 4) offsetAngle = 0;
      if (faceIdx === 0) offsetAngle = Math.PI / 2;
      if (faceIdx === 5) offsetAngle = Math.PI;
      if (faceIdx === 1) offsetAngle = -Math.PI / 2;

      this.cubeFaces.push({
        faceIndex: faceIdx,
        group,
        innerMesh: fgMesh,
        bgMesh,
        offsetAngle,
      });

      this.applyTextureToFace(idx);
    });
  }

  private applyTextureToFace(textureStep: number) {
    const n = this.config.images.length;
    if (!n || !this.cubeFaces.length) return;

    const faceIdx = CUBE_FACE_ORDER[textureStep % CUBE_FACE_ORDER.length];
    const face = this.cubeFaces.find((f) => f.faceIndex === faceIdx);
    if (!face) return;

    face.imageSlot = textureStep;
    const image = this.config.images[textureStep % n];
    if (!image) return;

    const useDual = this.imageHasVoluMaxLayers(image);
    const fgTex = useDual ? this.foregroundTextures[textureStep % n] : this.textures[textureStep % n];
    const bgTex = this.plateTextures[textureStep % n];

    if (fgTex) {
      if (face.innerMesh.material) {
        if (Array.isArray(face.innerMesh.material)) {
          face.innerMesh.material.forEach((m) => m.dispose());
        } else {
          face.innerMesh.material.dispose();
        }
      }
      face.innerMesh.material = new THREE.MeshBasicMaterial({
        map: fgTex,
        side: THREE.DoubleSide,
        transparent: useDual,
        alphaTest: useDual ? 0.04 : 0,
        depthWrite: !useDual,
      });
      face.innerMesh.renderOrder = useDual ? 2 : 0;
    }

    if (bgTex) {
      if (face.bgMesh.material) {
        if (Array.isArray(face.bgMesh.material)) {
          face.bgMesh.material.forEach((m) => m.dispose());
        } else {
          face.bgMesh.material.dispose();
        }
      }
      face.bgMesh.material = new THREE.MeshBasicMaterial({
        map: bgTex,
        side: THREE.DoubleSide,
      });
      face.bgMesh.visible = useDual;
      face.bgMesh.renderOrder = useDual ? 0 : 0;
      if (useDual) {
        face.bgMesh.position.set(0, 0, -0.01);
        face.innerMesh.position.set(0, 0, 0.05);
      }
    }
  }

  private buildParticles() {
    if (!this.scene || !this.camera) return;
    const theme = this.config.particleTheme || 'none';
    if (theme === 'none') {
      if (this.particleSystem) {
        this.particleSystem.parent?.remove(this.particleSystem);
        this.particleSystem.geometry.dispose();
        if (this.particleSystem.material instanceof THREE.Material) {
          this.particleSystem.material.dispose();
        }
        this.particleSystem = null;
      }
      return;
    }

    if (this.particleSystem) {
      this.particleSystem.parent?.remove(this.particleSystem);
      this.particleSystem.geometry.dispose();
      if (this.particleSystem.material instanceof THREE.Material) {
        this.particleSystem.material.dispose();
      }
      this.particleSystem = null;
    }

    const particleCount = this.config.hologramMode ? 120 : 150;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities: number[] = [];
    const screenMode = this.config.hologramMode;

    const halfFovRad = THREE.MathUtils.degToRad((this.camera.fov * 0.5));
    const spawnScreen = (index: number) => {
      const depth = 0.9 + Math.random() * 4.5;
      const halfHeight = Math.tan(halfFovRad) * depth;
      const halfWidth = halfHeight * this.camera!.aspect;
      const spread = 0.96;
      positions[index] = (Math.random() - 0.5) * 2 * halfWidth * spread;
      positions[index + 1] = (Math.random() - 0.5) * 2 * halfHeight * spread;
      positions[index + 2] = -depth;
      velocities.push(
        (Math.random() - 0.5) * 0.25,
        -0.12 - Math.random() * 0.22,
        (Math.random() - 0.5) * 0.08
      );
    };

    for (let i = 0; i < particleCount; i += 1) {
      const idx = i * 3;
      if (screenMode) {
        spawnScreen(idx);
        continue;
      }
      positions[idx] = (Math.random() - 0.5) * 8;
      positions[idx + 1] = (Math.random() - 0.5) * 8;
      positions[idx + 2] = (Math.random() - 0.5) * 8;
      velocities.push(
        (Math.random() - 0.5) * 0.2,
        -0.15 - Math.random() * 0.2,
        (Math.random() - 0.5) * 0.2
      );
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 16, 16);
    }
    const texture = new THREE.CanvasTexture(canvas);

    let color = 0xfff5ea;
    let size = screenMode ? 0.11 : 0.08;
    if (theme === 'white_petals') {
      color = 0xffc5d9;
      size = screenMode ? 0.16 : 0.12;
    } else if (theme === 'floating_hearts') {
      color = 0xff6b8b;
      size = screenMode ? 0.18 : 0.14;
    }

    const material = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      map: texture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    this.particleSystem = new THREE.Points(geometry, material);
    this.particleSystem.renderOrder = 150;
    if (screenMode) {
      this.camera.add(this.particleSystem);
    } else {
      this.scene.add(this.particleSystem);
    }

    (this.particleSystem as any).userData = { velocities, screenMode };
  }

  private updateParticles(deltaMs: number) {
    if (!this.particleSystem || !this.camera) return;
    const geo = this.particleSystem.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const userData = (this.particleSystem as any).userData as {
      velocities: number[];
      screenMode?: boolean;
    };
    const velocities = userData.velocities;
    if (!posAttr || !velocities) return;

    const deltaSec = deltaMs / 1000;
    const arr = posAttr.array as Float32Array;
    const screenMode = Boolean(userData.screenMode);
    const halfFovRad = THREE.MathUtils.degToRad(this.camera.fov * 0.5);

    for (let i = 0; i < arr.length; i += 3) {
      const vIdx = i;
      arr[i] += velocities[vIdx] * deltaSec;
      arr[i + 1] += velocities[vIdx + 1] * deltaSec;
      arr[i + 2] += velocities[vIdx + 2] * deltaSec;

      if (screenMode) {
        const depth = -arr[i + 2];
        const halfHeight = Math.tan(halfFovRad) * Math.max(0.9, depth);
        const halfWidth = halfHeight * this.camera.aspect;
        if (
          arr[i + 1] < -halfHeight * 1.05 ||
          arr[i + 1] > halfHeight * 1.05 ||
          arr[i] < -halfWidth * 1.05 ||
          arr[i] > halfWidth * 1.05 ||
          depth < 0.6 ||
          depth > 5.5
        ) {
          const respawnDepth = 0.9 + Math.random() * 4.5;
          const respawnHalfHeight = Math.tan(halfFovRad) * respawnDepth;
          const respawnHalfWidth = respawnHalfHeight * this.camera.aspect;
          arr[i] = (Math.random() - 0.5) * 2 * respawnHalfWidth * 0.96;
          arr[i + 1] = respawnHalfHeight * 0.96;
          arr[i + 2] = -respawnDepth;
        }
        continue;
      }

      if (arr[i + 1] < -4.0) {
        arr[i + 1] = 4.0;
        arr[i] = (Math.random() - 0.5) * 8;
        arr[i + 2] = (Math.random() - 0.5) * 8;
      }
    }
    posAttr.needsUpdate = true;
  }

  private bindEvents() {
    const dom = this.renderer?.domElement;
    if (!dom) return;

    dom.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    dom.addEventListener('mousemove', this.onMouseMove);

    // Touch support for mobile
    dom.addEventListener('touchstart', this.onTouchStart);
    window.addEventListener('touchend', this.onMouseUp);
    dom.addEventListener('touchmove', this.onTouchMove);
  }

  private unbindEvents() {
    const dom = this.renderer?.domElement;
    if (!dom) return;

    dom.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    dom.removeEventListener('mousemove', this.onMouseMove);

    dom.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchend', this.onMouseUp);
    dom.removeEventListener('touchmove', this.onTouchMove);
  }

  private onMouseDown = (e: MouseEvent) => {
    this.isDragging = true;
    this.previousMousePosition = { x: e.clientX, y: e.clientY };
  };

  private onMouseUp = () => {
    this.isDragging = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;
    const deltaMove = {
      x: e.clientX - this.previousMousePosition.x,
      y: e.clientY - this.previousMousePosition.y,
    };

    this.targetRotation.y += deltaMove.x * 0.007;
    this.targetRotation.x += deltaMove.y * 0.007;
    this.targetRotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.targetRotation.x));

    this.previousMousePosition = { x: e.clientX, y: e.clientY };
  };

  private onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1 && e.touches[0]) {
      this.isDragging = true;
      this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    if (!this.isDragging || e.touches.length !== 1 || !e.touches[0]) return;
    const deltaMove = {
      x: e.touches[0].clientX - this.previousMousePosition.x,
      y: e.touches[0].clientY - this.previousMousePosition.y,
    };

    this.targetRotation.y += deltaMove.x * 0.007;
    this.targetRotation.x += deltaMove.y * 0.007;
    this.targetRotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.targetRotation.x));

    this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  private applyOuterFrameColors(shift = 0): void {
    const presetColor = FRAME_OUTER_COLORS[this.config.framePresetId] || 0xe5b3b3;
    const base = parseFrameColorHex(this.config.customFrameColor);
    const gradient = Boolean(this.config.gradientColorCycle);
    const [gr, gg, gb] = gradient ? gradientAccentRgb(shift) : [1, 1, 1];

    this.cubeGroup?.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        if (base) {
          child.material.color.setRGB(base.r * gr, base.g * gg, base.b * gb);
        } else if (gradient) {
          child.material.color.setRGB(gr, gg, gb);
        } else {
          child.material.color.setHex(presetColor);
        }
      }
    });
  }

  private animate = (now: number) => {
    if (this.isDestroyed) return;
    const deltaMs = now - this.lastTime;
    this.lastTime = now;

    this.updateParticles(deltaMs);

    const elapsedMs = now - this.timelineStart;
    const effect = this.config.presentationEffectId || 'cube_focus';
    
    // Delegate timeline rotation controls
    const Fan = (window as any).WeddingSimpleFan;
    if (this.cubeGroup && effect === 'cube_focus' && Fan) {
      const durationMs = Fan.getPresentationDurationMs(this.config.images.length, this.config.fanSpeed || 1);
      const loopBridgeMs = Fan.FAN_LOOP_BRIDGE_MS / Math.max(0.35, this.config.fanSpeed || 1);
      
      const segmentMs = this.config.images.map((_, idx) => Fan.getFanStepSegmentMs(idx, this.config.fanSpeed || 1));
      const timelineMs = elapsedMs % durationMs;

      const resolved = Fan.resolvePresentationTimeline(timelineMs, segmentMs, loopBridgeMs);
      if (resolved.kind === 'loop_bridge') {
        const bridge = Fan.sampleLoopBridge(
          resolved.bridgeElapsed,
          loopBridgeMs,
          resolved.lastStep,
          0,
          this.config.cubeRotationMode,
          this.config.fanSpeed || 1
        );
        this.cubeGroup.rotation.set(bridge.rotation.x, bridge.rotation.y, bridge.rotation.z);
        this.cubeGroup.scale.setScalar(bridge.presentationScale);
        this.updateParallax(null, 0, 0);
      } else {
        const { step, stepElapsed } = resolved;
        const face = Fan.getPresentationFace(step);
        const motion = Fan.sampleFanCubeMotion(
          step,
          stepElapsed,
          face,
          this.config.images.length,
          0,
          this.config.cubeRotationMode,
          this.config.fanSpeed || 1
        );
        this.cubeGroup.rotation.set(motion.rotation.x, motion.rotation.y, motion.rotation.z);
        this.cubeGroup.scale.setScalar(motion.presentationScale);
        
        const isParallaxAllowed = ['showcase_hold'].includes(motion.phase);
        const parallaxAmount =
          isParallaxAllowed && this.config.voluMaxDepthEnabled ? motion.parallaxAmount : 0;
        const focusPulse =
          isParallaxAllowed && this.config.voluMaxDepthEnabled ? motion.focusPulse ?? 0 : 0;
        this.updateParallax(face, parallaxAmount, focusPulse);
      }
    } else if (this.cubeGroup) {
      // Default fallback continuous rotation
      if (!this.isDragging) {
        this.targetRotation.y += 0.006;
        this.targetRotation.x = Math.sin(now * 0.0008) * 0.12;
      }
      this.cubeGroup.rotation.y += (this.targetRotation.y - this.cubeGroup.rotation.y) * 0.08;
      this.cubeGroup.rotation.x += (this.targetRotation.x - this.cubeGroup.rotation.x) * 0.08;

      // Parallax effect calculations on default rotates
      this.cubeFaces.forEach((face) => {
        if (face.innerMesh && face.bgMesh) {
          const angle = this.cubeGroup!.rotation.y + face.offsetAngle;
          face.innerMesh.position.x = Math.sin(angle) * 0.10;
          face.bgMesh.position.x = -Math.sin(angle) * 0.07;

          const pitch = this.cubeGroup!.rotation.x;
          face.innerMesh.position.y = Math.sin(pitch) * 0.08;
          face.bgMesh.position.y = -Math.sin(pitch) * 0.06;
        }
      });
    }

    this.applyOuterFrameColors(elapsedMs * 0.0012);

    if (this.scene && this.camera && this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }

    if (this.config.onFrameUpdate) {
      this.config.onFrameUpdate(elapsedMs);
    }

    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  private getFaceImageMeta(face: (typeof this.cubeFaces)[number]): ProcessedImage | null {
    const n = this.config.images.length;
    if (!n) return null;
    const slot = face.imageSlot ?? 0;
    return this.config.images[slot % n] ?? null;
  }

  private updateParallax(activeFaceIdx: number | null, amount: number, focusPulse = 0) {
    const smooth = this.parallaxSmoothRate;
    this.parallaxDisplay += (amount - this.parallaxDisplay) * smooth;
    this.focusPulseDisplay += (focusPulse - this.focusPulseDisplay) * smooth;
    const effectiveAmount = this.parallaxDisplay;
    const effectivePulse = this.focusPulseDisplay;

    const contentScale = 0.94;
    const FG_Z = 0.05;
    const BG_Z = -0.01;

    this.cubeFaces.forEach((face) => {
      if (!face.innerMesh || !face.bgMesh) return;

      const img = this.getFaceImageMeta(face);
      const hasLayers = img ? this.imageHasVoluMaxLayers(img) : false;
      const isActive = activeFaceIdx != null && face.faceIndex === activeFaceIdx;
      const fgMat = face.innerMesh.material as THREE.MeshBasicMaterial;

      if (hasLayers && isActive) {
        face.bgMesh.visible = true;
        fgMat.transparent = true;
        fgMat.depthWrite = false;
        fgMat.alphaTest = 0.02;
        face.innerMesh.renderOrder = 2;

        const norm = Math.min(1, Math.max(0, effectiveAmount / 0.34));
        const zPop = norm * 0.07 + effectivePulse * 0.038;
        const forwardScale = contentScale * (1 + norm * 0.032 + effectivePulse * 0.05);
        const bgRecess = norm * 0.01 + effectivePulse * 0.006;

        face.bgMesh.position.set(0, 0, BG_Z - bgRecess);
        face.bgMesh.scale.set(contentScale * (1 - norm * 0.012), contentScale * (1 - norm * 0.012), 1);

        if (norm > 0.004 || effectivePulse > 0.004) {
          face.innerMesh.scale.set(forwardScale, forwardScale, 1);
          face.innerMesh.position.set(0, 0, FG_Z + zPop);
        } else {
          face.innerMesh.scale.set(contentScale, contentScale, 1);
          face.innerMesh.position.set(0, 0, FG_Z);
        }
        return;
      }

      if (hasLayers) {
        face.bgMesh.visible = true;
        face.bgMesh.position.set(0, 0, BG_Z);
        face.bgMesh.scale.set(contentScale, contentScale, 1);
        face.innerMesh.scale.set(contentScale, contentScale, 1);
        face.innerMesh.position.set(0, 0, FG_Z);
        fgMat.transparent = true;
        fgMat.depthWrite = false;
        fgMat.alphaTest = 0.04;
        face.innerMesh.renderOrder = 2;
        face.bgMesh.renderOrder = 0;
        return;
      }

      face.bgMesh.visible = false;
      face.innerMesh.scale.set(1, 1, 1);
      face.innerMesh.position.set(0, 0, 0.01);
      face.bgMesh.position.set(0, 0, -0.01);
      fgMat.transparent = false;
      fgMat.depthWrite = true;
      fgMat.alphaTest = 0;
      face.innerMesh.renderOrder = 0;
      face.bgMesh.renderOrder = 0;
    });
  }

  public updateSettings(settings: Partial<CubePlayerConfig>) {
    this.config = { ...this.config, ...settings };
    
    // Dynamically rebuild components when needed
    if (settings.particleTheme !== undefined || settings.hologramMode !== undefined) {
      this.buildParticles();
    }
    if (
      settings.framePresetId !== undefined ||
      settings.customFrameColor !== undefined ||
      settings.gradientColorCycle !== undefined
    ) {
      this.applyOuterFrameColors(0);
    }
    if (settings.images !== undefined) {
      void this.reloadTextures();
    }
    if (settings.viewportBackdropPath !== undefined) {
      this.applyViewportBackdrop();
    }
    if (settings.fanBladeFrameId !== undefined || settings.hologramMode !== undefined) {
      this.syncFanBladeOrnamentRing();
    }
  }

  public resetTimeline() {
    this.timelineStart = performance.now();
    this.lastTime = performance.now();
  }

  public captureStream(fps = 30): MediaStream {
    if (!this.renderer) throw new Error('Renderer not initialized');
    return this.renderer.domElement.captureStream(fps);
  }

  public resize() {
    const { container } = this.config;
    if (!this.renderer || !this.camera) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const size = Math.min(width, height);
    this.renderer.setSize(size, size);
    this.camera.aspect = 1.0;
    this.camera.updateProjectionMatrix();
    this.fanBladeOrnamentRing?.updateLayout(this.camera);
  }

  public setExportMode(enabled: boolean) {
    if (!this.renderer || !this.camera || !this.config.container) return;
    if (enabled) {
      // Save original container size and aspect ratio
      const container = this.config.container;
      this.originalSize.width = container.clientWidth;
      this.originalSize.height = container.clientHeight;
      this.originalAspect = this.camera.aspect;

      // Adjust to 1024x1024 for standard video output resolution
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(1024, 1024, false);
      this.camera.aspect = 1.0;
      this.camera.updateProjectionMatrix();

      // Reset the animation timeline
      this.resetTimeline();

      // Lock rotation parameters and reset cube scale to initial state
      if (this.cubeGroup) {
        this.cubeGroup.rotation.set(0, 0.38, 0);
        this.cubeGroup.scale.setScalar(0.58);
      }

      // Re-apply initial textures for all faces
      this.cubeFaces.forEach((_face, idx) => {
        this.applyTextureToFace(idx);
      });
    } else {
      // Restore standard display configurations
      const size = Math.min(this.originalSize.width || 1, this.originalSize.height || 1);
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this.renderer.setSize(size, size);
      this.camera.aspect = this.originalAspect;
      this.camera.updateProjectionMatrix();
    }
  }

  public dispose() {
    this.isDestroyed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.unbindEvents();

    // Dispose geometries, materials and WebGL renderer resources
    this.textures.forEach((t) => t.dispose());
    this.plateTextures.forEach((t) => t.dispose());
    this.foregroundTextures.forEach((t) => t.dispose());

    this.cubeGroup?.traverse((child) => {
       if (child instanceof THREE.Mesh) {
         child.geometry.dispose();
         if (Array.isArray(child.material)) {
           child.material.forEach((m: any) => m.dispose());
         } else {
           (child.material as THREE.Material).dispose();
         }
       }
     });

    if (this.particleSystem) {
      this.particleSystem.geometry.dispose();
      if (this.particleSystem.material instanceof THREE.Material) {
        this.particleSystem.material.dispose();
      }
    }

    if (this.fanBladeOrnamentRing) {
      this.fanBladeOrnamentRing.dispose();
      this.fanBladeOrnamentRing = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      const dom = this.renderer.domElement;
      if (dom.parentNode) {
        dom.parentNode.removeChild(dom);
      }
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.cubeGroup = null;
  }

  public inspectVoluMaxFaces() {
    const Fan = (window as any).WeddingSimpleFan;
    const activeIdx = Fan ? Fan.getPresentationFace(0) : 4;
    return {
      depthOn: this.config.voluMaxDepthEnabled,
      layerCount: this.cubeFaces.filter((f) => f.bgMesh.visible).length,
      activeFaceIndex: activeIdx,
      faces: this.cubeFaces.map((f) => ({
        faceIndex: f.faceIndex,
        isActive: f.faceIndex === activeIdx,
        bgVisible: f.bgMesh.visible,
        bgZ: f.bgMesh.position.z,
        fgZ: f.innerMesh.position.z,
        fgScale: f.innerMesh.scale.x,
        fgTransparent: (f.innerMesh.material as THREE.Material).transparent,
      })),
    };
  }

  public probeVoluMaxParallax() {
    const Fan = (window as any).WeddingSimpleFan;
    const face = Fan ? Fan.getPresentationFace(0) : 4;
    this.updateParallax(face, 0.34);
    return this.inspectVoluMaxFaces();
  }

  public getPresentationDebug() {
    return {
      settings: {
        voluMaxDepthEnabled: this.config.voluMaxDepthEnabled,
        voluMaxAutoPrepareLayers: this.config.voluMaxAutoPrepareLayers,
        voluMaxAiForegroundCutout: this.config.voluMaxAiForegroundCutout,
      },
      processed: this.config.images.map((p) => ({
        voluMaxPrepared: p.voluMaxPrepared,
        preprocessMode: p.preprocessMode,
        fgDiff: p.subjectForegroundUrl !== p.url,
      })),
    };
  }
}
