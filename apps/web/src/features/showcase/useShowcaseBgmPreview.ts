import { useEffect, useRef } from "react";

type ShowcaseBgmPreviewOptions = {
  enabled: boolean;
  url: string | null;
  volume: number;
  playing: boolean;
  muted: boolean;
};

/** Loop BGM during showcase preview — export/recording pauses it. */
export function useShowcaseBgmPreview(options: ShowcaseBgmPreviewOptions): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const srcRef = useRef<string | null>(null);

  useEffect(() => {
    const shouldPlay = options.enabled && Boolean(options.url) && options.playing && !options.muted;

    if (!shouldPlay || !options.url) {
      audioRef.current?.pause();
      return;
    }

    let audio = audioRef.current;
    if (!audio || srcRef.current !== options.url) {
      audio?.pause();
      audio = new Audio(options.url);
      audio.loop = true;
      audio.preload = "auto";
      audioRef.current = audio;
      srcRef.current = options.url;
    }

    audio.volume = Math.max(0, Math.min(1, options.volume));
    void audio.play().catch(() => undefined);

    return () => {
      audio?.pause();
    };
  }, [options.enabled, options.url, options.volume, options.playing, options.muted]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
      srcRef.current = null;
    },
    []
  );
}
