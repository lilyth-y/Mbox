/**
 * FBM nebula + 3-layer stars (galaxy-fbm-layers, galaxy-star-layers P0).
 */
export const GALAXY_BACKGROUND_FRAGMENT = `
uniform float uTime;
uniform float uIntensity;
varying vec3 vWorldDir;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise3(p);
    p = p * 2.02 + vec3(1.7, 9.2, 3.4);
    a *= 0.5;
  }
  return v;
}

float starLayer(vec3 dir, float density, float threshold, float twinkleSpeed) {
  vec3 p = dir * density;
  vec3 cell = floor(p);
  float h = hash(cell);
  float star = step(threshold, h);
  float tw = 0.55 + 0.45 * sin(uTime * twinkleSpeed + h * 52.0);
  return star * tw;
}

void main() {
  vec3 dir = normalize(vWorldDir);
  float t = uTime * 0.035;

  vec3 drift1 = dir + vec3(sin(t * 0.6), cos(t * 0.45), sin(t * 0.3)) * 0.12;
  vec3 drift2 = dir * 1.8 + vec3(cos(t * 0.25), sin(t * 0.35), 0.0);
  float n1 = fbm(drift1 * 2.4 + t * 0.15);
  float n2 = fbm(drift2 * 1.6 - t * 0.12);
  float n3 = fbm(dir * 3.2 + vec3(t * 0.08));
  float nebula = smoothstep(0.15, 0.92, n1 * 0.55 + n2 * 0.35 + n3 * 0.22);

  vec3 deep = vec3(0.015, 0.02, 0.06);
  vec3 purple = vec3(0.22, 0.07, 0.38);
  vec3 cyan = vec3(0.04, 0.16, 0.32);
  vec3 rose = vec3(0.28, 0.08, 0.18);
  vec3 col = mix(deep, purple, nebula * 0.7);
  col = mix(col, cyan, pow(nebula, 1.8) * n2 * 0.65);
  col = mix(col, rose, pow(n3, 2.5) * 0.35);

  float s1 = starLayer(dir, 118.0, 0.992, 2.4);
  float s2 = starLayer(dir + 0.04, 82.0, 0.988, 3.1) * 0.75;
  float s3 = starLayer(dir - 0.02, 56.0, 0.984, 1.7) * 0.5;
  col += vec3(0.88, 0.94, 1.0) * (s1 + s2 + s3) * 1.55;

  float bandY = dir.y - 0.1 + sin(dir.x * 2.2 + t) * 0.06;
  float band = exp(-pow(abs(bandY) * 4.2, 2.0));
  vec3 hAlpha = vec3(0.78, 0.16, 0.22);
  vec3 oiii = vec3(0.12, 0.62, 0.82);
  col += hAlpha * band * (0.34 + n2 * 0.2);
  col += oiii * band * band * (0.18 + n1 * 0.24);
  col += vec3(0.38, 0.24, 0.52) * band * 0.28;

  gl_FragColor = vec4(col * uIntensity, 1.0);
}
`;

export const GALAXY_BACKGROUND_VERTEX = `
varying vec3 vWorldDir;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(world.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;
