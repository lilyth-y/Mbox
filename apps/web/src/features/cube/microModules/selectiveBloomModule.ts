import * as THREE from "three";
import type {
  PresentationMicroModuleContext,
  PresentationMicroModuleRuntime,
} from "./types";
import { createSelectiveBloomPipeline, type SelectiveBloomPipeline } from "./selectiveBloomPipeline";
import { syncSelectiveBloomLayers } from "./selectiveBloomLayers";
import { HOLOGRAM_EDGE_BLOOM } from "./hologramEffectQuality";

const MODULE_ID = "selective_bloom";

export class SelectiveBloomMicroModule implements PresentationMicroModuleRuntime {
  readonly id = MODULE_ID;
  private pipeline: SelectiveBloomPipeline | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private lastCtx: PresentationMicroModuleContext | null = null;

  mount(ctx: PresentationMicroModuleContext): void {
    this.disposePipeline();
    this.renderer = ctx.renderer ?? null;
    this.scene = ctx.scene;
    this.camera = ctx.camera;
    this.lastCtx = ctx;
    this.rebuildPipeline();
    this.syncLayers(ctx);
  }

  applySettings(ctx: PresentationMicroModuleContext): void {
    this.renderer = ctx.renderer ?? this.renderer;
    this.scene = ctx.scene;
    this.camera = ctx.camera;
    this.lastCtx = ctx;
    this.rebuildPipeline();
    this.syncLayers(ctx);
  }

  update(_deltaMs: number): void {
    if (!this.lastCtx) {
      return;
    }
    this.syncLayers(this.lastCtx);
    if (!this.pipeline || !this.isActive(this.lastCtx)) {
      return;
    }
    this.pipeline.bloomPass.strength = HOLOGRAM_EDGE_BLOOM.strength;
    this.pipeline.bloomPass.threshold = HOLOGRAM_EDGE_BLOOM.threshold;
    this.pipeline.bloomPass.radius = HOLOGRAM_EDGE_BLOOM.radius;
  }

  resize(width: number, height: number): void {
    this.pipeline?.resize(width, height);
  }

  render(): boolean {
    if (!this.pipeline || !this.lastCtx || !this.scene || !this.camera) {
      return false;
    }
    if (!this.isActive(this.lastCtx)) {
      return false;
    }
    this.pipeline.render(this.scene, this.camera);
    return true;
  }

  dispose(): void {
    this.clearLayers();
    this.disposePipeline();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.lastCtx = null;
  }

  private isActive(ctx: PresentationMicroModuleContext): boolean {
    return ctx.modules.selectiveBloom && ctx.hologramMode;
  }

  private syncLayers(ctx: PresentationMicroModuleContext): void {
    const root = ctx.getPresentationRoot?.() ?? null;
    if (!root) {
      return;
    }
    syncSelectiveBloomLayers(root, {
      active: this.isActive(ctx),
      rimLayer: ctx.modules.hologramFresnelRim,
    });
  }

  private clearLayers(): void {
    const root = this.lastCtx?.getPresentationRoot?.() ?? null;
    if (root) {
      syncSelectiveBloomLayers(root, { active: false, rimLayer: false });
    }
  }

  private rebuildPipeline(): void {
    if (!this.renderer || !this.scene || !this.camera) {
      return;
    }
    this.disposePipeline();
    this.pipeline = createSelectiveBloomPipeline(this.renderer, this.scene, this.camera);
  }

  private disposePipeline(): void {
    this.pipeline?.dispose();
    this.pipeline = null;
  }
}
