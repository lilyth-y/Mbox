export function resolveMp4MimeType(): string | null {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/mp4",
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveRecordingMimeType(): { mimeType: string; extension: "mp4" | "webm" } {
  const mp4MimeType = resolveMp4MimeType();
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

export class CubeVideoRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];

  start(stream: MediaStream, mimeType: string): void {
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType });
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    this.recorder.start(250);
  }

  stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder) {
      return Promise.reject(new Error("Recorder has not started."));
    }

    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        resolve(new Blob(this.chunks, { type: recorder.mimeType }));
      };
      recorder.onerror = () => {
        reject(new Error("Video recording failed."));
      };
      recorder.stop();
    });
  }
}
