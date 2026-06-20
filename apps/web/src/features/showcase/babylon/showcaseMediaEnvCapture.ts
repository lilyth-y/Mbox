import { EquiRectangularCubeTexture } from "@babylonjs/core/Materials/Textures/equiRectangularCubeTexture";
import type { Scene } from "@babylonjs/core/scene";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";



const MEDIA_ENV_SIZE = 512;

export type ShowcaseMediaEnvTextures = {
  setColorEnvFromUrl: (url: string, syncMedia?: boolean) => void;
  getColorEnv: () => BaseTexture | null;
  getMediaEnv: () => BaseTexture | null;
  dispose: () => void;
};

function createEquiEnv(
  scene: Scene,
  url: string
): EquiRectangularCubeTexture {
  return new EquiRectangularCubeTexture(url, scene, MEDIA_ENV_SIZE, false, true);
}

export function createShowcaseMediaEnvTextures(scene: Scene): ShowcaseMediaEnvTextures {
  let colorTex: EquiRectangularCubeTexture | null = null;
  let mediaTex: EquiRectangularCubeTexture | null = null;

  const setColorEnvFromUrl = (url: string, syncMedia = false) => {
    if (!url) {
      return;
    }
    if (!colorTex) {
      colorTex = createEquiEnv(scene, url);
      scene.environmentTexture = colorTex;
    }
    if (syncMedia) {
      if (mediaTex && mediaTex !== colorTex) {
        mediaTex.dispose();
      }
      mediaTex = colorTex;
      return;
    }
    if (!mediaTex) {
      mediaTex = createEquiEnv(scene, url);
    }
  };

  return {
    setColorEnvFromUrl,
    getColorEnv: () => colorTex,
    getMediaEnv: () => mediaTex ?? colorTex,
    dispose: () => {
      if (mediaTex && mediaTex !== colorTex) {
        mediaTex.dispose();
      }
      colorTex?.dispose();
      colorTex = null;
      mediaTex = null;
    },
  };
}

