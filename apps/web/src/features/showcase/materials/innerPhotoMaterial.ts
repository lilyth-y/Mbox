import * as THREE from "three";
import { configurePresentationTexture } from "../babylon/configurePresentationTexture";

/** Photo suspended inside the crystal volume (like laser-etched paperweight). */
export function createInnerPhotoMaterial(texture: THREE.Texture): THREE.MeshBasicMaterial {
  configurePresentationTexture(texture);
  return new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  });
}

export function updateInnerPhotoMaterial(
  material: THREE.MeshBasicMaterial,
  texture: THREE.Texture
): void {
  configurePresentationTexture(texture);
  material.map = texture;
  material.needsUpdate = true;
}
