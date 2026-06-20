import * as THREE from "three";
import { configurePresentationTexture } from "../../cube/presentationTextures";
import { CRYSTAL_FRAME_GLSL } from "./crystalFrameGlsl";

const vertexShader = `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  // view-dependent sparkle for gem-like crystal
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform sampler2D uTexture;
uniform float uTime;
uniform float uBorderPulse;
uniform float uFocusPulse;
uniform float uAlpha;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;

${CRYSTAL_FRAME_GLSL}

void main() {
  vec4 photo = texture2D(uTexture, vUv);
  photo.rgb *= 1.0 + uFocusPulse * 0.06;
  vec4 framed = applyCrystalShowcaseFrame(photo, vUv);

  // Gem-like sparkle: fresnel + prismatic glints driven by normal/view.
  float ndv = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.2);
  float glint = pow(max(0.0, dot(normalize(vN), normalize(vec3(0.42, 0.72, 0.55)))), 18.0);
  float prismPhase = uTime * 0.8 + ndv * 6.0 + vUv.x * 3.0 + vUv.y * 2.0;
  vec3 prism = vec3(
    0.55 + 0.45 * sin(prismPhase),
    0.55 + 0.45 * sin(prismPhase + 2.094),
    0.55 + 0.45 * sin(prismPhase + 4.188)
  );
  vec3 sparkle = prism * (0.22 + uBorderPulse * 0.55) * (fres * 0.9 + glint * 0.6);
  framed.rgb += sparkle;

  // Extra edge brilliance for jewelry crystal look.
  framed.rgb += vec3(1.0) * fres * (0.06 + uBorderPulse * 0.18);
  framed.rgb *= clamp(uAlpha, 0.0, 1.0);
  framed.a *= clamp(uAlpha, 0.0, 1.0);
  gl_FragColor = framed;
}
`;

export interface CrystalShowcaseMaterial extends THREE.ShaderMaterial {
  uniforms: {
    uTexture: { value: THREE.Texture };
    uTime: { value: number };
    uBorderPulse: { value: number };
    uFocusPulse: { value: number };
    uAlpha: { value: number };
  };
}

export function createCrystalShowcaseMaterial(
  texture: THREE.Texture
): CrystalShowcaseMaterial {
  configurePresentationTexture(texture);
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL1,
    uniforms: {
      uTexture: { value: texture },
      uTime: { value: 0 },
      uBorderPulse: { value: 0.5 },
      uFocusPulse: { value: 0 },
      uAlpha: { value: 1 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }) as CrystalShowcaseMaterial;
}

export function updateCrystalShowcaseMaterial(
  material: CrystalShowcaseMaterial,
  texture: THREE.Texture,
  borderPulse: number,
  focusPulse: number,
  timeSec: number
): void {
  configurePresentationTexture(texture);
  material.uniforms.uTexture.value = texture;
  material.uniforms.uBorderPulse.value = borderPulse;
  material.uniforms.uFocusPulse.value = focusPulse;
  material.uniforms.uTime.value = timeSec;
}

export function setCrystalShowcaseFx(
  material: CrystalShowcaseMaterial,
  borderPulse: number,
  focusPulse: number,
  timeSec: number
): void {
  material.uniforms.uBorderPulse.value = borderPulse;
  material.uniforms.uFocusPulse.value = focusPulse;
  material.uniforms.uTime.value = timeSec;
}

export function setCrystalShowcaseAlpha(
  material: CrystalShowcaseMaterial,
  alpha: number
): void {
  material.uniforms.uAlpha.value = Math.max(0, Math.min(1, alpha));
}
