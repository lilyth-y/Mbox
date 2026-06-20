import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Scene } from "@babylonjs/core/scene";

export interface PhotoCubeOptions {
  size?: number;
  restitution?: number;
  spawnHeight?: number;
  spawnX?: number;
  spawnZ?: number;
}

export function createPhotoCube(
  scene: Scene,
  imageUrl: string,
  options: PhotoCubeOptions = {}
): Mesh {
  const size = options.size ?? 1.1;
  const restitution = options.restitution ?? 0.62;
  const spawnHeight = options.spawnHeight ?? 6;
  const spawnX = options.spawnX ?? (Math.random() - 0.5) * 2.5;
  const spawnZ = options.spawnZ ?? (Math.random() - 0.5) * 2.5;

  const cube = MeshBuilder.CreateBox(`photo-cube-${Date.now()}`, { size }, scene);
  cube.position = new Vector3(spawnX, spawnHeight, spawnZ);

  const material = new StandardMaterial(`photo-mat-${cube.name}`, scene);
  material.diffuseTexture = new Texture(imageUrl, scene, false, true);
  material.specularColor = new Color3(0.25, 0.25, 0.25);
  material.emissiveColor = new Color3(0.04, 0.04, 0.06);
  cube.material = material;

  new PhysicsAggregate(cube, PhysicsShapeType.BOX, { mass: 1.2, restitution, friction: 0.35 }, scene);

  return cube;
}
