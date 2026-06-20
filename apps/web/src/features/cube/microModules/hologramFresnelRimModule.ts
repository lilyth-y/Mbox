import type * as THREE from "three";
import type {
  PresentationMicroModuleContext,
  PresentationMicroModuleRuntime,
} from "./types";
import { syncHologramRimUniforms } from "./microModuleShaderSync";

const MODULE_ID = "hologram_fresnel_rim";

export class HologramFresnelRimMicroModule implements PresentationMicroModuleRuntime {
  readonly id = MODULE_ID;
  private rimTime = 0;
  private presentationRoot: THREE.Object3D | null = null;
  private lastCtx: PresentationMicroModuleContext | null = null;

  mount(ctx: PresentationMicroModuleContext): void {
    this.presentationRoot = ctx.getPresentationRoot?.() ?? null;
    this.lastCtx = ctx;
    this.sync(ctx);
  }

  applySettings(ctx: PresentationMicroModuleContext): void {
    this.lastCtx = ctx;
    this.presentationRoot = ctx.getPresentationRoot?.() ?? this.presentationRoot;
    this.sync(ctx);
  }

  update(deltaMs: number): void {
    this.rimTime += deltaMs * 0.001;
    const root = this.presentationRoot ?? this.lastCtx?.getPresentationRoot?.() ?? null;
    if (root && this.lastCtx) {
      syncHologramRimUniforms(root, this.isActive(this.lastCtx), this.rimTime);
    }
  }

  dispose(): void {
    if (this.presentationRoot) {
      syncHologramRimUniforms(this.presentationRoot, false, 0);
    }
    this.presentationRoot = null;
    this.lastCtx = null;
  }

  private sync(ctx: PresentationMicroModuleContext): void {
    this.lastCtx = ctx;
    const root = ctx.getPresentationRoot?.() ?? this.presentationRoot;
    if (root) {
      this.presentationRoot = root;
      syncHologramRimUniforms(root, this.isActive(ctx), this.rimTime);
    }
  }

  private isActive(ctx: PresentationMicroModuleContext): boolean {
    return ctx.modules.hologramFresnelRim && ctx.hologramMode;
  }
}
