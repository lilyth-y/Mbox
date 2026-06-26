import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isBackgroundVideoPath,
  resolveBackgroundAssetPublicUrl,
} from "../../shared/lib/backgroundAssetCatalog";

type ShowcaseDomMediaBackdropProps = {
  mediaPath: string | null;
  /** Blob uploads need an explicit flag — URL has no extension. */
  isVideo?: boolean;
  opacity: number;
  onReady: (source: HTMLVideoElement | HTMLImageElement | null) => void;
};

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

function needsCrossOrigin(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

/** object-fit: cover — fill the 1:1 viewport (center crop). */
export function ShowcaseDomMediaBackdrop({
  mediaPath,
  isVideo: isVideoProp,
  opacity,
  onReady,
}: ShowcaseDomMediaBackdropProps) {
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const boundSrcRef = useRef<string | null>(null);
  const videoLoopCleanupRef = useRef<(() => void) | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mediaReady, setMediaReady] = useState(false);

  const isVideo =
    isVideoProp ?? (mediaPath ? isBackgroundVideoPath(mediaPath) : false);
  const src = useMemo(() => (mediaPath ? resolveMediaUrl(mediaPath) : null), [mediaPath]);
  const crossOrigin = src && needsCrossOrigin(src) ? "anonymous" : undefined;

  const bindReady = useCallback((element: HTMLVideoElement | HTMLImageElement | null) => {
    onReadyRef.current(element);
  }, []);

  useEffect(() => {
    setLoadError(null);
    setMediaReady(false);
    boundSrcRef.current = null;
    if (!mediaPath || !src) {
      bindReady(null);
    }
  }, [bindReady, mediaPath, src]);

  const setVideoNode = useCallback(
    (node: HTMLVideoElement | null) => {
      videoLoopCleanupRef.current?.();
      videoLoopCleanupRef.current = null;
      if (!node || !mediaPath || !src || !isVideo) {
        bindReady(null);
        return;
      }
      const onEnded = () => {
        node.currentTime = 0;
        void node.play().catch(() => undefined);
      };
      node.addEventListener("ended", onEnded);
      videoLoopCleanupRef.current = () => node.removeEventListener("ended", onEnded);
    },
    [bindReady, isVideo, mediaPath, src]
  );

  useEffect(
    () => () => {
      videoLoopCleanupRef.current?.();
    },
    []
  );

  const setImageNode = useCallback(
    (node: HTMLImageElement | null) => {
      if (!node || !mediaPath || !src || isVideo) {
        if (!node) {
          bindReady(null);
        }
      }
    },
    [bindReady, isVideo, mediaPath, src]
  );

  const notifyReady = useCallback(
    (element: HTMLVideoElement | HTMLImageElement) => {
      if (!src) {
        return;
      }
      const ready =
        element instanceof HTMLVideoElement
          ? element.videoWidth > 0 &&
            element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          : element.naturalWidth > 0;
      if (!ready) {
        return;
      }
      boundSrcRef.current = src;
      setLoadError(null);
      setMediaReady(true);
      onReadyRef.current(element);
    },
    [src]
  );

  const handleVideoReady = useCallback(
    (video: HTMLVideoElement) => {
      video.loop = true;
      notifyReady(video);
      void video.play().catch(() => undefined);
    },
    [notifyReady]
  );

  if (!mediaPath || !src) {
    return null;
  }

  const visibleOpacity = loadError ? 0 : mediaReady ? opacity : 0;

  if (isVideo) {
    return (
      <>
        <video
          key={src}
          ref={setVideoNode}
          className="showcase-dom-backdrop"
          data-showcase-backdrop="primary"
          src={src}
          autoPlay
          loop
          muted
          playsInline
          crossOrigin={crossOrigin}
          preload="auto"
          style={{ opacity: visibleOpacity }}
          aria-hidden
          onLoadedData={(event) => handleVideoReady(event.currentTarget)}
          onCanPlay={(event) => handleVideoReady(event.currentTarget)}
          onError={() => {
            boundSrcRef.current = null;
            setMediaReady(false);
            bindReady(null);
            setLoadError("배경 영상을 불러올 수 없습니다. 다른 형식(MP4)으로 다시 시도해 보세요.");
          }}
        />
        {!mediaReady && !loadError ? (
          <div className="showcase-dom-backdrop-loading" aria-live="polite">
            배경 영상 로딩 중…
          </div>
        ) : null}
        {loadError ? (
          <div className="showcase-dom-backdrop-error" aria-live="polite">
            {loadError}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <img
        key={src}
        ref={setImageNode}
        className="showcase-dom-backdrop"
        data-showcase-backdrop="primary"
        src={src}
        alt=""
        crossOrigin={crossOrigin}
        style={{ opacity: visibleOpacity }}
        aria-hidden
        onLoad={(event) => {
          notifyReady(event.currentTarget);
        }}
        onError={() => {
          boundSrcRef.current = null;
          setMediaReady(false);
          bindReady(null);
          setLoadError("배경 이미지를 불러올 수 없습니다.");
        }}
      />
      {!mediaReady && !loadError ? (
        <div className="showcase-dom-backdrop-loading" aria-live="polite">
          배경 이미지 로딩 중…
        </div>
      ) : null}
      {loadError ? (
        <div className="showcase-dom-backdrop-error" aria-live="polite">
          {loadError}
        </div>
      ) : null}
    </>
  );
}
