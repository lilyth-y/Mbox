import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { PointLight } from "@babylonjs/core/Lights/pointLight";
import { PointLight as PointLightCtor } from "@babylonjs/core/Lights/pointLight";
import type { Scene } from "@babylonjs/core/scene";
import type { PhotoCrystalPhotoMode, PhotoCrystalShapeId } from "./photoCrystalShapeCatalog";
import { getPhotoCrystalOrbitProfile } from "./photoCrystalLightingProfile";
import { getShowcaseBackgroundLightingState } from "./showcaseBackgroundState";

export type ShowcaseShellLightSnapshot = {
  orbit: Vector3;
  orbit2: Vector3;
  orbit3: Vector3;
  key: Vector3;
  rim: Vector3;
};

export interface ShowcaseJewelLightingRig {
  key: PointLight;
  rim: PointLight;
  fill: PointLight;
  sparkle: PointLight;
  orbitSweep: PointLight;
  setAnchor: (center: Vector3) => void;
  tick: (timeSec: number, power: number, shapeId?: PhotoCrystalShapeId, photoLayout?: PhotoCrystalPhotoMode) => void;
  getShellLightSnapshot: () => ShowcaseShellLightSnapshot;
  dispose: () => void;
}

export function createShowcaseJewelLighting(scene: Scene, anchor: Vector3): ShowcaseJewelLightingRig {
  const baseKey = new Color3(1, 0.98, 0.94);
  const baseRim = new Color3(0.72, 0.86, 1);
  const baseFill = new Color3(0.82, 0.88, 0.98);
  const baseSparkle = new Color3(0.95, 0.98, 1);
  const baseOrbit = new Color3(1, 0.99, 0.96);

  const key = new PointLightCtor("jewel-key", anchor.add(new Vector3(-2.8, 1.2, 3.6)), scene);
  key.diffuse = baseKey.clone();
  key.specular = new Color3(1, 1, 1);
  key.intensity = 2.1;
  key.range = 16;

  const rim = new PointLightCtor("jewel-rim", anchor.add(new Vector3(2.6, 0.4, -3.2)), scene);
  rim.diffuse = baseRim.clone();
  rim.specular = new Color3(0.9, 0.95, 1);
  rim.intensity = 1.65;
  rim.range = 15;

  const fill = new PointLightCtor("jewel-fill", anchor.add(new Vector3(0.5, -1.4, 2.4)), scene);
  fill.diffuse = baseFill.clone();
  fill.specular = new Color3(0.4, 0.45, 0.55);
  fill.intensity = 0.72;
  fill.range = 13;

  const sparkle = new PointLightCtor("jewel-sparkle", anchor.add(new Vector3(0.2, 2.1, 1.8)), scene);
  sparkle.diffuse = baseSparkle.clone();
  sparkle.specular = new Color3(1, 1, 1);
  sparkle.intensity = 1.35;
  sparkle.range = 12;

  const orbitSweep = new PointLightCtor(
    "jewel-orbit-sweep",
    anchor.add(new Vector3(5.5, 2.4, 0)),
    scene
  );
  orbitSweep.diffuse = baseOrbit.clone();
  orbitSweep.specular = new Color3(1, 1, 1);
  orbitSweep.intensity = 2.8;
  orbitSweep.range = 28;

  const offsets = {
    key: new Vector3(-2.8, 1.2, 3.6),
    fill: new Vector3(0.5, -1.4, 2.4),
    sparkle: new Vector3(0.2, 2.1, 1.8),
  };

  let center = anchor.clone();
  const lights: ShowcaseShellLightSnapshot = {
    orbit: orbitSweep.position.clone(),
    orbit2: new Vector3(),
    orbit3: new Vector3(),
    key: key.position.clone(),
    rim: rim.position.clone(),
  };

  const setAnchor = (next: Vector3) => {
    center = next.clone();
    key.position.copyFrom(center.add(offsets.key));
    lights.key.copyFrom(key.position);
    fill.position.copyFrom(center.add(offsets.fill));
    sparkle.position.copyFrom(center.add(offsets.sparkle));
  };

  const tick = (
    timeSec: number,
    power: number,
    shapeId: PhotoCrystalShapeId = "cube",
    photoLayout: PhotoCrystalPhotoMode = "cube"
  ) => {
    const p = Math.max(0, Math.min(1, power));
    const profile = getPhotoCrystalOrbitProfile(shapeId, photoLayout);
    const wobble = 0.45;

    const backdrop = getShowcaseBackgroundLightingState();
    if (backdrop.mediaActive && backdrop.sample) {
      const t = backdrop.influence;
      const { average, bright } = backdrop.sample;
      const warm = new Color3(
        bright.r * 0.55 + average.r * 0.45,
        bright.g * 0.55 + average.g * 0.45,
        bright.b * 0.55 + average.b * 0.45
      );
      const cool = new Color3(
        average.r * 0.65 + 0.2,
        average.g * 0.7 + 0.22,
        average.b * 0.85 + 0.28
      );
      const avgColor = new Color3(average.r, average.g, average.b);
      const brightColor = new Color3(bright.r, bright.g, bright.b);
      key.diffuse = Color3.Lerp(baseKey, warm, t * 0.82);
      rim.diffuse = Color3.Lerp(baseRim, cool, t * 0.9);
      fill.diffuse = Color3.Lerp(baseFill, avgColor, t * 0.55);
      sparkle.diffuse = Color3.Lerp(baseSparkle, brightColor, t * 0.75);
      orbitSweep.diffuse = Color3.Lerp(baseOrbit, warm, t * 0.7);
      orbitSweep.intensity = 2.2 + p * 1.6 + backdrop.sample.luminance * t * 1.1;
    } else {
      key.diffuse.copyFrom(baseKey);
      rim.diffuse.copyFrom(baseRim);
      fill.diffuse.copyFrom(baseFill);
      sparkle.diffuse.copyFrom(baseSparkle);
      orbitSweep.diffuse.copyFrom(baseOrbit);
    }

    key.position.x = center.x + offsets.key.x + Math.sin(timeSec * 0.55) * wobble;
    key.position.z = center.z + offsets.key.z + Math.cos(timeSec * 0.48) * wobble;
    lights.key.copyFrom(key.position);

    sparkle.intensity = 0.95 + p * 1.15 + Math.sin(timeSec * 5.5) * 0.18 * p;
    key.intensity = 1.75 + p * 0.85;

    const sweepR = profile.sweepRadius + p * 1.2;
    const baseY = profile.sweepHeight + Math.sin(timeSec * 0.38) * profile.sweepHeightWobble;

    // Orbit A — primary horizontal sweep.
    const a1 = timeSec * profile.sweepSpeed;
    lights.orbit.x = center.x + Math.cos(a1) * sweepR;
    lights.orbit.y = center.y + baseY;
    lights.orbit.z = center.z + Math.sin(a1) * sweepR;
    orbitSweep.position.copyFrom(lights.orbit);
    if (!backdrop.mediaActive || !backdrop.sample) {
      orbitSweep.intensity = 2.2 + p * 1.6 + Math.sin(timeSec * 3.2) * 0.25 * p;
    }

    // Orbit B — tilted ellipse (different speed/phase).
    const a2 = timeSec * (profile.sweepSpeed * 1.14) + 1.7;
    const r2 = sweepR * 0.9;
    lights.orbit2.x = center.x + Math.cos(a2) * r2;
    lights.orbit2.y = center.y + baseY * 0.65 + Math.sin(a2 * 1.25) * 0.85;
    lights.orbit2.z = center.z + Math.sin(a2) * r2 * 0.82;

    // Orbit C — high arc from above (vertical emphasis for prisms).
    const a3 = timeSec * (profile.sweepSpeed * 0.68) + 3.1;
    const r3 = sweepR * 1.08;
    lights.orbit3.x = center.x + Math.cos(a3) * r3 * 0.75;
    lights.orbit3.y = center.y + 0.95 + Math.sin(a3) * 0.75;
    lights.orbit3.z = center.z + Math.sin(a3) * r3;

    // Rim — counter-orbit at mid distance.
    const aRim = timeSec * 0.41 + 0.8;
    const rimR = 4.4 + p * 0.8;
    lights.rim.x = center.x + Math.cos(aRim) * rimR;
    lights.rim.y = center.y + 0.55 + Math.sin(timeSec * 0.33) * 0.65;
    lights.rim.z = center.z + Math.sin(aRim) * rimR;
    rim.position.copyFrom(lights.rim);
    rim.intensity = 1.15 + p * 0.85;

    fill.position.x = center.x + Math.cos(timeSec * 0.52 + 2.2) * 3.2;
    fill.position.y = center.y - 0.9 + Math.sin(timeSec * 0.29) * 0.35;
    fill.position.z = center.z + Math.sin(timeSec * 0.52 + 2.2) * 3.2;
    fill.intensity = 0.62 + p * 0.35;
  };

  const getShellLightSnapshot = (): ShowcaseShellLightSnapshot => ({
    orbit: lights.orbit.clone(),
    orbit2: lights.orbit2.clone(),
    orbit3: lights.orbit3.clone(),
    key: lights.key.clone(),
    rim: lights.rim.clone(),
  });

  const dispose = () => {
    key.dispose();
    rim.dispose();
    fill.dispose();
    sparkle.dispose();
    orbitSweep.dispose();
  };

  return {
    key,
    rim,
    fill,
    sparkle,
    orbitSweep,
    setAnchor,
    tick,
    getShellLightSnapshot,
    dispose,
  };
}
