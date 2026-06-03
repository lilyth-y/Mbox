import * as THREE from "three";

export interface Cs5FxOptions {
  boxLogo: boolean;
  flare: boolean;
  clouds: boolean;
  dirt: boolean;
  dust: boolean;
  confetti: boolean;
  confettiVariant: number;
}

export const DEFAULT_CS5_FX_OPTIONS: Cs5FxOptions = {
  boxLogo: false,
  flare: false,
  clouds: false,
  dirt: false,
  dust: false,
  confetti: false,
  confettiVariant: 1,
};

export interface Cs5FxRig {
  group: THREE.Group;
  setOptions: (options: Cs5FxOptions) => void;
  update: (deltaMs: number) => void;
  dispose: () => void;
}

function clampConfettiVariant(v: number): number {
  return Math.min(5, Math.max(1, Math.floor(v) || 1));
}

function createSpriteLayer(
  loader: THREE.TextureLoader,
  url: string,
  opts: {
    scale: number;
    opacity: number;
    z: number;
    blending?: THREE.Blending;
    position?: THREE.Vector3;
  }
): { sprite: THREE.Sprite; texture: THREE.Texture; material: THREE.SpriteMaterial } {
  const texture = loader.load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: opts.opacity,
    depthWrite: false,
    blending: opts.blending ?? THREE.NormalBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(opts.scale, opts.scale, opts.scale);
  sprite.position.copy(opts.position ?? new THREE.Vector3(0, 0, opts.z));
  sprite.visible = false;
  return { sprite, texture, material };
}

