/**
 * Wedding hologram display stack — shared visual constants (Three + Babylon).
 * L0 environment · L1 shell · L2 depth content · L3 optics · L4 motion.
 */
export const HOLOGRAM_DISPLAY_SPEC = {
  /** Inner background plane recess (× inner edge). */
  backgroundZOffset: -0.038,
  /** Foreground cutout forward offset (× inner edge). */
  foregroundZOffset: 0.045,
  /** Showcase parallax Z push at hero hold (meters, local). */
  parallaxSubjectZ: 0.012,
  /** Crystal shell alpha — thin holo medium, not thick glass. */
  shellAlpha: 0.022,
  /** Cut-gem paperweight shell (Babylon showcase). */
  paperweightShellAlpha: 0.22,
  paperweightIor: 1.88,
  paperweightDispersion: 12,
  paperweightRefractionIntensity: 0.98,
  paperweightThickness: 1.65,
  /** Rim mesh emissive strength at full power. */
  rimEmissive: 0.18,
  rimColor: { r: 0.88, g: 0.94, b: 1 },
  /** Reveal stage rim/content power-up duration. */
  revealPowerRampMs: 520,
  /** Inner emissive boost (holo luminance). */
  contentEmissive: { r: 1, g: 1, b: 1 },
  /** Dark holo booth environment. */
  clearColor: { r: 0.04, g: 0.05, b: 0.08, a: 1 },
  fogColor: { r: 0.06, g: 0.08, b: 0.12 },
  fogDensity: 0.012,
  envIntensity: 1.15,
  /** Default: holo playlist loop without physics drop. */
  fallPhysicsDefault: false,
  /** Hero pull — photo fills this fraction of square viewport (centered). */
  pullPhotoViewportFill: 0.7,
  /** Inner photo UV — occupies this fraction of 1:1 face (centered). */
  photoFaceViewportFill: 0.7,
} as const;

export type HologramDisplaySpec = typeof HOLOGRAM_DISPLAY_SPEC;
