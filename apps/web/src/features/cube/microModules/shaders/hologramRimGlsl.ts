export const HOLOGRAM_RIM_GLSL = `

vec4 applyHologramRimOverlay(vec4 color, vec2 uv, float hologramMode, float rimEnabled, float rimTime) {

  if (rimEnabled < 0.5 || hologramMode < 0.5) {

    return color;

  }

  vec2 edge = min(uv, 1.0 - uv);

  float edgeDist = min(edge.x, edge.y);

  float w = max(fwidth(edgeDist) * 1.2, 0.0012);

  float glow = pow(1.0 - smoothstep(0.0, 0.14 + w, edgeDist), 2.0);

  vec3 rgb = color.rgb + vec3(0.22, 0.48, 0.72) * glow * 0.14;

  float alpha = max(color.a, glow * 0.18);

  return vec4(rgb, alpha);

}

`;

