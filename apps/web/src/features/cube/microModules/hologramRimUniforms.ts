export function createHologramRimUniforms(): Record<string, { value: number }> {
  return {
    uHologramRimEnabled: { value: 0 },
    uHologramRimTime: { value: 0 },
  };
}

export const HOLOGRAM_RIM_FRAGMENT_TAIL = `
  framed = applyHologramRimOverlay(
    framed,
    vUv,
    uHologramMode,
    uHologramRimEnabled,
    uHologramRimTime
  );
`;
