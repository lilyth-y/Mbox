import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { JewelCrystalShellMaterial } from "./shaders/jewelCrystalShellShader";
import type { ShowcaseBackdropSample } from "./showcaseBackdropSampler";
import { getCrystalShellAlphaMultiplier, getCrystalShellIceSuppress, getCrystalShellViewClearFactor } from "./showcaseCatalogColorState";

export type CrystalHarmonyProfile = "dark" | "bright" | "neutral";

export type CrystalHarmonyTuning = {
  profile: CrystalHarmonyProfile;
  exposure: number;
  contrast: number;
  shellAlpha: number;
  glossBoost: number;
  glowMul: number;
  iceTint: Color3;
  envMix: number;
};

export function classifyCrystalHarmonyProfile(sample: ShowcaseBackdropSample): CrystalHarmonyProfile {
  if (sample.luminance < 0.16) {
    return "dark";
  }
  if (sample.luminance > 0.52) {
    return "bright";
  }
  return "neutral";
}

export function computeCrystalHarmonyTuning(
  sample: ShowcaseBackdropSample,
  influence: number
): CrystalHarmonyTuning {
  const profile = classifyCrystalHarmonyProfile(sample);
  return computeCrystalHarmonyTuningForProfile(sample, influence, profile);
}

export function computeCrystalHarmonyTuningForProfile(
  sample: ShowcaseBackdropSample,
  influence: number,
  profile: CrystalHarmonyProfile
): CrystalHarmonyTuning {
  const t = Math.max(0, Math.min(1, influence));
  const { average, bright } = sample;

  const iceTint = new Color3(
    average.r * 0.35 + bright.r * 0.25 + 0.4,
    average.g * 0.35 + bright.g * 0.25 + 0.42,
    average.b * 0.4 + bright.b * 0.3 + 0.48
  );

  if (profile === "dark") {
    return {
      profile,
      exposure: 1.04 + t * 0.08,
      contrast: 1.1 + t * 0.05,
      shellAlpha: 0.52 + t * 0.1,
      glossBoost: 2.25 + t * 0.62,
      glowMul: 0.94 + t * 0.14,
      iceTint,
      envMix: 0.68 + t * 0.28,
    };
  }

  if (profile === "bright") {
    return {
      profile,
      exposure: 1.0 + t * 0.1,
      contrast: 1.03 + t * 0.04,
      shellAlpha: 0.44 + t * 0.08,
      glossBoost: 1.75 + t * 0.42,
      glowMul: 0.74 + t * 0.12,
      iceTint,
      envMix: 0.55 + t * 0.28,
    };
  }

  return {
    profile,
    exposure: 1.06 + t * 0.12,
    contrast: 1.07 + t * 0.05,
    shellAlpha: 0.48 + t * 0.1,
    glossBoost: 2.0 + t * 0.52,
    glowMul: 0.84 + t * 0.16,
    iceTint,
    envMix: 0.62 + t * 0.3,
  };
}

export function lerpCrystalHarmonyTuning(
  from: CrystalHarmonyTuning,
  to: CrystalHarmonyTuning,
  t: number
): CrystalHarmonyTuning {
  const alpha = Math.max(0, Math.min(1, t));
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  return {
    profile: alpha < 0.5 ? from.profile : to.profile,
    exposure: lerp(from.exposure, to.exposure),
    contrast: lerp(from.contrast, to.contrast),
    shellAlpha: lerp(from.shellAlpha, to.shellAlpha),
    glossBoost: lerp(from.glossBoost, to.glossBoost),
    glowMul: lerp(from.glowMul, to.glowMul),
    iceTint: Color3.Lerp(from.iceTint, to.iceTint, alpha),
    envMix: lerp(from.envMix, to.envMix),
  };
}

export function applyCrystalHarmonyToScene(
  scene: Scene,
  tuning: CrystalHarmonyTuning,
  blend = 1
): void {
  const t = Math.max(0, Math.min(1, blend));
  const ipc = scene.imageProcessingConfiguration;
  if (t >= 0.999) {
    ipc.exposure = tuning.exposure;
    ipc.contrast = tuning.contrast;
  } else {
    ipc.exposure = ipc.exposure + (tuning.exposure - ipc.exposure) * t;
    ipc.contrast = ipc.contrast + (tuning.contrast - ipc.contrast) * t;
  }
  ipc.toneMappingEnabled = true;
  const targetEnv = 1.05 + tuning.envMix * 0.95;
  scene.environmentIntensity =
    t >= 0.999
      ? targetEnv
      : scene.environmentIntensity + (targetEnv - scene.environmentIntensity) * t;
}

export function applyCrystalHarmonyToShell(
  shellMaterial: JewelCrystalShellMaterial,
  tuning: CrystalHarmonyTuning,
  power: number
): void {
  const p = Math.max(0, Math.min(1, power));
  const alphaMul = getCrystalShellAlphaMultiplier();
  shellMaterial.setFloat("uShellAlpha", tuning.shellAlpha * alphaMul);
  shellMaterial.setFloat("uShellOpacityScale", alphaMul);
  shellMaterial.setFloat("uViewClear", getCrystalShellViewClearFactor());
  shellMaterial.setFloat("uIceSuppress", getCrystalShellIceSuppress());
  shellMaterial.setFloat("uGlossBoost", tuning.glossBoost + p * 0.35);
  shellMaterial.setFloat("uEnvMix", tuning.envMix);
}
