import type { PresentationMicroModuleState } from "@mbox/shared";

import type * as THREE from "three";

import type { PresentationEffectId } from "../presentationEffects";

import { GalaxyBackgroundMicroModule } from "./galaxyBackgroundModule";

import { HologramFresnelRimMicroModule } from "./hologramFresnelRimModule";

import { OrbitalShowcaseMicroModule } from "./orbitalShowcaseModule";

import { SelectiveBloomMicroModule } from "./selectiveBloomModule";

import type {

  PresentationMicroModuleHostOptions,

  PresentationMicroModuleRuntime,

} from "./types";



/**

 * Single mount point for all presentation micro-modules.

 * CubeView MUST use this host — do not wire modules directly in CubeView.

 */

export class PresentationMicroModuleHost {

  private readonly runtimes: PresentationMicroModuleRuntime[] = [

    new GalaxyBackgroundMicroModule(),

    new OrbitalShowcaseMicroModule(),

    new HologramFresnelRimMicroModule(),

    new SelectiveBloomMicroModule(),

  ];



  private orbitalModule: OrbitalShowcaseMicroModule;

  private bloomModule: SelectiveBloomMicroModule;



  constructor() {

    this.orbitalModule = this.runtimes.find(

      (runtime) => runtime.id === "orbital_showcase"

    ) as OrbitalShowcaseMicroModule;

    this.bloomModule = this.runtimes.find(

      (runtime) => runtime.id === "selective_bloom"

    ) as SelectiveBloomMicroModule;

  }



  private buildContext(options: PresentationMicroModuleHostOptions) {

    return {

      scene: options.scene,

      camera: options.camera,

      renderer: options.renderer,

      hologramMode: options.hologramMode,

      modules: options.modules,

      getPresentationRoot: options.getPresentationRoot,

    };

  }



  mount(options: PresentationMicroModuleHostOptions): void {

    const ctx = this.buildContext(options);

    for (const runtime of this.runtimes) {

      runtime.mount(ctx);

    }

    this.orbitalModule.syncModules(options.modules);

  }



  applySettings(options: PresentationMicroModuleHostOptions): void {

    const ctx = this.buildContext(options);

    for (const runtime of this.runtimes) {

      runtime.applySettings(ctx);

    }

    this.orbitalModule.syncModules(options.modules);

  }



  update(deltaMs: number): void {

    for (const runtime of this.runtimes) {

      runtime.update(deltaMs);

    }

  }



  resize(width: number, height: number): void {

    this.bloomModule.resize(width, height);

  }



  render(

    renderer: THREE.WebGLRenderer,

    scene: THREE.Scene,

    camera: THREE.PerspectiveCamera

  ): void {

    if (!this.bloomModule.render()) {

      renderer.render(scene, camera);

    }

  }



  syncLayout(width: number, height: number, options: PresentationMicroModuleHostOptions): void {
    this.applySettings(options);
    this.resize(width, height);
  }

  resolvePresentationEffect(baseEffect: PresentationEffectId): PresentationEffectId {

    return this.orbitalModule.resolveEffect(baseEffect);

  }



  dispose(): void {

    for (const runtime of this.runtimes) {

      runtime.dispose();

    }

  }

}



export function patchMicroModuleToggle(

  state: PresentationMicroModuleState,

  stateKey: keyof Pick<

    PresentationMicroModuleState,

    "galaxyBackground" | "orbitalShowcase" | "hologramFresnelRim" | "selectiveBloom"

  >,

  enabled: boolean

): PresentationMicroModuleState {

  return { ...state, [stateKey]: enabled };

}

