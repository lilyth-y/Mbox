import * as THREE from "three";
import type { DepthField } from "../types";

export function createDepthTexture(field: DepthField): THREE.DataTexture {
  const size = field.gridSize;
  const data = new Uint8Array(size * size);

  for (let index = 0; index < field.values.length; index += 1) {
    const value = field.values[index] ?? 0.5;
    data[index] = Math.round(Math.min(1, Math.max(0, value)) * 255);
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function createFallbackDepthTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([128]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}
