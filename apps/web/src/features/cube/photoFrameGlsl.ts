/**
 * Five wedding/product frame presets (GLSL). Include PHOTO_FRAME_GLSL once per shader.
 */
export const PHOTO_FRAME_GLSL = `
vec3 frameRoseGold(vec2 uv) {
  vec2 c = uv - 0.5;
  float band = 0.5 + 0.5 * sin(atan(c.y, c.x) * 4.0 + length(c) * 9.0);
  return mix(vec3(0.78, 0.52, 0.54), vec3(0.90, 0.74, 0.58), clamp(band * 0.72 + 0.18, 0.0, 1.0));
}

vec3 framePearl(vec2 uv) {
  float band = 0.5 + 0.5 * sin((uv.x + uv.y) * 14.0);
  return mix(vec3(0.92, 0.91, 0.93), vec3(0.98, 0.98, 1.0), band);
}

vec3 frameClassicBlack(vec2 uv) {
  vec2 c = uv - 0.5;
  float band = 0.5 + 0.5 * cos(atan(c.y, c.x) * 2.0);
  return mix(vec3(0.12, 0.11, 0.10), vec3(0.72, 0.58, 0.32), band * 0.55 + 0.25);
}

vec3 frameSage(vec2 uv) {
  float band = 0.5 + 0.5 * sin(uv.x * 11.0) * cos(uv.y * 11.0);
  return mix(vec3(0.55, 0.68, 0.52), vec3(0.78, 0.86, 0.70), band);
}

vec3 frameRoyalNavy(vec2 uv) {
  vec2 c = uv - 0.5;
  float band = 0.5 + 0.5 * sin(atan(c.y, c.x) * 3.0);
  return mix(vec3(0.14, 0.20, 0.34), vec3(0.82, 0.68, 0.38), band * 0.7 + 0.2);
}

vec3 frameAccentColor(vec2 uv, float preset) {
  if (preset < 0.5) return frameRoseGold(uv);
  if (preset < 1.5) return framePearl(uv);
  if (preset < 2.5) return frameClassicBlack(uv);
  if (preset < 3.5) return frameSage(uv);
  return frameRoyalNavy(uv);
}

vec3 frameMatColor(float preset, float hologramMode) {
  if (preset < 0.5) return vec3(1.0, 0.965, 0.94);
  if (preset < 1.5) return vec3(0.98, 0.98, 0.99);
  if (preset < 2.5) return vec3(0.22, 0.21, 0.20);
  if (preset < 3.5) return vec3(0.96, 0.98, 0.94);
  return vec3(0.94, 0.95, 0.98);
}

vec3 frameLineColor(float preset) {
  if (preset < 0.5) return vec3(0.95, 0.82, 0.68);
  if (preset < 1.5) return vec3(0.85, 0.86, 0.90);
  if (preset < 2.5) return vec3(0.88, 0.72, 0.45);
  if (preset < 3.5) return vec3(0.72, 0.82, 0.62);
  return vec3(0.90, 0.78, 0.48);
}

float frameCornerAccent(vec2 uv, float inset) {
  vec2 d = abs(uv - 0.5);
  float corner = step(inset, d.x) * step(inset, d.y);
  float nearCorner = step(0.34, max(d.x, d.y));
  return corner * nearCorner;
}

/** Rectangular mat + accent frame on every face (hologram uses same path, slightly wider border). */
vec4 applyPhotoFrame(vec4 photo, vec2 uv, float preset, float hologramMode) {
  // Frame should sit at the cube face edge (uv 0..1). Keep photo nearly full-bleed
  // so the outer frame aligns with the cube's boundary without a large black gutter.
  // Hologram preview needs a clearly visible border on black. We keep it modest,
  // but allow the frame line to overlay the photo edge so the cube reads as a cube.
  const float photoInset = hologramMode > 0.5 ? 0.055 : 0.036;
  const float matInset = hologramMode > 0.5 ? 0.030 : 0.022;

  vec2 edge = min(uv, 1.0 - uv);
  float edgeDist = min(edge.x, edge.y);

  float photoMask = smoothstep(photoInset, photoInset + 0.014, edgeDist);
  float matMask =
    smoothstep(matInset, matInset + 0.01, edgeDist) * (1.0 - photoMask);
  float frameWidth = hologramMode > 0.5 ? 0.042 : 0.016;
  float frameMask = 1.0 - smoothstep(0.003, frameWidth, edgeDist);
  if (hologramMode <= 0.5) {
    frameMask *= 1.0 - photoMask;
  }

  float accentLine = 1.0 - smoothstep(0.0015, 0.0045, abs(edgeDist - photoInset));
  if (hologramMode <= 0.5) {
    accentLine *= 1.0 - photoMask;
  }

  float corner = frameCornerAccent(uv, 0.36) * frameMask * 0.45;

  vec3 matCol = frameMatColor(preset, hologramMode);
  vec3 frameCol = frameAccentColor(uv, preset);
  vec3 lineCol = frameLineColor(preset);

  vec3 rgb = photo.rgb;
  if (hologramMode > 0.5) {
    float a = clamp(photo.a, 0.0, 1.0);
    // Cutout PNGs carry alpha; JPEG/originals are opaque. For opaque sources,
    // still mix in a bit of mat so the cube reads on black.
    float blend = a < 0.999 ? a : 0.92;
    rgb = mix(matCol, photo.rgb, blend);
  }
  float matMix = hologramMode > 0.5 ? 0.97 : 0.94;
  float frameMix = hologramMode > 0.5 ? 0.98 : 0.96;
  rgb = mix(rgb, matCol, matMask * matMix);
  rgb = mix(rgb, frameCol, frameMask * frameMix);
  rgb += lineCol * accentLine * (hologramMode > 0.5 ? 0.62 : 0.55);
  rgb += lineCol * corner * (hologramMode > 0.5 ? 0.16 : 0.12);

  float alpha = hologramMode > 0.5
    ? max(max(photoMask, frameMask), matMask * 0.98)
    : max(photo.a, max(frameMask, matMask * 0.98));
  return vec4(rgb, alpha);
}
`;

/** @deprecated Use getCubeFramePreset().sceneBackground */
export const WEDDING_SCENE_BACKGROUND = 0x1c1418;
