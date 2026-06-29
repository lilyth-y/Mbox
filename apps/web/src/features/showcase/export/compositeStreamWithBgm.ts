export interface BgmRecordingSession {
  compositeStream: MediaStream;
  stop: () => void;
}

export interface StartBgmRecordingOptions {
  videoStream: MediaStream;
  audioUrl: string;
  durationMs: number;
  volume?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  holdUntilExportDone?: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function startBgmRecordingSession(
  options: StartBgmRecordingOptions
): Promise<BgmRecordingSession> {
  const { videoStream, audioUrl, durationMs } = options;
  const volume = options.volume ?? 0.82;
  const fadeInMs = options.fadeInMs ?? 800;
  const fadeOutMs = options.fadeOutMs ?? 1_200;

  const audioContext = new AudioContext();
  const response = await fetch(audioUrl);
  if (!response.ok) {
    await audioContext.close();
    throw new Error(`BGM 파일을 불러올 수 없습니다 (${response.status}). public/bgm/README.md 를 확인하세요.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = audioBuffer.duration * 1_000 < durationMs + 2_000;

  const gain = audioContext.createGain();
  gain.gain.value = 0;
  source.connect(gain);
  const destination = audioContext.createMediaStreamDestination();
  gain.connect(destination);

  const durationSec = durationMs / 1_000;
  const now = audioContext.currentTime;
  const fadeInSec = fadeInMs / 1_000;
  const fadeOutSec = fadeOutMs / 1_000;
  const fadeOutStart = Math.max(fadeInSec, durationSec - fadeOutSec);
  const holdUntilDone = options.holdUntilExportDone === true;

  if (holdUntilDone) {
    source.loop = true;
  }

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + fadeInSec);

  if (!holdUntilDone) {
    gain.gain.setValueAtTime(volume, now + fadeOutStart);
    gain.gain.linearRampToValueAtTime(0, now + durationSec + 0.15);
  }

  source.start(now);
  if (!holdUntilDone) {
    source.stop(now + durationSec + 0.35);
  }

  await delay(40);

  const audioTracks = destination.stream.getAudioTracks();
  if (audioTracks.length === 0) {
    await audioContext.close();
    throw new Error("BGM 오디오 트랙을 생성하지 못했습니다.");
  }

  const compositeStream = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioTracks,
  ]);

  let stopped = false;
  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    try {
      if (holdUntilDone) {
        const t = audioContext.currentTime;
        gain.gain.linearRampToValueAtTime(0, t + 0.2);
        source.stop(t + 0.35);
      } else {
        source.stop();
      }
    } catch {
      // already stopped
    }
    audioTracks.forEach((track) => track.stop());
    void audioContext.close();
  };

  if (!holdUntilDone) {
    window.setTimeout(stop, durationMs + 500);
  }

  return { compositeStream, stop };
}
