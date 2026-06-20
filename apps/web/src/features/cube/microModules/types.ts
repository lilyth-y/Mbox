import type * as THREE from "three";
import type { PresentationEffectId } from "../presentationEffects";
import type { PresentationMicroModuleState } from "@mbox/shared";

/** Runtime contract — every micro-module implements this (CubeView never imports module internals). */
export interface PresentationMicroModuleContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer?: THREE.WebGLRenderer;
  hologramMode: boolean;
  modules: PresentationMicroModuleState;
  getPresentationRoot?: () => THREE.Object3D | null;
}

export interface PresentationMicroModuleRuntime {
  readonly id: string;
  mount(ctx: PresentationMicroModuleContext): void;
  update(deltaMs: number): void;
  applySettings(ctx: PresentationMicroModuleContext): void;
  dispose(): void;
}

export interface PresentationMicroModuleHostOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer?: THREE.WebGLRenderer;
  hologramMode: boolean;
  modules: PresentationMicroModuleState;
  getPresentationRoot?: () => THREE.Object3D | null;
}

/** Modules that override presentation effect id (e.g. orbital replaces cube). */
export interface PresentationEffectOverrideModule extends PresentationMicroModuleRuntime {
  resolveEffect(baseEffect: PresentationEffectId): PresentationEffectId;
}
