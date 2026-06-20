import * as THREE from "three";
import {
  createCrystalShowcaseMaterial,
  type CrystalShowcaseMaterial,
  setCrystalShowcaseAlpha,
  setCrystalShowcaseFx,
  updateCrystalShowcaseMaterial,
} from "../materials/crystalShowcaseMaterial";

export interface PhotoCardMesh {
  group: THREE.Group;
  mesh: THREE.Mesh;
  material: CrystalShowcaseMaterial;
}

export function createPhotoCardMesh(texture: THREE.Texture): PhotoCardMesh {
  const geometry = new THREE.PlaneGeometry(2.35, 2.35);
  const material = createCrystalShowcaseMaterial(texture);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;

  const group = new THREE.Group();
  group.add(mesh);

  return { group, mesh, material };
}

export function applyPhotoCardTexture(card: PhotoCardMesh, texture: THREE.Texture): void {
  updateCrystalShowcaseMaterial(card.material, texture, card.material.uniforms.uBorderPulse.value, card.material.uniforms.uFocusPulse.value, card.material.uniforms.uTime.value);
}

export function applyPhotoCardFx(
  card: PhotoCardMesh,
  borderPulse: number,
  focusPulse: number,
  timeSec: number
): void {
  setCrystalShowcaseFx(card.material, borderPulse, focusPulse, timeSec);
}

export function applyPhotoCardAlpha(card: PhotoCardMesh, alpha: number): void {
  setCrystalShowcaseAlpha(card.material, alpha);
}

export function disposePhotoCardMesh(card: PhotoCardMesh): void {
  card.mesh.geometry.dispose();
  card.material.dispose();
}
