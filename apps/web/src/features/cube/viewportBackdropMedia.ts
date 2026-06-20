import * as THREE from "three";
import { resolveBackgroundAssetPublicUrl } from "../../shared/lib/backgroundAssetCatalog";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;

export function isBackgroundVideoPath(assetPath: string | null | undefined): boolean {
  if (!assetPath) return false;
  return VIDEO_EXT.test(assetPath.trim());
}

export type ViewportBackdropMedia = {
  texture: THREE.Texture;
  video: HTMLVideoElement | null;
};

export function loadViewportBackdropMedia(
  assetPath: string,
  onReady: (media: ViewportBackdropMedia) => void,
  onError: () => void
): () => void {
  const url = resolveBackgroundAssetPublicUrl(assetPath);

  if (isBackgroundVideoPath(assetPath)) {
    const video = document.createElement("video");
    video.src = url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";

    let settled = false;
    const finish = (texture: THREE.VideoTexture) => {
      if (settled) return;
      settled = true;
      texture.colorSpace = THREE.SRGBColorSpace;
      onReady({ texture, video });
      void video.play().catch(() => {
        /* autoplay may be blocked until user gesture */
      });
    };

    const onLoaded = () => {
      finish(new THREE.VideoTexture(video));
    };
    const onFail = () => {
      if (settled) return;
      settled = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
      onError();
    };

    video.addEventListener("loadeddata", onLoaded, { once: true });
    video.addEventListener("error", onFail, { once: true });
    video.load();

    return () => {
      settled = true;
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onFail);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }

  const loader = new THREE.TextureLoader();
  let cancelled = false;
  loader.load(
    url,
    (texture) => {
      if (cancelled) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      onReady({ texture, video: null });
    },
    undefined,
    () => {
      if (!cancelled) onError();
    }
  );

  return () => {
    cancelled = true;
  };
}

export function disposeViewportBackdropMedia(media: ViewportBackdropMedia | null): void {
  if (!media) return;
  media.texture.dispose();
  if (media.video) {
    media.video.pause();
    media.video.removeAttribute("src");
    media.video.load();
  }
}
