import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import {
  darkenNonBloomedObject,
  restoreBloomedObjectMaterial,
} from "./selectiveBloomLayers";
import { HOLOGRAM_EDGE_BLOOM } from "./hologramEffectQuality";

const mixVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const mixFragmentShader = `
uniform sampler2D baseTexture;
uniform sampler2D bloomTexture;
uniform float bloomStrength;
varying vec2 vUv;
void main() {
  vec4 base = texture2D(baseTexture, vUv);
  vec4 bloom = texture2D(bloomTexture, vUv);
  vec3 glow = bloom.rgb * bloomStrength;
  gl_FragColor = vec4(base.rgb + glow, max(base.a, bloom.a * bloomStrength * 0.35));
}
`;

export interface SelectiveBloomPipeline {
  bloomComposer: EffectComposer;
  finalComposer: EffectComposer;
  bloomPass: UnrealBloomPass;
  resize: (width: number, height: number) => void;
  render: (scene: THREE.Scene, camera: THREE.Camera) => void;
  dispose: () => void;
}

export function createSelectiveBloomPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera
): SelectiveBloomPipeline {
  const width = Math.max(1, renderer.domElement.width);
  const height = Math.max(1, renderer.domElement.height);

  const darkMeshMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  darkMeshMaterial.toneMapped = false;
  const darkLineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
  darkLineMaterial.toneMapped = false;
  const materialCache = new Map<string, THREE.Material | THREE.Material[]>();

  const bloomRenderPass = new RenderPass(scene, camera);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    HOLOGRAM_EDGE_BLOOM.strength,
    HOLOGRAM_EDGE_BLOOM.radius,
    HOLOGRAM_EDGE_BLOOM.threshold
  );
  bloomPass.threshold = HOLOGRAM_EDGE_BLOOM.threshold;
  bloomPass.strength = HOLOGRAM_EDGE_BLOOM.strength;
  bloomPass.radius = HOLOGRAM_EDGE_BLOOM.radius;

  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(bloomRenderPass);
  bloomComposer.addPass(bloomPass);

  const finalRenderPass = new RenderPass(scene, camera);

  const mixPass = new ShaderPass(
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL1,
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.readBuffer.texture },
        bloomStrength: { value: bloomPass.strength },
      },
      vertexShader: mixVertexShader,
      fragmentShader: mixFragmentShader,
      defines: {},
    }),
    "baseTexture"
  );
  mixPass.needsSwap = true;

  const finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(finalRenderPass);
  finalComposer.addPass(mixPass);

  const resize = (w: number, h: number) => {
    const rw = Math.max(1, Math.floor(w));
    const rh = Math.max(1, Math.floor(h));
    bloomComposer.setSize(rw, rh);
    finalComposer.setSize(rw, rh);
    bloomPass.setSize(rw, rh);
    bloomPass.resolution.set(rw, rh);
    mixPass.material.uniforms.bloomTexture.value = bloomComposer.readBuffer.texture;
  };

  const render = (renderScene: THREE.Scene, renderCamera: THREE.Camera) => {
    bloomRenderPass.scene = renderScene;
    bloomRenderPass.camera = renderCamera;
    finalRenderPass.scene = renderScene;
    finalRenderPass.camera = renderCamera;

    renderScene.traverse((object) =>
      darkenNonBloomedObject(object, darkMeshMaterial, darkLineMaterial, materialCache)
    );
    bloomComposer.render();
    renderScene.traverse((object) => restoreBloomedObjectMaterial(object, materialCache));

    mixPass.material.uniforms.bloomTexture.value = bloomComposer.readBuffer.texture;
    mixPass.material.uniforms.bloomStrength.value = bloomPass.strength;
    finalComposer.render();
  };

  const dispose = () => {
    bloomComposer.dispose();
    finalComposer.dispose();
    darkMeshMaterial.dispose();
    darkLineMaterial.dispose();
    mixPass.dispose();
  };

  return { bloomComposer, finalComposer, bloomPass, resize, render, dispose };
}
