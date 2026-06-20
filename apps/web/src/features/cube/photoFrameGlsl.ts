/**
 * Five wedding/product frame presets (GLSL). Include PHOTO_FRAME_GLSL once per shader.
 * Requires uniforms: uFrameFinish (0=glossy, 1=wood, 2=none), uCustomFrameColor, uUseCustomFrameColor,
 * uPhotoInsetExpand (1 = flat bleed into mat; 0 = keep composed RGB for VoluMax dual-layer),
 * uShellFrameMode (1 = 3D RoundedBox draws outer frame; shader fills with thin mat + full photo),
 * uFaceLightDir (fixed studio key light xy), uFaceGloss, uFaceShowcasePulse, etc.
 */
export const PHOTO_FRAME_GLSL = `
vec3 samplePhotoSurfaceTint(sampler2D tex) {
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int yi = 0; yi < 5; yi++) {
    for (int xi = 0; xi < 5; xi++) {
      float fi = float(xi);
      float fj = float(yi);
      vec2 tuv = vec2(0.22 + 0.56 * fi / 4.0, 0.22 + 0.56 * fj / 4.0);
      vec4 s = texture2D(tex, tuv);
      float aw = max(s.a, 0.42);
      acc += s.rgb * aw;
      wsum += aw;
    }
  }
  vec3 core = acc / max(wsum, 0.001);
  float luma = dot(core, vec3(0.2126, 0.7152, 0.0722));
  float maxC = max(max(core.r, core.g), core.b);
  float minC = min(min(core.r, core.g), core.b);
  float sat = maxC > 0.001 ? (maxC - minC) / maxC : 0.0;
  vec3 gray = vec3(luma);
  vec3 vivid = mix(gray, core, 0.55 + sat * 0.45);
  return mix(core, vivid, clamp(sat * 0.85, 0.0, 0.72));
}

vec3 glossyFrameSurface(vec2 uv, vec3 baseAccent, vec3 photoTint) {
  vec2 c = uv - 0.5;
  float ang = atan(c.y, c.x);
  float rad = length(c);
  float luma = dot(photoTint, vec3(0.2126, 0.7152, 0.0722));
  vec3 lacquer = mix(baseAccent, photoTint, 0.48);
  lacquer *= 0.78 + luma * 0.44;
  lacquer += photoTint * 0.12;
  float spec = pow(max(1.0 - abs(sin(ang * 3.0 + rad * 20.0)), 0.0), 9.0);
  float highlight = pow(max(1.0 - rad * 2.1, 0.0), 3.2);
  vec3 gloss = mix(lacquer, lacquer * 1.38 + vec3(0.06), spec * 0.62 + highlight * 0.38);
  gloss += vec3(1.0) * pow(max(1.0 - rad * 1.75, 0.0), 5.5) * 0.14;
  return gloss;
}

vec3 woodFrameSurface(vec2 uv, vec3 baseAccent, vec3 photoTint) {
  float grain = 0.5 + 0.5 * sin(uv.x * 44.0 + uv.y * 7.0);
  grain *= 0.5 + 0.5 * sin(uv.y * 30.0 + grain * 5.0);
  vec2 c = uv - 0.5;
  float ring = 0.5 + 0.5 * sin(length(c) * 34.0 + atan(c.y, c.x) * 2.2);
  float luma = dot(photoTint, vec3(0.2126, 0.7152, 0.0722));
  vec3 stain = mix(vec3(0.52, 0.40, 0.30), photoTint, 0.78);
  stain = mix(stain, baseAccent * 0.55, 0.18);
  stain *= 0.58 + luma * 0.62;
  vec3 dark = stain * 0.64;
  vec3 light = stain * (1.06 + grain * 0.16);
  return mix(dark, light, grain * 0.68 + ring * 0.18);
}

vec3 frameGradientTint(vec3 col) {
  if (uGradientEnabled < 0.5) return col;
  float wave = 0.5 + 0.5 * sin(uGradientShift);
  vec3 tint = vec3(
    0.65 + 0.35 * sin(uGradientShift),
    0.65 + 0.35 * sin(uGradientShift + 2.094),
    0.65 + 0.35 * sin(uGradientShift + 4.188)
  );
  return mix(col, col * tint, wave * 0.55);
}

float frameAa(float edgeDist, float inset, float feather) {
  float w = max(fwidth(edgeDist) * 1.4, 0.0008);
  return smoothstep(inset - w, inset + feather + w, edgeDist);
}

vec3 frameRoseGold(vec2 uv) {
  vec2 c = uv - 0.5;
  float band = 0.5 + 0.5 * sin(atan(c.y, c.x) * 5.0 + length(c) * 14.0);
  float grain = 0.5 + 0.5 * sin(dot(c, vec2(18.0, 11.0)) + length(c) * 22.0);
  return mix(vec3(0.78, 0.52, 0.54), vec3(0.94, 0.78, 0.62), clamp(band * 0.68 + grain * 0.22 + 0.12, 0.0, 1.0));
}

vec3 framePearl(vec2 uv) {
  vec2 c = uv - 0.5;
  float band = 0.5 + 0.5 * sin((uv.x + uv.y) * 18.0 + length(c) * 8.0);
  float sheen = pow(max(1.0 - length(c) * 1.35, 0.0), 2.2);
  return mix(vec3(0.90, 0.89, 0.92), vec3(0.99, 0.99, 1.0), band * 0.55 + sheen * 0.35);
}

vec3 frameClassicBlack(vec2 uv) {
  vec2 c = uv - 0.5;
  float band = 0.5 + 0.5 * cos(atan(c.y, c.x) * 2.5 + length(c) * 6.0);
  float gold = 0.5 + 0.5 * sin(atan(c.y, c.x) * 8.0);
  return mix(vec3(0.10, 0.09, 0.08), vec3(0.82, 0.66, 0.38), band * 0.5 + gold * 0.28 + 0.12);
}

vec3 frameSage(vec2 uv) {
  float band = 0.5 + 0.5 * sin(uv.x * 14.0) * cos(uv.y * 14.0);
  float vein = 0.5 + 0.5 * sin((uv.x - uv.y) * 20.0);
  return mix(vec3(0.52, 0.66, 0.50), vec3(0.80, 0.88, 0.72), band * 0.62 + vein * 0.22);
}

vec3 frameRoyalNavy(vec2 uv) {
  vec2 c = uv - 0.5;
  float band = 0.5 + 0.5 * sin(atan(c.y, c.x) * 3.5 + length(c) * 5.0);
  return mix(vec3(0.12, 0.18, 0.32), vec3(0.88, 0.72, 0.36), band * 0.72 + 0.18);
}

vec3 customFrameBand(vec2 uv) {
  vec2 c = uv - 0.5;
  float band = 0.5 + 0.5 * sin(atan(c.y, c.x) * 5.0 + length(c) * 12.0);
  return mix(uCustomFrameColor * 0.72, uCustomFrameColor * 1.14, clamp(band, 0.0, 1.0));
}

vec3 frameAccentColor(vec2 uv, float preset) {
  if (uUseCustomFrameColor > 0.5) return customFrameBand(uv);
  if (preset < 0.5) return frameRoseGold(uv);
  if (preset < 1.5) return framePearl(uv);
  if (preset < 2.5) return frameClassicBlack(uv);
  if (preset < 3.5) return frameSage(uv);
  return frameRoyalNavy(uv);
}

vec3 frameMatColor(float preset, float hologramMode) {
  if (uUseCustomFrameColor > 0.5) return uCustomFrameColor * 0.92;
  if (preset < 0.5) return vec3(1.0, 0.965, 0.94);
  if (preset < 1.5) return vec3(0.98, 0.98, 0.99);
  if (preset < 2.5) return vec3(0.22, 0.21, 0.20);
  if (preset < 3.5) return vec3(0.96, 0.98, 0.94);
  return vec3(0.94, 0.95, 0.98);
}

vec3 frameLineColor(float preset) {
  if (uUseCustomFrameColor > 0.5) return uCustomFrameColor * 1.08;
  if (preset < 0.5) return vec3(0.96, 0.84, 0.70);
  if (preset < 1.5) return vec3(0.88, 0.89, 0.93);
  if (preset < 2.5) return vec3(0.92, 0.76, 0.48);
  if (preset < 3.5) return vec3(0.74, 0.84, 0.64);
  return vec3(0.92, 0.80, 0.50);
}

vec3 frameAccentColorWithFinish(vec2 uv, float preset, vec3 photoTint) {
  vec3 base = frameAccentColor(uv, preset);
  if (uFrameFinish < 0.5) {
  // Outer 3D shell carries gloss — inner band stays flat pigment.
    return base;
  }
  return woodFrameSurface(uv, base, photoTint);
}

vec3 frameMatColorWithFinish(float preset, float hologramMode, vec3 photoTint) {
  vec3 mat = frameMatColor(preset, hologramMode);
  float luma = dot(photoTint, vec3(0.2126, 0.7152, 0.0722));
  if (uFrameFinish < 0.5) {
    return mix(mat, photoTint * 0.38 + mat * 0.62, 0.42);
  }
  vec3 innerWood = mix(vec3(0.46, 0.36, 0.27), photoTint * 0.58, 0.62);
  innerWood *= 0.72 + luma * 0.38;
  return mix(mat, innerWood, 0.74);
}

vec3 frameLineColorWithFinish(float preset, vec3 photoTint) {
  vec3 line = frameLineColor(preset);
  float maxC = max(max(photoTint.r, photoTint.g), photoTint.b);
  float minC = min(min(photoTint.r, photoTint.g), photoTint.b);
  float sat = maxC > 0.001 ? (maxC - minC) / maxC : 0.0;
  return mix(line, photoTint * 1.02 + line * 0.22, clamp(sat * 1.35 + 0.12, 0.0, 0.68));
}

vec2 photoWindowUv(vec2 uv, float inset) {
  return (uv - 0.5) / max(1.0 - 2.0 * inset, 0.001) * 0.5 + 0.5;
}

float frameCornerAccent(vec2 uv, float inset) {
  vec2 d = abs(uv - 0.5);
  float corner = step(inset, d.x) * step(inset, d.y);
  float nearCorner = step(0.32, max(d.x, d.y));
  float w = max(fwidth(max(d.x, d.y)) * 2.0, 0.002);
  return corner * smoothstep(0.32 - w, 0.32 + w, max(d.x, d.y)) * nearCorner;
}

vec3 applyPhotoPrintLacquer(vec3 rgb, vec2 uv, vec3 photoTint, float photoMask) {
  return rgb;
}

vec3 applyMatGlassLacquer(vec3 matCol, vec2 uv, vec3 photoTint, float matMask) {
  return matCol;
}

vec4 applyPhotoFrame(vec4 photo, vec2 uv, float preset, float hologramMode, sampler2D tintTex) {
  // Borderless — no mat; optional light UV inset discard handled in fragment main.
  if (uFrameFinish >= 1.5) {
    return photo;
  }
  vec3 photoTint = samplePhotoSurfaceTint(tintTex);
  float borderMul = max(uFrameBorderScale, 0.35);
  float frameScale = 1.05;
  float shellActive = step(0.5, uShellFrameMode);

  if (uPhotoInsetExpand < 0.5) {
    vec2 edge = min(uv, 1.0 - uv);
    float photoMask = mix(1.0, smoothstep(0.003, 0.022, min(edge.x, edge.y)), shellActive);
    vec3 rgb = applyPhotoPrintLacquer(photo.rgb, uv, photoTint, photoMask);
    return vec4(rgb, photo.a);
  }
  float photoInset = mix(
    (hologramMode > 0.5 ? 0.052 : 0.034) * frameScale / borderMul,
    0.0,
    shellActive
  );
  float matInset = mix(
    (hologramMode > 0.5 ? 0.028 : 0.020) * frameScale / borderMul,
    0.0,
    shellActive
  );

  vec2 edge = min(uv, 1.0 - uv);
  float edgeDist = min(edge.x, edge.y);
  float aa = max(fwidth(edgeDist) * 1.35, 0.0008);

  float photoMask = frameAa(edgeDist, photoInset, 0.012 * frameScale);
  float matMask = frameAa(edgeDist, matInset, 0.009 * frameScale) * (1.0 - photoMask);

  float frameWidth = (hologramMode > 0.5 ? 0.058 : 0.028) * frameScale * borderMul;
  float frameMask = (1.0 - shellActive) * (1.0 - smoothstep(0.002, frameWidth + aa, edgeDist));
  if (hologramMode <= 0.5) {
    frameMask *= 1.0 - photoMask;
  }

  float accentInset = photoInset;
  float accentLine = 1.0 - smoothstep(0.0, aa * 2.2 + 0.003, abs(edgeDist - accentInset));
  if (hologramMode <= 0.5) {
    accentLine *= 1.0 - photoMask;
  }

  float innerShadow = (1.0 - photoMask) * smoothstep(photoInset + 0.018, photoInset + aa, edgeDist) * mix(0.09, 0.16, shellActive);
  float outerBevel = frameMask * smoothstep(frameWidth * 0.35, aa, edgeDist) * 0.11;
  float shellInnerBevel = shellActive * (1.0 - photoMask) * smoothstep(photoInset + aa, photoInset + 0.024, edgeDist) * 0.13;
  float corner = frameCornerAccent(uv, 0.36) * frameMask;

  vec3 matCol = frameGradientTint(frameMatColorWithFinish(preset, hologramMode, photoTint));
  matCol = applyMatGlassLacquer(matCol, uv, photoTint, matMask);
  vec3 frameCol = frameGradientTint(frameAccentColorWithFinish(uv, preset, photoTint));
  vec3 lineCol = frameGradientTint(frameLineColorWithFinish(preset, photoTint));

  vec3 rgb = photo.rgb;
  float photoAlpha = photo.a;
  // Keep original photo framing — mat/frame overlays use masks only (no UV zoom).
  if (hologramMode > 0.5) {
    float a = clamp(photoAlpha, 0.0, 1.0);
    if (a > 0.001) {
      float blend = a < 0.999 ? a : 0.92;
      rgb = mix(matCol, rgb, blend);
    }
  }

  float matMix = hologramMode > 0.5 ? 0.88 : 0.94;
  float frameMix = hologramMode > 0.5 ? 0.82 : 0.96;
  rgb = mix(rgb, matCol, matMask * matMix);
  rgb = mix(rgb, frameCol, frameMask * frameMix);
  rgb += lineCol * accentLine * (hologramMode > 0.5 ? 0.48 : 0.58);
  rgb += lineCol * corner * (hologramMode > 0.5 ? 0.14 : 0.16);
  rgb += frameCol * outerBevel * (hologramMode > 0.5 ? 0.22 : 0.22);
  rgb += frameCol * shellInnerBevel;
  rgb *= 1.0 - innerShadow;
  rgb = applyPhotoPrintLacquer(rgb, uv, photoTint, photoMask);

  float alpha = max(photoAlpha, max(frameMask, matMask * 0.98));
  return vec4(rgb, alpha);
}
`;

/** @deprecated Use getCubeFramePreset().sceneBackground */
export const WEDDING_SCENE_BACKGROUND = 0x1c1418;
