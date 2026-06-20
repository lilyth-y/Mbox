/** Showcase optics tick — rim box removed (read as an extra cube shell). */

export interface HoloOpticsRig {
  power: number;
  phaseSec: number;
}

export function createHoloOpticsRig(): HoloOpticsRig {
  return { power: 0, phaseSec: 0 };
}

export function attachHoloOpticsToJewelRig(_rig: { collider: unknown }, _scene: unknown): HoloOpticsRig {
  return createHoloOpticsRig();
}

export function tickHoloOptics(optics: HoloOpticsRig, dtMs: number, power: number): void {
  optics.power = Math.max(0, Math.min(1, power));
  optics.phaseSec += dtMs * 0.001;
}

export function disposeHoloOptics(_optics: HoloOpticsRig): void {}
