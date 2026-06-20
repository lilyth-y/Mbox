/**
 * Pluggable presentation micro-modules (opt-in, default OFF).
 * Definitions + quality roadmap: presentationMicroModuleRegistry.ts
 */

import {
  PRESENTATION_MICRO_MODULE_SPECS,
  type PresentationMicroModuleSpec,
} from "./presentationMicroModuleRegistry.js";

export type PresentationMicroModuleId =
  | "galaxy_background"
  | "orbital_showcase"
  | "hologram_fresnel_rim"
  | "selective_bloom";

export type OrbitalShapeId = "octahedron" | "icosahedron";

export type PresentationMicroModuleDefinition = Pick<
  PresentationMicroModuleSpec,
  "id" | "label" | "description" | "requiresHologram" | "replacesCubeMotion"
>;

export const PRESENTATION_MICRO_MODULES: PresentationMicroModuleDefinition[] =
  PRESENTATION_MICRO_MODULE_SPECS.map(({ id, label, description, requiresHologram, replacesCubeMotion }) => ({
    id,
    label,
    description,
    requiresHologram,
    replacesCubeMotion,
  }));

export interface PresentationMicroModuleState {
  galaxyBackground: boolean;
  orbitalShowcase: boolean;
  orbitalShapeId: OrbitalShapeId;
  hologramFresnelRim: boolean;
  selectiveBloom: boolean;
}

export const DEFAULT_PRESENTATION_MICRO_MODULE_STATE: PresentationMicroModuleState = {
  galaxyBackground: false,
  orbitalShowcase: false,
  orbitalShapeId: "octahedron",
  hologramFresnelRim: false,
  selectiveBloom: false,
};

export function resolvePresentationEffectWithMicroModules(
  baseEffect: string,
  modules: PresentationMicroModuleState
): string {
  if (modules.orbitalShowcase && baseEffect === "cube_focus") {
    return "orbital_showcase";
  }
  return baseEffect;
}

export function isMicroModuleEnabled(
  id: PresentationMicroModuleId,
  modules: PresentationMicroModuleState
): boolean {
  switch (id) {
    case "galaxy_background":
      return modules.galaxyBackground;
    case "orbital_showcase":
      return modules.orbitalShowcase;
    case "hologram_fresnel_rim":
      return modules.hologramFresnelRim;
    case "selective_bloom":
      return modules.selectiveBloom;
    default:
      return false;
  }
}

/** Map registry id → boolean state field. */
export function microModuleStateKey(
  id: PresentationMicroModuleId
): keyof Pick<
  PresentationMicroModuleState,
  "galaxyBackground" | "orbitalShowcase" | "hologramFresnelRim" | "selectiveBloom"
> {
  const spec = PRESENTATION_MICRO_MODULE_SPECS.find((entry) => entry.id === id);
  return spec?.stateKey ?? "galaxyBackground";
}

export function readMicroModuleEnabled(
  state: PresentationMicroModuleState,
  id: PresentationMicroModuleId
): boolean {
  const key = microModuleStateKey(id);
  return Boolean(state[key]);
}

export function writeMicroModuleEnabled(
  state: PresentationMicroModuleState,
  id: PresentationMicroModuleId,
  enabled: boolean
): PresentationMicroModuleState {
  const key = microModuleStateKey(id);
  return { ...state, [key]: enabled };
}
