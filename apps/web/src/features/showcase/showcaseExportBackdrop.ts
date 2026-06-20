import {
  isBackgroundVideoPath,
  resolveBackgroundAssetPublicUrl,
} from "../../shared/lib/backgroundAssetCatalog";

function resolveMediaUrl(mediaPath: string): string {
  const trimmed = mediaPath.trim();
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }
  return resolveBackgroundAssetPublicUrl(trimmed);
}

/** Blob URL avoids canvas taint when painting video into 2D composite. */
async function toSameOriginMediaUrl(url: string): Promise<{ url: string; revoke?: () => void }> {
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    return { url };
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { url };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      return { url };
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    return { url: blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) };
  } catch {
    return { url };
  }
}

function previewElementIsReady(
  element: HTMLVideoElement | HTMLImageElement | null | undefined
): boolean {
  if (!element) {
    return false;
  }
  if (element instanceof HTMLVideoElement) {
    return element.videoWidth > 0 && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  }
  return element.naturalWidth > 0;
}

async function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 8_000): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      if (video.videoWidth > 0) {
        resolve();
      } else {
        reject(new Error("[showcase] export backdrop video has no dimensions"));
      }
    }, timeoutMs);

    const onReady = () => {
      if (video.videoWidth > 0) {
        cleanup();
        resolve();
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error("[showcase] export backdrop video failed to load"));
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadeddata", onReady);
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("error", onError, { once: true });
  });
}

async function waitForImageReady(image: HTMLImageElement, timeoutMs = 8_000): Promise<void> {
  if (image.naturalWidth > 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      if (image.naturalWidth > 0) {
        resolve();
      } else {
        reject(new Error("[showcase] export backdrop image has no dimensions"));
      }
    }, timeoutMs);

    const onLoad = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("[showcase] export backdrop image failed to load"));
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
    };

    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
  });
}

export type ShowcaseExportBackdropHandle = {
  source: HTMLVideoElement | HTMLImageElement;
  dispose: () => void;
};

export function isShowcaseExportPreviewBackdropReady(
  element: HTMLVideoElement | HTMLImageElement | null | undefined
): element is HTMLVideoElement | HTMLImageElement {
  return previewElementIsReady(element);
}

/** Prefer React ref; fall back to the live DOM preview element. */
export function resolveLiveShowcaseDomBackdrop(
  preferred?: HTMLVideoElement | HTMLImageElement | null
): HTMLVideoElement | HTMLImageElement | null {
  if (previewElementIsReady(preferred)) {
    return preferred ?? null;
  }
  const dom = document.querySelector(
    ".showcase-viewport-wrap [data-showcase-backdrop='primary'], .showcase-viewport-wrap video.showcase-dom-backdrop, .showcase-viewport-wrap img.showcase-dom-backdrop"
  );
  if (dom instanceof HTMLVideoElement && previewElementIsReady(dom)) {
    return dom;
  }
  if (dom instanceof HTMLImageElement && previewElementIsReady(dom)) {
    return dom;
  }
  if (preferred instanceof HTMLVideoElement || preferred instanceof HTMLImageElement) {
    return preferred;
  }
  return dom instanceof HTMLVideoElement || dom instanceof HTMLImageElement ? dom : null;
}

export async function waitForLiveShowcaseDomBackdrop(
  timeoutMs = 8_000
): Promise<HTMLVideoElement | HTMLImageElement | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const resolved = resolveLiveShowcaseDomBackdrop(null);
    if (resolved && previewElementIsReady(resolved)) {
      return resolved;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 200));
  }
  return resolveLiveShowcaseDomBackdrop(null);
}

/** Preview-only export backdrop — never clone when the live DOM element is ready. */
export async function resolveShowcasePreviewExportBackdrop(
  mediaPath: string | null,
  preferred?: HTMLVideoElement | HTMLImageElement | null
): Promise<ShowcaseExportBackdropHandle | null> {
  if (!mediaPath) {
    return null;
  }

  let live = resolveLiveShowcaseDomBackdrop(preferred ?? null);
  if (!isShowcaseExportPreviewBackdropReady(live)) {
    live = await waitForLiveShowcaseDomBackdrop(8_000);
  }

  if (isShowcaseExportPreviewBackdropReady(live)) {
    return {
      source: live,
      dispose: () => undefined,
    };
  }

  return null;
}

export async function createShowcaseExportBackdrop(
  mediaPath: string,
  previewElement?: HTMLVideoElement | HTMLImageElement | null
): Promise<ShowcaseExportBackdropHandle> {
  if (previewElement && previewElementIsReady(previewElement)) {
    return {
      source: previewElement,
      dispose: () => undefined,
    };
  }

  const rawUrl = (() => {
    if (previewElement instanceof HTMLVideoElement) {
      return previewElement.currentSrc || previewElement.src || resolveMediaUrl(mediaPath);
    }
    if (previewElement instanceof HTMLImageElement) {
      return previewElement.src || resolveMediaUrl(mediaPath);
    }
    return resolveMediaUrl(mediaPath);
  })();

  const isVideo = isBackgroundVideoPath(mediaPath);
  const { url, revoke } = await toSameOriginMediaUrl(rawUrl);

  if (isVideo) {
    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.src = url;
    video.load();

    await waitForVideoReady(video);
    if (
      previewElement instanceof HTMLVideoElement &&
      previewElement.currentTime > 0
    ) {
      try {
        video.currentTime = previewElement.currentTime;
      } catch {
        /* seek may fail before enough data */
      }
    }
    await video.play().catch(() => undefined);
    await waitForVideoReady(video);

    return {
      source: video,
      dispose: () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
        revoke?.();
      },
    };
  }

  const image = document.createElement("img");
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.src = url;
  await waitForImageReady(image);

  return {
    source: image,
    dispose: () => {
      image.removeAttribute("src");
      revoke?.();
    },
  };
}

export async function warmShowcaseExportBackdrop(
  handle: ShowcaseExportBackdropHandle | null
): Promise<void> {
  if (!handle) {
    return;
  }
  const { source } = handle;
  if (source instanceof HTMLVideoElement) {
    await waitForVideoReady(source);
    if (source.paused) {
      await source.play().catch(() => undefined);
    }
  } else {
    await waitForImageReady(source);
  }
}

/** Align export backdrop videos to the live preview timeline. */
export async function syncExportBackdropTimeline(
  sources: Array<HTMLVideoElement | HTMLImageElement | null | undefined>
): Promise<void> {
  const videos = sources.filter(
    (source): source is HTMLVideoElement =>
      source instanceof HTMLVideoElement && source.videoWidth > 0
  );
  if (videos.length === 0) {
    return;
  }
  const master = videos[0];
  const targetTime = master.currentTime;
  await Promise.all(
    videos.map(async (video) => {
      if (video === master) {
        return;
      }
      try {
        video.currentTime = targetTime;
      } catch {
        /* seek may fail before enough data */
      }
    })
  );
  await waitForVideoReady(master);
}
