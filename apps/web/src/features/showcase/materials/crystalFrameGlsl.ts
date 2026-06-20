/**
 * Ornate crystal frame GLSL — faceted glass, prismatic bands, corner jewels, sparkles.
 */
export const CRYSTAL_FRAME_GLSL = `
const float CRYSTAL_PHOTO_INSET = 0.13;

float crystalHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float crystalNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = crystalHash(i);
  float b = crystalHash(i + vec2(1.0, 0.0));
  float c = crystalHash(i + vec2(0.0, 1.0));
  float d = crystalHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 crystalIridescence(float angle, float rad, float pulse) {
  float hue = angle * 0.35 + rad * 4.2 + uTime * 0.35;
  vec3 a = vec3(0.55, 0.82, 1.0);
  vec3 b = vec3(0.95, 0.72, 1.0);
  vec3 c = vec3(0.72, 1.0, 0.92);
  vec3 d = vec3(1.0, 0.88, 0.55);
  float w1 = 0.5 + 0.5 * sin(hue);
  float w2 = 0.5 + 0.5 * sin(hue + 2.1);
  float w3 = 0.5 + 0.5 * sin(hue + 4.2);
  vec3 col = a * w1 + b * w2 * 0.85 + c * w3 * 0.7;
  col = mix(col, d, pulse * 0.35);
  return col;
}

float facetedCrystal(vec2 uv) {
  vec2 c = uv - 0.5;
  float ang = atan(c.y, c.x);
  float rad = length(c);
  float facets = 0.5 + 0.5 * cos(ang * 12.0 + rad * 28.0);
  float rings = 0.5 + 0.5 * sin(rad * 42.0 - ang * 3.0);
  return facets * 0.62 + rings * 0.38;
}

float ornateScallop(vec2 uv) {
  vec2 c = uv - 0.5;
  float ang = atan(c.y, c.x);
  float rad = length(c);
  float scallop = 0.5 + 0.5 * sin(ang * 8.0);
  scallop *= 0.5 + 0.5 * sin(ang * 16.0 + 1.2);
  return scallop * (1.0 - smoothstep(0.32, 0.5, rad));
}

float cornerJewel(vec2 uv) {
  vec2 c = abs(uv - 0.5);
  float d = max(c.x, c.y);
  float jewel = smoothstep(0.38, 0.44, d) * (1.0 - smoothstep(0.44, 0.48, d));
  float sparkle = pow(max(1.0 - length(c - vec2(0.41)) * 18.0, 0.0), 3.0);
  return jewel + sparkle * 0.85;
}

vec3 crystalFrameColor(vec2 uv, float pulse) {
  vec2 c = uv - 0.5;
  float ang = atan(c.y, c.x);
  float rad = length(c);
  float facet = facetedCrystal(uv);
  float scallop = ornateScallop(uv);
  float jewel = cornerJewel(uv);

  vec3 ice = vec3(0.78, 0.92, 1.0);
  vec3 prism = crystalIridescence(ang, rad, pulse);
  vec3 deep = mix(vec3(0.22, 0.38, 0.62), prism, 0.55);

  vec3 base = mix(deep, ice, facet * 0.55 + scallop * 0.25);
  base = mix(base, prism, 0.35 + pulse * 0.25);

  float spec = pow(max(1.0 - abs(sin(ang * 6.0 + rad * 24.0)), 0.0), 10.0);
  float highlight = pow(max(1.0 - rad * 1.9, 0.0), 4.0);
  base += vec3(1.0) * (spec * 0.45 + highlight * 0.22) * (0.65 + pulse * 0.55);

  float n = crystalNoise(uv * 48.0 + uTime * 0.15);
  base += vec3(0.85, 0.95, 1.0) * n * 0.08 * pulse;

  base += prism * jewel * (1.8 + pulse * 1.2);
  return base;
}

float animatedSparkle(vec2 uv, float pulse) {
  vec2 grid = floor(uv * 28.0);
  float h = crystalHash(grid + floor(uTime * 4.0));
  float flicker = 0.5 + 0.5 * sin(uTime * 11.0 + h * 24.0);
  float star = smoothstep(0.978, 1.0, h) * flicker;
  vec2 f = fract(uv * 28.0) - 0.5;
  float cross = exp(-dot(f, f) * 95.0);
  return star * cross * (0.35 + pulse * 0.85);
}

float photoInsetMask(vec2 uv) {
  vec2 edge = min(uv, 1.0 - uv);
  float inset = min(edge.x, edge.y);
  float w = max(fwidth(inset) * 1.2, 0.0008);
  return smoothstep(CRYSTAL_PHOTO_INSET - w, CRYSTAL_PHOTO_INSET + 0.002, inset);
}

vec4 applyCrystalShowcaseFrame(vec4 photo, vec2 uv) {
  float photoMask = photoInsetMask(uv);
  if (photoMask > 0.995) {
    return photo;
  }

  vec3 frame = crystalFrameColor(uv, uBorderPulse);
  float sparkle = animatedSparkle(uv, uBorderPulse);
  frame += vec3(1.0, 0.96, 0.88) * sparkle * 2.4;

  float innerLine = smoothstep(0.11, 0.125, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
  frame = mix(frame, frame * 1.25 + vec3(0.15, 0.22, 0.35), innerLine * 0.35);

  vec3 outRgb = mix(frame, photo.rgb, photoMask);
  float outA = max(photo.a * photoMask, 1.0 - photoMask);
  return vec4(outRgb, outA);
}
`;