export function createCs5FxRig(): Cs5FxRig {
  const group = new THREE.Group();
  group.renderOrder = 10;

  const loader = new THREE.TextureLoader();
  const disposables: Array<THREE.Texture | THREE.Material> = [];

  const lens = createSpriteLayer(loader, "/cs5/box-logo/Lens_bg.png", {
    scale: 3.2,
    opacity: 0.16,
    z: 1.25,
    blending: THREE.AdditiveBlending,
  });
  const bars = createSpriteLayer(loader, "/cs5/box-logo/black_bars.png", {
    scale: 3.25,
    opacity: 0.22,
    z: 1.26,
  });
  group.add(lens.sprite, bars.sprite);
  disposables.push(lens.texture, bars.texture, lens.material, bars.material);

  const flareMain = createSpriteLayer(loader, "/cs5/volumax/flares/FLARE.png", {
    scale: 2.8,
    opacity: 0.22,
    z: 1.28,
    blending: THREE.AdditiveBlending,
  });
  group.add(flareMain.sprite);
  disposables.push(flareMain.texture, flareMain.material);

  const flareCycle: ReturnType<typeof createSpriteLayer>[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const layer = createSpriteLayer(loader, `/cs5/volumax/flares/FLARE${i}.png`, {
      scale: 2.4,
      opacity: 0,
      z: 1.27,
      blending: THREE.AdditiveBlending,
    });
    flareCycle.push(layer);
    group.add(layer.sprite);
    disposables.push(layer.texture, layer.material);
  }

  const cloudSprites: ReturnType<typeof createSpriteLayer>[] = [];
  const cloudOffsets = [
    { x: -0.55, y: 0.35, s: 2.1 },
    { x: 0.5, y: 0.2, s: 2.4 },
    { x: -0.2, y: -0.45, s: 1.9 },
    { x: 0.65, y: -0.3, s: 2.2 },
  ];
  cloudOffsets.forEach((off, idx) => {
    const n = String(idx + 1).padStart(2, "0");
    const layer = createSpriteLayer(loader, `/cs5/volumax/clouds/Clouds_${n}.png`, {
      scale: off.s,
      opacity: 0.14,
      z: 1.23,
      blending: THREE.AdditiveBlending,
      position: new THREE.Vector3(off.x, off.y, 1.23),
    });
    cloudSprites.push(layer);
    group.add(layer.sprite);
    disposables.push(layer.texture, layer.material);
  });

  const dirt = createSpriteLayer(loader, "/cs5/volumax/dust-dirt/DIRT.png", {
    scale: 3.4,
    opacity: 0.12,
    z: 1.29,
    blending: THREE.AdditiveBlending,
  });
  group.add(dirt.sprite);
  disposables.push(dirt.texture, dirt.material);

  const dustSprites: ReturnType<typeof createSpriteLayer>[] = [];
  [1, 2, 3].forEach((n, idx) => {
    const angle = (idx / 3) * Math.PI * 2;
    const layer = createSpriteLayer(loader, `/cs5/volumax/dust-dirt/Particles${n}.png`, {
      scale: 1.6,
      opacity: 0.18,
      z: 1.24,
      blending: THREE.AdditiveBlending,
      position: new THREE.Vector3(Math.cos(angle) * 0.9, Math.sin(angle) * 0.6, 1.24),
    });
    dustSprites.push(layer);
    group.add(layer.sprite);
    disposables.push(layer.texture, layer.material);
  });

  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  const videoTex = new THREE.VideoTexture(video);
  videoTex.colorSpace = THREE.SRGBColorSpace;
  const confMat = new THREE.SpriteMaterial({
    map: videoTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const conf = new THREE.Sprite(confMat);
  conf.scale.set(3.2, 3.2, 3.2);
  conf.position.set(0, 0, 1.24);
  conf.visible = false;
  group.add(conf);
  disposables.push(videoTex, confMat);

  let options: Cs5FxOptions = { ...DEFAULT_CS5_FX_OPTIONS };
  let t = 0;
  let confettiVariantLoaded = 0;

  const applyConfettiSrc = (variant: number) => {
    const v = clampConfettiVariant(variant);
    if (confettiVariantLoaded === v) return;
    confettiVariantLoaded = v;
    const wasPlaying = !video.paused && options.confetti;
    video.pause();
    video.src = `/cs5/confetti-pack/confetti_${String(v).padStart(2, "0")}.mov`;
    video.load();
    if (wasPlaying) {
      video.play().catch(() => {});
    }
  };

  const applyVisibility = () => {
    const any =
      options.boxLogo ||
      options.flare ||
      options.clouds ||
      options.dirt ||
      options.dust ||
      options.confetti;
    group.visible = any;

    lens.sprite.visible = options.boxLogo;
    bars.sprite.visible = options.boxLogo;
    flareMain.sprite.visible = options.flare;
    flareCycle.forEach((f) => {
      f.sprite.visible = options.flare;
    });
    cloudSprites.forEach((c) => {
      c.sprite.visible = options.clouds;
    });
    dirt.sprite.visible = options.dirt;
    dustSprites.forEach((d) => {
      d.sprite.visible = options.dust;
    });
    conf.visible = options.confetti;

    if (options.confetti) {
      applyConfettiSrc(options.confettiVariant);
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  applyVisibility();

  return {
    group,
    setOptions: (next) => {
      options = { ...next, confettiVariant: clampConfettiVariant(next.confettiVariant) };
      applyVisibility();
    },
    update: (deltaMs) => {
      if (!group.visible) return;
      t += deltaMs;
      const phase = t * 0.001;

      if (options.boxLogo) {
        const s = 3.2 + 0.03 * Math.sin(phase * 0.6);
        lens.sprite.scale.set(s, s, s);
        lens.material.opacity = 0.12 + 0.06 * (0.5 + 0.5 * Math.sin(phase * 1.1));
      }

      if (options.flare) {
        flareMain.material.opacity = 0.14 + 0.08 * (0.5 + 0.5 * Math.sin(phase * 0.9));
        const idx = Math.floor((phase * 0.55) % flareCycle.length);
        flareCycle.forEach((f, i) => {
          f.material.opacity = i === idx ? 0.2 : 0.04;
        });
      }

      if (options.clouds) {
        cloudSprites.forEach((c, i) => {
          c.sprite.position.x += Math.sin(phase * 0.35 + i) * 0.0004 * deltaMs;
          c.material.opacity = 0.1 + 0.06 * (0.5 + 0.5 * Math.sin(phase * 0.7 + i));
        });
      }

      if (options.dirt) {
        dirt.material.opacity = 0.08 + 0.06 * (0.5 + 0.5 * Math.sin(phase * 1.4));
        dirt.sprite.rotation.z = Math.sin(phase * 0.2) * 0.02;
      }

      if (options.dust) {
        dustSprites.forEach((d, i) => {
          const a = phase * 0.8 + (i / dustSprites.length) * Math.PI * 2;
          d.sprite.position.x = Math.cos(a) * 0.9;
          d.sprite.position.y = Math.sin(a) * 0.6;
          d.material.opacity = 0.12 + 0.08 * (0.5 + 0.5 * Math.sin(phase * 1.6 + i));
        });
      }

      if (options.confetti && !video.paused) {
        videoTex.needsUpdate = true;
      }
    },
    dispose: () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      disposables.forEach((d) => d.dispose());
    },
  };
}

/** Map CubeFocusSettings toggles → cs5 rig options (hologram gate applied by caller). */
export function cs5FxOptionsFromSettings(settings: {
  cs5BoxLogoEnabled: boolean;
  cs5FlareEnabled: boolean;
  cs5CloudsEnabled: boolean;
  cs5DirtEnabled: boolean;
  cs5DustEnabled: boolean;
  cs5ConfettiEnabled: boolean;
  cs5ConfettiVariant: number;
}): Cs5FxOptions {
  return {
    boxLogo: settings.cs5BoxLogoEnabled,
    flare: settings.cs5FlareEnabled,
    clouds: settings.cs5CloudsEnabled,
    dirt: settings.cs5DirtEnabled,
    dust: settings.cs5DustEnabled,
    confetti: settings.cs5ConfettiEnabled,
    confettiVariant: settings.cs5ConfettiVariant,
  };
}
