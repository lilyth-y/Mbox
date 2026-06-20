import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { enableHavokPhysics } from "./physicsWorld";
import { createPhotoCube } from "./photoCubeFactory";

export interface PremiumPhysicsSceneHandle {
  dropCube: (imageUrl: string) => void;
  reset: () => void;
  resize: () => void;
  dispose: () => void;
}

export async function createPremiumPhysicsScene(
  canvas: HTMLCanvasElement
): Promise<PremiumPhysicsSceneHandle> {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialias: true,
  });

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.04, 0.09, 1);

  await enableHavokPhysics(scene);

  const camera = new ArcRotateCamera(
    "premiumCam",
    -Math.PI / 2.4,
    1.05,
    14,
    new Vector3(0, 1.2, 0),
    scene
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 22;
  camera.wheelPrecision = 40;

  new HemisphericLight("hemi", new Vector3(0.2, 1, 0.15), scene).intensity = 0.85;
  const key = new DirectionalLight("key", new Vector3(-0.6, -1.2, 0.8), scene);
  key.position = new Vector3(6, 10, 4);
  key.intensity = 1.1;

  const ground = MeshBuilder.CreateGround("ground", { width: 24, height: 24 }, scene);
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new Color3(0.08, 0.1, 0.16);
  groundMat.specularColor = new Color3(0.05, 0.05, 0.08);
  ground.material = groundMat;
  new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, restitution: 0.45, friction: 0.6 }, scene);

  const dynamicCubes: Mesh[] = [];

  const dropCube = (imageUrl: string) => {
    const cube = createPhotoCube(scene, imageUrl, {
      spawnHeight: 5.5 + Math.random() * 1.5,
    });
    dynamicCubes.push(cube);
  };

  const reset = () => {
    for (const cube of dynamicCubes.splice(0)) {
      cube.material?.dispose();
      cube.dispose();
    }
  };

  engine.runRenderLoop(() => {
    scene.render();
  });

  const onResize = () => engine.resize();
  window.addEventListener("resize", onResize);

  return {
    dropCube,
    reset,
    resize: onResize,
    dispose: () => {
      window.removeEventListener("resize", onResize);
      reset();
      scene.dispose();
      engine.dispose();
    },
  };
}
