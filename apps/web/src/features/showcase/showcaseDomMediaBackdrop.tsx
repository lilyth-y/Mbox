import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isBackgroundVideoPath,
  resolveBackgroundAssetPublicUrl,
} from "../../shared/lib/backgroundAssetCatalog";

type ShowcaseDomMediaBackdropProps = {
  mediaPath: string | null;
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

/** User video/image as-is behind the canvas (object-fit: cover, z-index back). */
export function ShowcaseDomMediaBackdrop({
  mediaPath,
  opacity,
  onReady,
}: ShowcaseDomMediaBackdropProps) {
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const boundSrcRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isVideo = mediaPath ? isBackgroundVideoPath(mediaPath) : false;
  const src = useMemo(() => (mediaPath ? resolveMediaUrl(mediaPath) : null), [mediaPath]);

  const bindReady = useCallback((element: HTMLVideoElement | HTMLImageElement | null) => {
    onReadyRef.current(element);
  }, []);

  useEffect(() => {
    setLoadError(null);
    boundSrcRef.current = null;
    if (!mediaPath || !src) {
      bindReady(null);
    }
  }, [bindReady, mediaPath, src]);

  const setVideoNode = useCallback(
    (node: HTMLVideoElement | null) => {
      if (node && mediaPath && src && isVideo) {
        bindReady(node);
      }
    },
    [bindReady, isVideo, mediaPath, src]
  );

  const setImageNode = useCallback(
    (node: HTMLImageElement | null) => {
      if (node && mediaPath && src && !isVideo) {
        bindReady(node);
      }
    },
    [bindReady, isVideo, mediaPath, src]
  );

  const notifyReady = useCallback(
    (element: HTMLVideoElement | HTMLImageElement) => {
      if (!src || boundSrcRef.current === src) {
        return;
      }
      boundSrcRef.current = src;
      setLoadError(null);
      onReadyRef.current(element);
    },
    [src]
  );

  const handleVideoReady = useCallback(
    (video: HTMLVideoElement) => {
      notifyReady(video);
      void video.play().catch(() => undefined);
    },
    [notifyReady]
  );

  if (!mediaPath || !src) {
    return null;
  }

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
          crossOrigin="anonymous"
          preload="auto"
          style={{ opacity: loadError ? 0 : opacity }}
          aria-hidden
          onLoadedData={(event) => handleVideoReady(event.currentTarget)}
          onError={() => {
            boundSrcRef.current = null;
            bindReady(null);
            setLoadError(
              "배경 영상을 불러올 수 없습니다. data/background/luxury 경로(E: 드라이브)를 확인하세요."
            );
          }}
        />
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
        crossOrigin="anonymous"
        style={{ opacity: loadError ? 0 : opacity }}
        aria-hidden
        onLoad={(event) => {
          notifyReady(event.currentTarget);
        }}
        onError={() => {
          boundSrcRef.current = null;
          bindReady(null);
          setLoadError("배경 이미지를 불러올 수 없습니다.");
        }}
      />
      {loadError ? (
        <div className="showcase-dom-backdrop-error" aria-live="polite">
          {loadError}
        </div>
      ) : null}
    </>
  );
}
