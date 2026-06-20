import * as THREE from "three";
import {
  GALAXY_BACKGROUND_FRAGMENT,
  GALAXY_BACKGROUND_VERTEX,
} from "./shaders/galaxyBackgroundShader";
import type {
  PresentationMicroModuleContext,
  PresentationMicroModuleRuntime,
} from "./types";

export interface GalaxyBackgroundHandle {
  mesh: THREE.Mesh;
  update: (deltaMs: number) => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

const MODULE_ID = "galaxy_background";

function createGalaxyMesh(): GalaxyBackgroundHandle {
  const geometry = new THREE.SphereGeometry(42, 48, 32);
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL1,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
    },
    vertexShader: GALAXY_BACKGROUND_VERTEX,
    fragmentShader: GALAXY_BACKGROUND_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -20;
  mesh.frustumCulled = false;
  mesh.visible = false;

  let elapsed = 0;

  return {
    mesh,
    update(deltaMs: number) {
      elapsed += deltaMs * 0.001;
      material.uniforms.uTime.value = elapsed;
    },
    setEnabled(enabled: boolean) {
      mesh.visible = enabled;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export class GalaxyBackgroundMicroModule implements PresentationMicroModuleRuntime {
  readonly id = MODULE_ID;
  private handle: GalaxyBackgroundHandle | null = null;
  private scene: THREE.Scene | null = null;

  mount(ctx: PresentationMicroModuleContext): void {
    this.dispose();
    this.scene = ctx.scene;
    this.handle = createGalaxyMesh();
    ctx.scene.add(this.handle.mesh);
    this.applySettings(ctx);
  }

  applySettings(ctx: PresentationMicroModuleContext): void {
    const enabled = ctx.modules.galaxyBackground;
    if (enabled) {
      ctx.scene.background = null;
    }
    this.handle?.setEnabled(enabled);
  }

  update(deltaMs: number): void {
    this.handle?.update(deltaMs);
  }

  dispose(): void {
    if (this.handle && this.scene) {
      this.scene.remove(this.handle.mesh);
    }
    this.handle?.dispose();
    this.handle = null;
    this.scene = null;
  }
}
