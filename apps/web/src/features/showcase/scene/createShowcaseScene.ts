import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { JewelCinematicSample } from "../timeline/jewelCinematicTimeline";
import {
  applyJewelCubeAlpha,
  applyJewelCubeFx,
  applyJewelCubeTexture,
  createJewelCubeMesh,
  disposeJewelCubeMesh,
  type JewelCubeMesh,
} from "./photoCubeMesh";

export interface ShowcaseScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cube: JewelCubeMesh;
  applyMotion: (sample: JewelCinematicSample, timeSec: number) => void;
  setTexture: (texture: THREE.Texture) => void;
  dispose: () => void;
}

export function createShowcaseScene(textures: THREE.Texture[]): ShowcaseScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f7fb);
  scene.fog = new THREE.FogExp2(0xf0f3f8, 0.028);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 120);
  camera.position.set(0, 0.2, 6.2);

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(2.8, 5.5, 4.2);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xc8e8ff, 0.75);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  const sparkle = new THREE.PointLight(0xffffff, 0.9, 18);
  sparkle.position.set(0, 1.2, 3.8);
  scene.add(sparkle);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(8, 48),
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.05,
      roughness: 0.92,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.05;
  scene.add(floor);

  const fallback =
    textures[0] ?? new THREE.DataTexture(new Uint8Array([40, 50, 70, 255]), 1, 1);
  if (!textures[0]) {
    fallback.needsUpdate = true;
  }

  const cube = createJewelCubeMesh(fallback);
  applyJewelCubeAlpha(cube, 1);
  scene.add(cube.group);

  return {
    scene,
    camera,
    cube,
    applyMotion(sample, timeSec) {
      cube.group.rotation.copy(sample.rotation);
      cube.group.position.copy(sample.position);
      cube.group.scale.setScalar(sample.presentationScale);
      applyJewelCubeFx(
        cube,
        sample.borderPulse,
        sample.focusPulse,
        sample.gemPulse,
        timeSec
      );

      camera.position.z = sample.cameraZ;
      camera.position.x = sample.cameraOffsetX;
      camera.position.y = sample.cameraOffsetY + 0.15;
      camera.fov = sample.fieldOfView;
      camera.lookAt(0, sample.position.y * 0.35, 0);
      camera.updateProjectionMatrix();

      sparkle.intensity = 0.85 + sample.gemPulse * 0.65;
    },
    setTexture(texture) {
      applyJewelCubeTexture(cube, texture);
    },
    dispose() {
      disposeJewelCubeMesh(cube);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      const env = scene.userData.showcaseEnvMap as THREE.Texture | undefined;
      env?.dispose();
      scene.environment = null;
    },
  };
}

/** Call once after renderer exists to give the glass shell realistic reflections. */
export function applyShowcaseEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  cube: JewelCubeMesh
): void {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.userData.showcaseEnvMap = env;
  cube.shellMaterial.envMap = env;
  cube.shellMaterial.needsUpdate = true;
  pmrem.dispose();
}
