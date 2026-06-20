/** Shared tuning for hologram rim + edge-only selective bloom (faces stay off bloom layer). */
export const HOLOGRAM_EDGE_BLOOM = {
  strength: 0.46,
  threshold: 0.58,
  radius: 0.5,
} as const;

export const HOLOGRAM_WIREFRAME = {
  coreColor: 0xfff4e8,
  coreOpacity: 0.92,
  haloColor: 0xffc878,
  haloOpacity: 0.38,
  haloScale: 1.007,
  edgeThreshold: 18,
} as const;
