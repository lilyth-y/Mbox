import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ShowcaseCompanionMessage,
  type ShowcaseCompanionState,
  SHOWCASE_COMPANION_CHANNEL,
  postCompanionMessage,
  serializeCompanionState,
} from "../../shared/lib/showcaseChromeCompanion";
import {
  autoOpenChromeCompanionOnce,
  openChromeGpuPreviewTab,
} from "./ChromeCompanionViewport";

export type CompanionExportNotice =
  | { type: "started" }
  | { type: "done"; filename: string }
  | { type: "failed"; message: string };

type ShellOptions = {
  enabled: boolean;
  state: ShowcaseCompanionState | null;
  onSyncError?: (message: string) => void;
};

export function useShowcaseChromeCompanionShell({ enabled, state, onSyncError }: ShellOptions) {
  const [chromeLive, setChromeLive] = useState(false);
  const [exportNotice, setExportNotice] = useState<CompanionExportNotice | null>(null);
  const revisionRef = useRef(0);
  const serializeGenRef = useRef(0);
  const latestStateRef = useRef(state);
  latestStateRef.current = state;

  const openChrome = useCallback(() => {
    openChromeGpuPreviewTab();
  }, []);

  const clearExportNotice = useCallback(() => {
    setExportNotice(null);
  }, []);

  const publishCurrentState = useCallback(() => {
    const current = latestStateRef.current;
    if (!enabled || !current?.images.length) {
      return;
    }
    revisionRef.current += 1;
    const revision = revisionRef.current;
    const gen = ++serializeGenRef.current;
    void serializeCompanionState({ ...current, revision })
      .then((serialized) => {
        if (gen !== serializeGenRef.current) {
          return;
        }
        postCompanionMessage({ type: "state", payload: { ...serialized, revision } });
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "RTX Chrome 사진 동기화 실패";
        onSyncError?.(message);
      });
  }, [enabled, onSyncError]);

  useEffect(() => {
    if (!enabled || typeof BroadcastChannel === "undefined") {
      return;
    }

    autoOpenChromeCompanionOnce(openChrome);

    const channel = new BroadcastChannel(SHOWCASE_COMPANION_CHANNEL);
    const onMessage = (event: MessageEvent<ShowcaseCompanionMessage>) => {
      const msg = event.data;
      if (msg?.type === "pong") {
        const live = Boolean(msg.sceneReady);
        setChromeLive((prev) => {
          if (!prev && live) {
            publishCurrentState();
          }
          return live;
        });
      }
      if (msg?.type === "exportStarted") {
        setExportNotice({ type: "started" });
      }
      if (msg?.type === "exportDone") {
        setExportNotice({ type: "done", filename: msg.filename });
      }
      if (msg?.type === "exportFailed") {
        setExportNotice({ type: "failed", message: msg.message });
      }
    };
    channel.addEventListener("message", onMessage);

    const ping = () => channel.postMessage({ type: "ping" } satisfies ShowcaseCompanionMessage);
    ping();
    const timer = window.setInterval(ping, 4_000);

    return () => {
      window.clearInterval(timer);
      channel.removeEventListener("message", onMessage);
      channel.close();
    };
  }, [enabled, openChrome, publishCurrentState]);

  useEffect(() => {
    publishCurrentState();
  }, [state, publishCurrentState]);

  const requestExport = useCallback(() => {
    postCompanionMessage({ type: "requestExport" });
  }, []);

  return { chromeLive, openChrome, requestExport, exportNotice, clearExportNotice };
}

type TargetOptions = {
  enabled: boolean;
  sceneReady: boolean;
  onApplyState: (state: ShowcaseCompanionState) => void;
  onExportRequest: () => void;
};

export function useShowcaseChromeCompanionTarget({
  enabled,
  sceneReady,
  onApplyState,
  onExportRequest,
}: TargetOptions) {
  const lastRevisionRef = useRef(0);
  const pendingStateRef = useRef<ShowcaseCompanionState | null>(null);

  useEffect(() => {
    if (!enabled || typeof BroadcastChannel === "undefined") {
      return;
    }

    const channel = new BroadcastChannel(SHOWCASE_COMPANION_CHANNEL);
    const onMessage = (event: MessageEvent<ShowcaseCompanionMessage>) => {
      const msg = event.data;
      if (msg?.type === "ping") {
        channel.postMessage({ type: "pong", sceneReady } satisfies ShowcaseCompanionMessage);
        return;
      }
      if (msg?.type === "state" && msg.payload.revision > lastRevisionRef.current) {
        lastRevisionRef.current = msg.payload.revision;
        pendingStateRef.current = msg.payload;
        onApplyState(msg.payload);
        return;
      }
      if (msg?.type === "requestExport") {
        onExportRequest();
      }
    };
    channel.addEventListener("message", onMessage);
    channel.postMessage({ type: "pong", sceneReady } satisfies ShowcaseCompanionMessage);

    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
    };
  }, [enabled, sceneReady, onApplyState, onExportRequest]);

  useEffect(() => {
    if (!sceneReady || !pendingStateRef.current) {
      return;
    }
    onApplyState(pendingStateRef.current);
  }, [sceneReady, onApplyState]);
}
