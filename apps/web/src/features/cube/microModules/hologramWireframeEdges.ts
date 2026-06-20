import * as THREE from "three";
import { HOLOGRAM_WIREFRAME } from "./hologramEffectQuality";

export interface HologramWireframeRig {
  group: THREE.Group;
  disposables: Array<THREE.BufferGeometry | THREE.Material>;
}

/** Dual-layer additive wireframe — core + scaled halo, both bloom-eligible. */
export function createHologramWireframeRig(
  frameGeometry: THREE.BufferGeometry
): HologramWireframeRig {
  const disposables: Array<THREE.BufferGeometry | THREE.Material> = [];
  const group = new THREE.Group();

  const edgesGeo = new THREE.EdgesGeometry(frameGeometry, HOLOGRAM_WIREFRAME.edgeThreshold);

  const haloMat = new THREE.LineBasicMaterial({
    color: HOLOGRAM_WIREFRAME.haloColor,
    transparent: true,
    opacity: HOLOGRAM_WIREFRAME.haloOpacity,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const haloGroup = new THREE.Group();
  haloGroup.scale.setScalar(HOLOGRAM_WIREFRAME.haloScale);
  const haloLines = new THREE.LineSegments(edgesGeo, haloMat);
  haloLines.userData.selectiveBloomTarget = true;
  haloLines.renderOrder = 3;
  haloGroup.add(haloLines);

  const coreMat = new THREE.LineBasicMaterial({
    color: HOLOGRAM_WIREFRAME.coreColor,
    transparent: true,
    opacity: HOLOGRAM_WIREFRAME.coreOpacity,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreLines = new THREE.LineSegments(edgesGeo, coreMat);
  coreLines.userData.selectiveBloomTarget = true;
  coreLines.renderOrder = 4;

  group.add(haloGroup, coreLines);
  disposables.push(edgesGeo, haloMat, coreMat);

  return { group, disposables };
}
