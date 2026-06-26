import * as THREE from "three";

/** WebGL photo sampling defaults for showcase materials. */
export function configurePresentationTexture(
  texture: THREE.Texture,
  maxAnisotropy = 1
): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.unpackAlignment = 1;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.flipY = true;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.max(1, maxAnisotropy);
}
