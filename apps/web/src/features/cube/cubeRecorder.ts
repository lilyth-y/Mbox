/** Extra wall-clock time after the presentation ends so the encoder can flush. */
export const RECORD_ENCODER_FLUSH_MS = 750;

const MP4_VIDEO_ONLY_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1",
  "video/mp4",
] as const;

const MP4_WITH_AUDIO_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
] as const;

const DEFAULT_VIDEO_BITS_PER_SECOND = 8_000_000;

export function resolveMp4MimeType(withAudio = false): string | null {
  const candidates = withAudio ? MP4_WITH_AUDIO_CANDIDATES : MP4_VIDEO_ONLY_CANDIDATES;
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  if (withAudio) {
    return resolveMp4MimeType(false);
  }
  return null;
}

export function resolveRecordingMimeType(options?: {
  withAudio?: boolean;
}): { mimeType: string; extension: "mp4" | "webm" } {
  const withAudio = options?.withAudio ?? false;
  const mp4MimeType = resolveMp4MimeType(withAudio);
  if (mp4MimeType) {
    return { mimeType: mp4MimeType, extension: "mp4" };
  }

  return {
    mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm",
    extension: "webm",
  };
}

export function normalizeRecordingBlob(blob: Blob, extension: "mp4" | "webm"): Blob {
  const type = extension === "mp4" ? "video/mp4" : blob.type || "video/webm";
  if (blob.type === type) {
    return blob;
  }
  return new Blob([blob], { type });
}

/** True when the blob begins with an ISO BMFF `ftyp` box (not a WebM mislabeled as .mp4). */
export async function looksLikeIsoMp4(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (head.length < 8) {
    return false;
  }
  const boxType = String.fromCharCode(head[4], head[5], head[6], head[7]);
  return boxType === "ftyp";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export class CubeVideoRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: BlobPart[] = [];

  start(stream: MediaStream, mimeType: string): void {
    this.chunks = [];
    this.stream = stream;
    this.recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: DEFAULT_VIDEO_BITS_PER_SECOND,
    });
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    this.recorder.start(250);
  }

  stop(): Promise<Blob> {
    const recorder = this.recorder;
    const stream = this.stream;
    if (!recorder) {
      return Promise.reject(new Error("Recorder has not started."));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (blob: Blob) => {
        if (settled) {
          return;
        }
        settled = true;
        stream?.getTracks().forEach((track) => track.stop());
        this.recorder = null;
        this.stream = null;
        resolve(blob);
      };

      recorder.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error("Video recording failed."));
        }
      };

      recorder.onstop = async () => {
        await delay(120);
        const raw = new Blob(this.chunks, { type: recorder.mimeType });
        if (raw.size < 1024) {
          if (!settled) {
            settled = true;
            reject(new Error("Recording produced an empty or unusable video file."));
          }
          return;
        }
        finish(raw);
      };

      const flushAndStop = () => {
        try {
          if (recorder.state === "recording") {
            recorder.requestData();
          }
        } catch {
          // requestData may throw if already inactive on some builds
        }
        window.setTimeout(() => {
          try {
            if (recorder.state !== "inactive") {
              recorder.stop();
            }
          } catch (error) {
            if (!settled) {
              settled = true;
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          }
        }, 80);
      };

      flushAndStop();
    });
  }
}
