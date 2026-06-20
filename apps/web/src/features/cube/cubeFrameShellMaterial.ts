import * as THREE from "three";
import type { CubeFrameFinishId } from "@mbox/shared";
import { faceGlossStrength } from "./faceLacquerUniforms";
import { frameFinishUniformValue } from "./frameFinishUniforms";

/** Studio rig — matches CubeView scene lights (world space). */
const STUDIO_KEY = new THREE.Vector3(4, 7, 5).normalize();
const STUDIO_SPEC = new THREE.Vector3(0, 3, 4).normalize();
const STUDIO_FILL = new THREE.Vector3(-3.5, 1.5, 2.5).normalize();

export const CUBE_SHELL_MATERIAL_ROLE = "cubeFrameShell" as const;

export type CubeShellMaterialUniforms = {
  uBaseColor: { value: THREE.Color };
  uLightDirView: { value: THREE.Vector3 };
  uGloss: { value: number };
  uFinish: { value: number };
  uShowcasePulse: { value: number };
};

export function computeStudioKeyLightWorld(): THREE.Vector3 {
  return new THREE.Vector3()
    .addScaledVector(STUDIO_KEY, 0.55)
    .addScaledVector(STUDIO_SPEC, 0.3)
    .addScaledVector(STUDIO_FILL, 0.15)
    .normalize();
}

/** World key light → view space for shell specular (tracks camera + cube pose). */
export function worldLightToViewSpace(
  lightWorld: THREE.Vector3,
  camera: THREE.Camera
): THREE.Vector3 {
  return lightWorld.clone().transformDirection(camera.matrixWorldInverse).normalize();
}

const SHELL_VERTEX = `
varying vec3 vNormalView;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vNormalView = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPos.xyz);
  vUv = uv;
  gl_Position = projectionMatrix * mvPos;
}
`;

const SHELL_FRAGMENT = `
uniform vec3 uBaseColor;
uniform vec3 uLightDirView;
uniform float uGloss;
uniform float uFinish;
uniform float uShowcasePulse;

varying vec3 vNormalView;
varying vec3 vViewDir;
varying vec2 vUv;

vec3 woodShellGrain(vec2 uv, vec3 base) {
  float grain = 0.5 + 0.5 * sin(uv.x * 38.0 + uv.y * 9.0);
  grain *= 0.5 + 0.5 * sin(uv.y * 28.0);
  vec3 dark = base * 0.62;
  vec3 light = base * (1.05 + grain * 0.14);
  return mix(dark, light, grain * 0.72);
}

void main() {
  vec3 base = uBaseColor;
  if (uFinish >= 1.5) {
    gl_FragColor = vec4(base, 1.0);
    return;
  }

  vec3 N = normalize(vNormalView);
  vec3 L = normalize(uLightDirView);
  vec3 V = normalize(vViewDir);
  vec3 H = normalize(L + V);

  float diff = max(dot(N, L), 0.0);
  float pulse = 1.0 + uShowcasePulse * 0.18;

  if (uFinish > 0.5) {
    vec3 col = woodShellGrain(vUv, base) * (0.42 + diff * 0.58);
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  float specTight = pow(max(dot(N, H), 0.0), 48.0);
  float specBroad = pow(max(dot(N, H), 0.0), 14.0);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  float rim = pow(1.0 - max(dot(N, L), 0.0), 2.5);

  vec3 col = base * (0.28 + diff * 0.72);
  col += vec3(1.0) * specTight * uGloss * 0.55 * pulse;
  col += vec3(1.0) * specBroad * uGloss * 0.22 * pulse;
  col += mix(base, vec3(1.0), 0.35) * fresnel * uGloss * 0.2 * pulse;
  col += base * rim * uGloss * 0.08;

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createCubeFrameShellMaterial(
  color: number,
  finishId: CubeFrameFinishId = "glossy"
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uBaseColor: { value: new THREE.Color(color) },
      uLightDirView: { value: new THREE.Vector3(0, 0, 1) },
      uGloss: { value: faceGlossStrength(finishId) },
      uFinish: { value: frameFinishUniformValue(finishId) },
      uShowcasePulse: { value: 0 },
    },
    vertexShader: SHELL_VERTEX,
    fragmentShader: SHELL_FRAGMENT,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  material.userData.mboxRole = CUBE_SHELL_MATERIAL_ROLE;
  return material;
}

export function isCubeFrameShellMaterial(material: THREE.Material): material is THREE.ShaderMaterial {
  return material.userData?.mboxRole === CUBE_SHELL_MATERIAL_ROLE;
}

export function updateCubeFrameShellLighting(
  material: THREE.ShaderMaterial,
  camera: THREE.Camera,
  showcasePulse: number,
  finishId: CubeFrameFinishId
): void {
  if (!isCubeFrameShellMaterial(material)) {
    return;
  }
  const uniforms = material.uniforms as CubeShellMaterialUniforms;
  uniforms.uLightDirView.value.copy(
    worldLightToViewSpace(computeStudioKeyLightWorld(), camera)
  );
  uniforms.uGloss.value = faceGlossStrength(finishId);
  uniforms.uFinish.value = frameFinishUniformValue(finishId);
  uniforms.uShowcasePulse.value = Math.min(1, Math.max(0, showcasePulse));
}

export function applyCubeFrameShellFinishProps(
  material: THREE.ShaderMaterial,
  finishId: CubeFrameFinishId
): void {
  if (!isCubeFrameShellMaterial(material)) {
    return;
  }
  const uniforms = material.uniforms as CubeShellMaterialUniforms;
  uniforms.uGloss.value = faceGlossStrength(finishId);
  uniforms.uFinish.value = frameFinishUniformValue(finishId);
}
