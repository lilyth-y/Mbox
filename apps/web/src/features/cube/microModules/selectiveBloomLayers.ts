import * as THREE from "three";

/** Layer id for selective bloom (Three.js selective bloom example pattern). */
export const BLOOM_SCENE_LAYER = 1;

const bloomLayerMask = new THREE.Layers();
bloomLayerMask.set(BLOOM_SCENE_LAYER);

export interface SyncSelectiveBloomLayersOptions {
  /** selective_bloom module ON + hologram mode */
  active: boolean;
  /** Reserved — face meshes stay OFF bloom (bright photos blow out). */
  rimLayer?: boolean;
}

export function syncSelectiveBloomLayers(
  root: THREE.Object3D,
  options: SyncSelectiveBloomLayersOptions
): void {
  root.traverse((object) => {
    const shouldBloom = options.active && object.userData.selectiveBloomTarget === true;
    if (shouldBloom) {
      object.layers.enable(BLOOM_SCENE_LAYER);
    } else {
      object.layers.disable(BLOOM_SCENE_LAYER);
    }
  });
}

export function isOnBloomLayer(object: THREE.Object3D): boolean {
  return bloomLayerMask.test(object.layers);
}

export function darkenNonBloomedObject(
  object: THREE.Object3D,
  darkMeshMaterial: THREE.MeshBasicMaterial,
  darkLineMaterial: THREE.LineBasicMaterial,
  cache: Map<string, THREE.Material | THREE.Material[]>
): void {
  if (isOnBloomLayer(object)) {
    return;
  }
  const isMeshLike =
    object instanceof THREE.Mesh ||
    object instanceof THREE.LineSegments ||
    object instanceof THREE.Line;
  if (!isMeshLike || !object.material) {
    return;
  }
  cache.set(object.uuid, object.material);
  const meshLike = object as THREE.Mesh | THREE.LineSegments | THREE.Line;
  meshLike.material = object instanceof THREE.Mesh ? darkMeshMaterial : darkLineMaterial;
}

export function restoreBloomedObjectMaterial(
  object: THREE.Object3D,
  cache: Map<string, THREE.Material | THREE.Material[]>
): void {
  const stored = cache.get(object.uuid);
  if (!stored) {
    return;
  }
  const meshLike = object as THREE.Mesh | THREE.LineSegments | THREE.Line;
  meshLike.material = stored;
  cache.delete(object.uuid);
}
