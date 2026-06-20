import {
  DEFAULT_PRESENTATION_MICRO_MODULE_STATE,
  resolvePresentationEffectWithMicroModules,
  type PresentationMicroModuleState,
} from "@mbox/shared";
import type { PresentationEffectId } from "../presentationEffects";
import type { PresentationEffectOverrideModule, PresentationMicroModuleContext } from "./types";

const MODULE_ID = "orbital_showcase";

/** Effect routing only — scene geometry lives in presentationScene (orbital_showcase branch). */
export class OrbitalShowcaseMicroModule implements PresentationEffectOverrideModule {
  readonly id = MODULE_ID;

  mount(_ctx: PresentationMicroModuleContext): void {}

  applySettings(_ctx: PresentationMicroModuleContext): void {}

  update(_deltaMs: number): void {}

  dispose(): void {}

  resolveEffect(baseEffect: PresentationEffectId): PresentationEffectId {
    return resolvePresentationEffectWithMicroModules(
      baseEffect,
      this.lastModules
    ) as PresentationEffectId;
  }

  private lastModules: PresentationMicroModuleState = {
    ...DEFAULT_PRESENTATION_MICRO_MODULE_STATE,
  };

  /** Host calls this when settings change so resolveEffect stays in sync. */
  syncModules(modules: PresentationMicroModuleState): void {
    this.lastModules = modules;
  }
}
