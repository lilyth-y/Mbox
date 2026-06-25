import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArrowLeft, Box, Download, Loader2, Play, Upload } from "lucide-react";

import type { ProcessedImage } from "../../shared/types";

import { processShowcaseUpload } from "./processShowcaseUpload";

import { bootstrapLocalWorkspace } from "../events/workspaceBackend";

import {
  cycleVariableSpinPreference,
  DEFAULT_SHOWCASE_PRESENTATION_PREFERENCES,
  getVariableSpinUiLabel,
  normalizeVariableSpinMode,
} from "./pipeline/showcasePresentationPreferences";
import type { ShowcasePresentationPreferences } from "./pipeline/showcasePresentationPreferences";
import {
  clampZoomBreathingAmplitude,
  clampZoomBreathingPeriodMs,
  SHOWCASE_ZOOM_BREATHING_AMPLITUDE_MAX,
  SHOWCASE_ZOOM_BREATHING_AMPLITUDE_MIN,
  SHOWCASE_ZOOM_BREATHING_PERIOD_MAX_MS,
  SHOWCASE_ZOOM_BREATHING_PERIOD_MIN_MS,
} from "./pipeline/showcasePresentationPreferences";

import {
  SHOWCASE_SCENE_INIT_CANCELLED,
  type ShowcasePhysicsSceneHandle,
} from "./babylon/createShowcasePhysicsScene";
import {
  buildShowcaseWebGLHelp,
  disposeBabylonEnginesForCanvas,
  disposeAllBabylonEngines,
  probeWebGLSupport,
  isShowcaseCanvasContextLost,
  isShowcaseElectronPreviewShell,
  shouldUseConservativeShowcaseWebGl,
} from "./babylon/babylonCanvasGuard";
import {
  shouldUseKinematicShowcasePreview,
  shouldDeferHavokUntilJewelStable,
  resolveShowcaseSubsystemFlags,
  getShowcaseConservativePlayingDelayMs,
} from "./showcaseGpuProfile";
import {
  buildShowcaseContentManifest,
  describeShowcasePipeline,
  formatShowcaseContentManifestSummary,
  resolveActiveShowcasePipeline,
  type ShowcasePipelineStageId,
} from "./pipeline";

import { ShowcaseCatalogPanel } from "./ShowcaseCatalogPanel";

import {
  formatShowcaseCatalogSummary,
  parseShowcaseCatalogFromSearch,
  syncShowcaseCatalogToUrl,
  type ShowcaseCatalogOptions,
} from "./showcaseCatalogOptions";
import { resolveShowcaseBackgroundMediaPath, resolveShowcaseBackgroundMediaIsVideo } from "./showcaseBackgroundMedia";
import { resolveShowcaseBgmUrl } from "./showcaseBgm";
import { useShowcaseBgmPreview } from "./useShowcaseBgmPreview";
import {
  auditShowcaseShapeRuntime,
  type ShowcaseShapeAuditResult,
} from "./showcaseShapeAcceptance";
import "./showcase-style.css";

import { createShowcaseDemoDataUrl } from "./showcaseDemoImages";

import {
  computeShowcaseExportDurationMs,
} from "./showcaseExportCapture";
import { runShowcaseExport } from "./runShowcaseExport";
import { isCloudRenderBackend } from "../../shared/lib/renderBackend";
import { isLocalGpuExportSession } from "../../shared/lib/renderExportProfile";
import { evaluateShowcaseExportReadiness } from "./showcaseExportReadiness";
import { ShowcaseDomMediaBackdrop } from "./showcaseDomMediaBackdrop";
import {
  isRenderJobAutoMode,
  readRenderJobFromWindow,
  readRenderJobSourceUrls,
} from "../../shared/lib/renderJobWindow";

function needsShowcaseEnvironmentReload(
  prev: ShowcaseCatalogOptions,
  next: ShowcaseCatalogOptions
): boolean {
  return (
    prev.groundEnabled !== next.groundEnabled ||
    prev.backgroundPreset !== next.backgroundPreset
  );
}

function buildJewelProfileKey(options: ShowcaseCatalogOptions): string {
  return [options.shapeId, options.photoLayout, options.framePresetId].join("|");
}

function buildEnvironmentKey(options: ShowcaseCatalogOptions): string {
  return [
    options.groundEnabled ? "floor" : "nofloor",
    options.backgroundPreset,
  ].join("|");
}



const DEMO_IMAGE_URLS = [1, 2, 3].map(createShowcaseDemoDataUrl);



const STAGE_LABEL: Record<ShowcasePipelineStageId, string> = {

  reveal: "표출",

  rotate: "회전·모핑",

  fall: "낙하",

  bounce: "튕김",

  pull: "정면 강조",

  ascend: "상승",

  morph: "사진 모핑",

  swap: "사진 교체",

};



function demoProcessedImage(url: string, id: number): ProcessedImage {

  return {

    id,

    url,

    preparedUrl: url,

    label: `Demo ${id}`,

    aiSuggestedCategory: "portrait",

    categoryConfidence: 1,

    originalUrl: url,

    center: { x: 50, y: 50 },

    focus: {

      onPrimarySubject: true,

      centering: "centered",

      aestheticScore: 0.8,

      compositionNotes: "",

    },

    preprocessMode: "original",

    subject: {

      requestedTarget: "person",

      detectedLabel: "person",

      detected: true,

      confidence: 1,

      bounds: { x0: 0.2, y0: 0.1, x1: 0.8, y1: 0.95 },

    },

    depth: {

      gridSize: 8,

      subjectDepth: 0.75,

      values: Array.from({ length: 64 }, () => 0.75),

    },

    byteSize: 0,

    sequenceOrder: id,

  };

}



async function readImageFilesAsDataUrls(files: File[]): Promise<string[]> {
  const imageFiles = files.filter(
    (file) =>
      file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic|avif)$/i.test(file.name)
  );

  return Promise.all(
    imageFiles.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error ?? new Error("read failed"));
          reader.readAsDataURL(file);
        })
    )
  );
}



const DEMO_IMAGES: ProcessedImage[] = [1, 2, 3].map((id) =>
  demoProcessedImage(DEMO_IMAGE_URLS[id - 1]!, id)
);

function resolveInitialShowcaseImages(): ProcessedImage[] | null {
  const fromJob = readRenderJobSourceUrls();
  if (fromJob?.length) {
    return fromJob.map((url, index) => demoProcessedImage(url, index + 1));
  }
  return DEMO_IMAGES;
}

const INITIAL_SHOWCASE_IMAGES: ProcessedImage[] | null = resolveInitialShowcaseImages();



export function ShowcaseDashboard() {

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const viewportWrapRef = useRef<HTMLDivElement>(null);
  const spillRef = useRef<HTMLDivElement>(null);

  const sceneRef = useRef<ShowcasePhysicsSceneHandle | null>(null);
  const renderJobAutoTriggeredRef = useRef(false);
  const renderJobBootstrapRef = useRef(false);
  const handleExportVideoRef = useRef<() => Promise<void>>(async () => {});

  const playingRef = useRef(!shouldUseConservativeShowcaseWebGl());

  /** User upload must win over async workspace bootstrap. */
  const userImagesOverrideRef = useRef(false);

  const imagesRef = useRef<ProcessedImage[] | null>(INITIAL_SHOWCASE_IMAGES);

  const sceneLoadTokenRef = useRef(0);
  const sceneInitInFlightRef = useRef(false);
  const sceneRecoveryKeyRef = useRef(0);
  const [sceneRecoveryKey, setSceneRecoveryKey] = useState(0);
  const webglLiveRef = useRef(false);
  const readyRef = useRef(false);
  const contextLossRecoveryRef = useRef<{
    restoredListener: (() => void) | null;
    rebuildTimer: number | null;
    softRecoveryTimer: number | null;
  }>({ restoredListener: null, rebuildTimer: null, softRecoveryTimer: null });
  const contextLossRebuildAttemptsRef = useRef(0);
  const lastContextRestoreMsRef = useRef(0);
  const contextLossStreakRef = useRef(0);
  const gpuSafeSessionRef = useRef(
    isLocalGpuExportSession() ? false : shouldUseConservativeShowcaseWebGl()
  );
  /** WebGL2 first — WebGL1 only after a real context-loss recovery. */
  const webglFallbackRef = useRef(false);
  const backdropMediaRef = useRef<HTMLVideoElement | HTMLImageElement | null>(null);

  const [webglRecovering, setWebglRecovering] = useState(false);
  const [backdropDeferred, setBackdropDeferred] = useState(true);

  const sceneImagesKeyRef = useRef<string | null>(null);

  const sceneJewelProfileKeyRef = useRef<string | null>(null);

  const uploadGenerationRef = useRef(0);

  const sceneImagesApplyChainRef = useRef(Promise.resolve());



  const [images, setImages] = useState<ProcessedImage[] | null>(INITIAL_SHOWCASE_IMAGES);

  const lastInitErrorRef = useRef<string | null>(null);

  const [status, setStatus] = useState(
    INITIAL_SHOWCASE_IMAGES
      ? "데모 사진으로 크리스탈 쇼케이스를 준비합니다…"
      : "사진을 업로드하면 크리스탈 미리보기가 시작됩니다."
  );

  const [ready, setReady] = useState(false);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  const [sceneLoadError, setSceneLoadError] = useState<string | null>(null);
  const [sceneLoadHelp, setSceneLoadHelp] = useState<string[]>([]);

  const [playing, setPlaying] = useState(!shouldUseConservativeShowcaseWebGl());

  const [fallPhysicsEnabled, setFallPhysicsEnabled] = useState(false);

  const [presentationPrefs, setPresentationPrefs] = useState<ShowcasePresentationPreferences>(
    () => ({ ...DEFAULT_SHOWCASE_PRESENTATION_PREFERENCES })
  );

  const [phase, setPhase] = useState<ShowcasePipelineStageId>("reveal");

  const [currentStep, setCurrentStep] = useState(1);

  const [catalog, setCatalog] = useState<ShowcaseCatalogOptions>(() =>

    parseShowcaseCatalogFromSearch(window.location.search)

  );

  const [applyBackgroundRemoval, setApplyBackgroundRemoval] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const [exportMessage, setExportMessage] = useState("");

  const [isProcessingUpload, setIsProcessingUpload] = useState(false);

  const [backdropSource, setBackdropSource] = useState<HTMLVideoElement | HTMLImageElement | null>(
    null
  );
  const [bgmCustomUrl, setBgmCustomUrl] = useState<string | null>(null);
  const bgmCustomUrlRef = useRef(bgmCustomUrl);
  bgmCustomUrlRef.current = bgmCustomUrl;
  const customBackdropBlobRef = useRef<string | null>(null);
  const backdropSourceRef = useRef(backdropSource);
  backdropSourceRef.current = backdropSource;

  const backdropMediaPath = useMemo(
    () =>
      catalog.backgroundMediaSource !== "none"
        ? resolveShowcaseBackgroundMediaPath(catalog)
        : null,
    [catalog]
  );

  const backdropMediaIsVideo = useMemo(
    () => resolveShowcaseBackgroundMediaIsVideo(catalog),
    [catalog]
  );

  const bgmUrl = useMemo(
    () => resolveShowcaseBgmUrl(catalog, bgmCustomUrl),
    [catalog, bgmCustomUrl]
  );

  useShowcaseBgmPreview({
    enabled: catalog.bgmEnabled,
    url: bgmUrl,
    volume: catalog.bgmVolume,
    playing: playing,
    muted: isRecording || !ready,
  });

  useEffect(
    () => () => {
      const bgmUrl = bgmCustomUrlRef.current;
      if (bgmUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(bgmUrl);
      }
      const backdropBlob = customBackdropBlobRef.current;
      if (backdropBlob?.startsWith("blob:")) {
        URL.revokeObjectURL(backdropBlob);
      }
    },
    []
  );

  const environmentKey = useMemo(() => buildEnvironmentKey(catalog), [catalog]);

  const jewelProfileKey = useMemo(() => buildJewelProfileKey(catalog), [catalog]);

  const handleBackdropReady = useCallback((source: HTMLVideoElement | HTMLImageElement | null) => {
    backdropMediaRef.current = source;
    setBackdropSource(source);
  }, []);

  useEffect(() => {
    if (!ready || webglRecovering) {
      setBackdropDeferred(true);
      return;
    }
    if (!resolveShowcaseSubsystemFlags().domBackdropVideo) {
      return;
    }
    const deferMs = shouldUseConservativeShowcaseWebGl() ? 4_000 : 1_500;
    const timer = window.setTimeout(() => setBackdropDeferred(false), deferMs);
    return () => window.clearTimeout(timer);
  }, [ready, webglRecovering]);

  const applySceneImages = useCallback((nextImages: ProcessedImage[]) => {
    const nextKey = nextImages.map((image) => image.url).join("\0");
    if (nextKey === sceneImagesKeyRef.current) {
      return sceneImagesApplyChainRef.current;
    }

    sceneImagesApplyChainRef.current = sceneImagesApplyChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (nextKey === sceneImagesKeyRef.current) {
          return;
        }
        const handle = sceneRef.current;
        if (!handle) {
          return;
        }
        try {
          await handle.setImages(nextImages);
          sceneImagesKeyRef.current = nextKey;
          setCurrentStep(1);
          setStatus(`${nextImages.length}장 · ${describeShowcasePipeline(fallPhysicsRef.current)}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "사진 텍스처 로드 실패";
          setStatus(message);
          throw error;
        }
      });

    return sceneImagesApplyChainRef.current;
  }, []);



  const imageUrls = useMemo(() => images?.map((image) => image.url) ?? [], [images]);

  imagesRef.current = images;

  const presentationCount = imageUrls.length;

  const hasPresentationImages = presentationCount > 0;

  const exportReadiness = useMemo(
    () =>
      evaluateShowcaseExportReadiness({
        sceneReady: ready,
        presentationCount,
        isRecording,
        isProcessingUpload,
        catalog,
        backdropMediaPath,
        backdropSource,
      }),
    [
      ready,
      presentationCount,
      isRecording,
      isProcessingUpload,
      catalog,
      backdropMediaPath,
      backdropSource,
    ]
  );



  const pipelineLabel = useMemo(

    () => describeShowcasePipeline(fallPhysicsEnabled),

    [fallPhysicsEnabled]

  );

  const contentManifestSummary = useMemo(() => {
    const order = resolveActiveShowcasePipeline(fallPhysicsEnabled);
    return formatShowcaseContentManifestSummary(buildShowcaseContentManifest(order));
  }, [fallPhysicsEnabled]);



  const catalogSummary = useMemo(() => formatShowcaseCatalogSummary(catalog), [catalog]);



  const handleCatalogChange = useCallback((next: ShowcaseCatalogOptions) => {
    const nextBackdropPath =
      next.backgroundMediaSource !== "none"
        ? resolveShowcaseBackgroundMediaPath(next)
        : null;
    const activeBlob = customBackdropBlobRef.current;
    if (activeBlob && activeBlob !== nextBackdropPath) {
      URL.revokeObjectURL(activeBlob);
      customBackdropBlobRef.current = null;
    }
    if (nextBackdropPath?.startsWith("blob:")) {
      customBackdropBlobRef.current = nextBackdropPath;
    }

    setCatalog((prev) => {
      if (needsShowcaseEnvironmentReload(prev, next)) {
        setReady(false);
        setStatus("배경 변경 — 미리보기를 다시 불러옵니다…");
      } else if (buildJewelProfileKey(prev) !== buildJewelProfileKey(next)) {
        setStatus("크리스탈 형상 텍스처를 준비하는 중…");
      }
      return next;
    });
    syncShowcaseCatalogToUrl(next);
  }, []);



  useEffect(() => {
    if (renderJobBootstrapRef.current) {
      return;
    }
    const sourceUrls = readRenderJobSourceUrls();
    if (!sourceUrls?.length) {
      return;
    }
    renderJobBootstrapRef.current = true;
    userImagesOverrideRef.current = true;
    setImages(sourceUrls.map((url, index) => demoProcessedImage(url, index + 1)));
    setStatus(`${sourceUrls.length}장 · 클라우드 렌더 작업 준비`);
  }, []);



  useEffect(() => {

    if (shouldUseConservativeShowcaseWebGl()) {
      return;
    }

    let cancelled = false;

    const bootstrapTimeout = window.setTimeout(() => {

      if (!cancelled && !userImagesOverrideRef.current && imagesRef.current === DEMO_IMAGES) {

        setStatus("워크스페이스 응답 지연 — 데모 사진으로 계속합니다.");

      }

    }, 6_000);



    void bootstrapLocalWorkspace()

      .then((workspace) => {

        if (cancelled) {

          return;

        }

        if (userImagesOverrideRef.current) {

          return;

        }

        if (workspace.processedImages.length >= 2) {

          setImages(workspace.processedImages.slice(0, 12));

          setStatus("워크스페이스 사진으로 크리스탈 쇼케이스를 재생합니다.");

        } else if (!imagesRef.current?.length) {

          setImages(DEMO_IMAGES);

          setStatus("데모 사진으로 크리스탈 쇼케이스를 재생합니다.");

        }

      })

      .catch(() => {

        if (!cancelled && !userImagesOverrideRef.current && !imagesRef.current?.length) {

          setImages(DEMO_IMAGES);

          setStatus("데모 사진으로 크리스탈 쇼케이스를 재생합니다.");

        }

      })

      .finally(() => {

        window.clearTimeout(bootstrapTimeout);

      });

    return () => {

      cancelled = true;

      window.clearTimeout(bootstrapTimeout);

    };

  }, []);



  const fallPhysicsRef = useRef(fallPhysicsEnabled);

  fallPhysicsRef.current = fallPhysicsEnabled;

  const presentationPrefsRef = useRef(presentationPrefs);

  presentationPrefsRef.current = presentationPrefs;



  const catalogRef = useRef(catalog);

  catalogRef.current = catalog;



  useEffect(() => {

    playingRef.current = playing;

  }, [playing]);



  useEffect(() => {

    const canvas = canvasRef.current;

    if (!canvas || !hasPresentationImages) {

      return;

    }



    let cancelled = false;

    let sceneHandle: ShowcasePhysicsSceneHandle | null = null;

    let statusTimer: number | null = null;

    const loadToken = ++sceneLoadTokenRef.current;



    void (async () => {
      if (sceneInitInFlightRef.current) {
        return;
      }
      sceneInitInFlightRef.current = true;

      setReady(false);

      setSceneLoadError(null);
      setSceneLoadHelp([]);

      webglLiveRef.current = false;

      setStatus(
        shouldUseKinematicShowcasePreview()
          ? "미리보기 준비 중… (물리 off — ?physics=1)"
          : shouldUseConservativeShowcaseWebGl()
            ? "미리보기 준비 중… (GPU 안전 모드)"
            : "Havok WASM · 물리 씬 로딩…"
      );



      const havokPreload =
        shouldUseKinematicShowcasePreview() || shouldDeferHavokUntilJewelStable()
          ? Promise.resolve()
          : import("../premium/babylon/physicsWorld").then((m) => m.preloadHavokPhysics());

      const [{ createShowcasePhysicsScene }] = await Promise.all([
        import("./babylon/createShowcasePhysicsScene"),
        havokPreload,
      ]);

      if (cancelled) {

        return;

      }



      const snapshot = imagesRef.current;

      if (!snapshot?.length) {

        setStatus("사진을 불러오는 중…");

        return;

      }



      try {
        // Hard guarantee: prevent Babylon engine overlap across recoveries.
        disposeAllBabylonEngines();

        sceneHandle = await createShowcasePhysicsScene(canvas, snapshot, {

          fallPhysicsEnabled: shouldUseKinematicShowcasePreview()
            ? false
            : fallPhysicsRef.current,

          catalog: catalogRef.current,

          presentationPrefs: presentationPrefsRef.current,

          backdropMediaElement: null,

          backdropSpillElement: spillRef.current,

          gpuSafeSession: isLocalGpuExportSession()
            ? false
            : gpuSafeSessionRef.current,

          forceWebGl1: webglFallbackRef.current,

          contextLossRecoveryAttempt: contextLossRebuildAttemptsRef.current,

          shouldContinue: () => !cancelled && loadToken === sceneLoadTokenRef.current,

          onWebGLContextLost: () => {
            if (loadToken !== sceneLoadTokenRef.current) {
              return;
            }
            const localGpuExport = isLocalGpuExportSession();
            const canvasEl = canvasRef.current;
            if (canvasEl && !isShowcaseCanvasContextLost(canvasEl)) {
              return;
            }
            if (!localGpuExport) {
              gpuSafeSessionRef.current = true;
            }
            if (localGpuExport) {
              setWebglRecovering(true);
              if (!readyRef.current) {
                setStatus("GPU 복구 중… (로컬 ANGLE)");
              }
            }
            if (shouldUseConservativeShowcaseWebGl() && !webglFallbackRef.current) {
              webglFallbackRef.current = true;
            }
            const clearContextLossRecovery = () => {
              const pending = contextLossRecoveryRef.current;
              if (pending.rebuildTimer !== null) {
                window.clearTimeout(pending.rebuildTimer);
              }
              if (pending.softRecoveryTimer !== null) {
                window.clearTimeout(pending.softRecoveryTimer);
              }
              contextLossRecoveryRef.current = {
                restoredListener: null,
                rebuildTimer: null,
                softRecoveryTimer: null,
              };
            };

            const scheduleHardRebuild = () => {
              clearContextLossRecovery();
              setWebglRecovering(false);

              const canvasNow = canvasRef.current;
              if (
                canvasNow &&
                !isShowcaseCanvasContextLost(canvasNow) &&
                sceneRef.current &&
                loadToken === sceneLoadTokenRef.current
              ) {
                contextLossRebuildAttemptsRef.current = 0;
                setSceneLoadError(null);
                setSceneLoadHelp([]);
                setReady(true);
                webglLiveRef.current = true;
                const count = imagesRef.current?.length ?? 0;
                if (count > 0) {
                  setStatus(`${count}장 · ${describeShowcasePipeline(fallPhysicsRef.current)}`);
                }
                return;
              }

              if (contextLossRebuildAttemptsRef.current >= (shouldUseConservativeShowcaseWebGl() ? 8 : 4)) {
                const help = buildShowcaseWebGLHelp("WebGL context lost", {
                  hadLiveContext: true,
                });
                setSceneLoadHelp(help);
                setSceneLoadError(help[0] ?? "WebGL 컨텍스트가 끊겼습니다.");
                setStatus("WebGL 컨텍스트가 끊겼습니다. 새로고침해 주세요.");
                setReady(false);
                return;
              }

              contextLossRebuildAttemptsRef.current += 1;
              sceneRef.current?.dispose();
              sceneRef.current = null;
              const canvasEl = canvasRef.current;
              if (canvasEl) {
                disposeBabylonEnginesForCanvas(canvasEl);
              }
              disposeAllBabylonEngines();
              webglLiveRef.current = false;
              setSceneLoadError(null);
              setSceneLoadHelp([]);
              setReady(false);
              setBackdropDeferred(true);
              setStatus(
                webglFallbackRef.current
                  ? "미리보기 안정화 중… (GPU 안전 모드)"
                  : "미리보기를 다시 불러오는 중…"
              );

              const rebuildTimer = window.setTimeout(() => {
                contextLossRecoveryRef.current.rebuildTimer = null;
                sceneRecoveryKeyRef.current += 1;
                setSceneRecoveryKey(sceneRecoveryKeyRef.current);
              }, contextLossRebuildAttemptsRef.current > 0 ? 800 : 450);
              contextLossRecoveryRef.current = {
                restoredListener: null,
                rebuildTimer,
                softRecoveryTimer: null,
              };
            };

            if (backdropMediaRef.current instanceof HTMLVideoElement) {
              backdropMediaRef.current.pause();
            }
            setWebglRecovering(true);
            setBackdropDeferred(true);
            setSceneLoadError(null);
            setSceneLoadHelp([]);
            if (!readyRef.current) {
              setStatus("WebGL 컨텍스트 복구 대기 중…");
            }

            if (contextLossRecoveryRef.current.rebuildTimer !== null) {
              return;
            }

            if (localGpuExport) {
              const softRecoveryTimer = window.setTimeout(() => {
                contextLossRecoveryRef.current.softRecoveryTimer = null;
                sceneRef.current?.applySafeGpuRecovery();
              }, 1_500);
              const rebuildTimer = window.setTimeout(() => {
                contextLossRecoveryRef.current.rebuildTimer = null;
                if (contextLossRecoveryRef.current.softRecoveryTimer !== null) {
                  window.clearTimeout(contextLossRecoveryRef.current.softRecoveryTimer);
                  contextLossRecoveryRef.current.softRecoveryTimer = null;
                }
                scheduleHardRebuild();
              }, readyRef.current ? 4_000 : 15_000);
              contextLossRecoveryRef.current = {
                restoredListener: null,
                rebuildTimer,
                softRecoveryTimer,
              };
              return;
            }

            if (shouldUseConservativeShowcaseWebGl()) {
              const rebuildTimer = window.setTimeout(() => {
                contextLossRecoveryRef.current.rebuildTimer = null;
                scheduleHardRebuild();
              }, contextLossRebuildAttemptsRef.current > 0 ? 400 : 300);
              contextLossRecoveryRef.current = {
                restoredListener: null,
                rebuildTimer,
                softRecoveryTimer: null,
              };
              return;
            }

            contextLossStreakRef.current += 1;
            const msSinceRestore =
              lastContextRestoreMsRef.current > 0
                ? Date.now() - lastContextRestoreMsRef.current
                : Number.POSITIVE_INFINITY;
            const rapidReloss = msSinceRestore < 8_000;

            if (rapidReloss) {
              sceneRef.current?.applySafeGpuRecovery();
              const rebuildTimer = window.setTimeout(() => {
                contextLossRecoveryRef.current.rebuildTimer = null;
                scheduleHardRebuild();
              }, isRecordingRef.current ? 400 : 250);
              contextLossRecoveryRef.current = {
                restoredListener: null,
                rebuildTimer,
                softRecoveryTimer: null,
              };
              if (isRecordingRef.current) {
                setExportMessage("GPU 오류 — 녹화를 중단하고 미리보기를 복구합니다…");
              }
              return;
            }

            const softRecoveryTimer = window.setTimeout(() => {
              contextLossRecoveryRef.current.softRecoveryTimer = null;
              sceneRef.current?.applySafeGpuRecovery();
            }, 2_000);

            const rebuildTimer = window.setTimeout(() => {
              contextLossRecoveryRef.current.rebuildTimer = null;
              if (contextLossRecoveryRef.current.softRecoveryTimer !== null) {
                window.clearTimeout(contextLossRecoveryRef.current.softRecoveryTimer);
                contextLossRecoveryRef.current.softRecoveryTimer = null;
              }
              scheduleHardRebuild();
            }, 12_000);

            contextLossRecoveryRef.current = {
              restoredListener: null,
              rebuildTimer,
              softRecoveryTimer,
            };
          },

          onWebGLContextRestored: () => {
            if (loadToken !== sceneLoadTokenRef.current) {
              return;
            }
            lastContextRestoreMsRef.current = Date.now();
            contextLossStreakRef.current = 0;
            const pending = contextLossRecoveryRef.current;
            if (pending.rebuildTimer !== null) {
              window.clearTimeout(pending.rebuildTimer);
            }
            if (pending.softRecoveryTimer !== null) {
              window.clearTimeout(pending.softRecoveryTimer);
            }
            contextLossRecoveryRef.current = {
              restoredListener: null,
              rebuildTimer: null,
              softRecoveryTimer: null,
            };
            contextLossRebuildAttemptsRef.current = 0;
            setWebglRecovering(false);
            setSceneLoadError(null);
            setSceneLoadHelp([]);
            if (sceneRef.current) {
              setReady(true);
              webglLiveRef.current = true;
              const count = imagesRef.current?.length ?? 0;
              if (count > 0) {
                setStatus(`${count}장 · ${describeShowcasePipeline(fallPhysicsRef.current)}`);
              }
            }
          },

        });

        if (cancelled || loadToken !== sceneLoadTokenRef.current) {

          sceneHandle.dispose();

          return;

        }

        sceneRef.current = sceneHandle;

        sceneImagesKeyRef.current = snapshot.map((image) => image.url).join("\0");

        sceneJewelProfileKeyRef.current = buildJewelProfileKey(catalogRef.current);

        sceneHandle.setPlaying(playingRef.current);

        sceneHandle.resize();

        setReady(true);

        webglLiveRef.current = true;
        contextLossRebuildAttemptsRef.current = 0;

        if (gpuSafeSessionRef.current) {
          sceneHandle.setPlaying(false);
          playingRef.current = false;
          setPlaying(false);
          window.setTimeout(() => {
            if (!sceneRef.current || !readyRef.current || webglRecovering) {
              return;
            }
            sceneRef.current.setPlaying(true);
            playingRef.current = true;
            setPlaying(true);
          }, getShowcaseConservativePlayingDelayMs({ gpuSafeSession: true }));
        } else {
          sceneHandle.setPlaying(true);
          playingRef.current = true;
          setPlaying(true);
        }

        window.setTimeout(() => {
          if (sceneRef.current && readyRef.current && !webglRecovering) {
            contextLossRebuildAttemptsRef.current = 0;
          }
        }, 6_000);

        setStatus(`${snapshot.length}장 · ${describeShowcasePipeline(fallPhysicsRef.current)}`);



        const latest = imagesRef.current;

        if (latest?.length) {

          const latestKey = latest.map((image) => image.url).join("\0");

          if (latestKey !== sceneImagesKeyRef.current) {

            await sceneHandle.setImages(latest);

            sceneImagesKeyRef.current = latestKey;

            setStatus(`${latest.length}장 · ${describeShowcasePipeline(fallPhysicsRef.current)}`);

          }

        }



        statusTimer = window.setInterval(() => {

          if (!sceneRef.current) {

            return;

          }

          setPhase(sceneRef.current.getStageId());

          setCurrentStep(sceneRef.current.getImageIndex() + 1);

        }, 120);

        if (window.__MBOX_SHOWCASE_E2E__) {
          window.__MBOX_SHOWCASE_SHAPE_AUDIT__ = (): ShowcaseShapeAuditResult => {
            const handle = sceneRef.current;
            if (!handle) {
              return {
                shapeId: catalogRef.current.shapeId,
                passed: false,
                staticPassed: false,
                checks: [{ id: "live:scene", pass: false, detail: "no scene handle" }],
              };
            }
            const rig = handle.director.getRig();
            return auditShowcaseShapeRuntime({
              shapeId: catalogRef.current.shapeId,
              snapshot: handle.director.getSnapshot(),
              rigShapeId: rig?.shapeId ?? null,
              canvas: handle.getCanvas(),
              photoLayout: catalogRef.current.photoLayout,
            });
          };
        }

      } catch (error) {

        if (error instanceof Error && error.message === SHOWCASE_SCENE_INIT_CANCELLED) {

          return;

        }

        const message = error instanceof Error ? error.message : "초기화 실패";
        lastInitErrorRef.current = message;
        disposeAllBabylonEngines();

        const help = buildShowcaseWebGLHelp(message, {
          hadLiveContext:
            webglLiveRef.current && /context lost/i.test(message),
        });
        setSceneLoadHelp(help);
        setSceneLoadError(help[0] ?? `물리 씬 오류: ${message}`);

        setStatus(
          isShowcaseElectronPreviewShell()
            ? "내장 미리보기 WebGL 제한 — Chrome/Edge에서 열어 주세요"
            : help[0]
              ? `미리보기 오류: ${help[0]}`
              : `미리보기 오류: ${message}`
        );

      } finally {
        sceneInitInFlightRef.current = false;
      }

    })();



    return () => {

      cancelled = true;

      const pending = contextLossRecoveryRef.current;
      if (pending.rebuildTimer !== null) {
        window.clearTimeout(pending.rebuildTimer);
      }
      if (pending.softRecoveryTimer !== null) {
        window.clearTimeout(pending.softRecoveryTimer);
      }
      contextLossRecoveryRef.current = {
        restoredListener: null,
        rebuildTimer: null,
        softRecoveryTimer: null,
      };

      if (statusTimer !== null) {

        window.clearInterval(statusTimer);

      }

      if (window.__MBOX_SHOWCASE_E2E__) {
        delete window.__MBOX_SHOWCASE_SHAPE_AUDIT__;
      }

      sceneHandle?.dispose();

      sceneRef.current = null;

      sceneImagesKeyRef.current = null;

    };

  }, [hasPresentationImages, environmentKey, sceneRecoveryKey]);



  useEffect(() => {

    if (!ready || !sceneRef.current || !images?.length) {

      return;

    }

    if (jewelProfileKey === sceneJewelProfileKeyRef.current) {

      return;

    }

    sceneJewelProfileKeyRef.current = jewelProfileKey;

    void sceneRef.current.updateJewelProfile(catalog, images).then(() => {

      setStatus(`${images.length}장 · ${describeShowcasePipeline(fallPhysicsRef.current)}`);

    });

  }, [catalog, images, jewelProfileKey, ready, fallPhysicsEnabled]);



  useEffect(() => {

    if (!ready || !sceneRef.current || !images?.length) {

      return;

    }

    const nextKey = images.map((image) => image.url).join("\0");

    if (nextKey === sceneImagesKeyRef.current) {

      return;

    }

    void applySceneImages(images);

  }, [applySceneImages, images, ready]);



  useEffect(() => {

    if (!ready || !sceneRef.current) {

      return;

    }

    sceneRef.current.updateBackdropMedia(backdropSource, catalogRef.current);

  }, [backdropMediaPath, backdropSource, ready]);



  useEffect(() => {

    if (!ready || !sceneRef.current) {

      return;

    }

    sceneRef.current.updateCatalogDisplay(catalog);

  }, [

    catalog.photoFrameColorHex,

    catalog.crystalShellColorHex,

    catalog.crystalBackdropBlend,

    catalog.crystalShellTransparency,

    catalog.crystalPhotoClarity,

    catalog.crystalGloss,

    catalog.crystalSizeScale,

    catalog.backgroundLightInfluence,

    ready,

  ]);



  useEffect(() => {

    const wrap = viewportWrapRef.current;

    if (!wrap) {

      return;

    }

    const observer = new ResizeObserver(() => {

      sceneRef.current?.resize();

    });

    observer.observe(wrap);

    return () => observer.disconnect();

  }, [ready]);



  const toggleFallPhysics = useCallback(() => {

    setFallPhysicsEnabled((prev) => {

      const next = !prev;

      sceneRef.current?.setFallPhysicsEnabled(next);

      setStatus(`${presentationCount}장 · ${describeShowcasePipeline(next)}`);

      return next;

    });

  }, [presentationCount]);



  const toggleVariableSpin = useCallback(() => {

    setPresentationPrefs((prev) => {

      const next = cycleVariableSpinPreference(prev);

      sceneRef.current?.setPresentationPreferences(next);

      return next;

    });

  }, []);



  const toggleZoomBreathing = useCallback(() => {

    setPresentationPrefs((prev) => {

      const next = { ...prev, zoomBreathingEnabled: !prev.zoomBreathingEnabled };

      sceneRef.current?.setPresentationPreferences(next);

      return next;

    });

  }, []);



  const patchPresentationPrefs = useCallback(
    (patch: Partial<ShowcasePresentationPreferences>) => {
      setPresentationPrefs((prev) => {
        const next = {
          ...prev,
          ...patch,
          zoomBreathingPeriodMs: clampZoomBreathingPeriodMs(
            patch.zoomBreathingPeriodMs ?? prev.zoomBreathingPeriodMs
          ),
          zoomBreathingAmplitude: clampZoomBreathingAmplitude(
            patch.zoomBreathingAmplitude ?? prev.zoomBreathingAmplitude
          ),
        };
        sceneRef.current?.setPresentationPreferences(next);
        return next;
      });
    },
    []
  );



  const togglePlay = useCallback(() => {

    setPlaying((prev) => {

      const next = !prev;

      sceneRef.current?.setPlaying(next);

      return next;

    });

  }, []);



  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    setIsProcessingUpload(true);
    setStatus(applyBackgroundRemoval ? "사진 읽는 중…" : "사진을 적용하는 중…");

    try {
      const sourceImages = await readImageFilesAsDataUrls(Array.from(files));
      if (!sourceImages.length) {
        setStatus("이미지 파일(jpg, png, webp 등)을 선택해 주세요.");
        return;
      }

      const uploadGeneration = ++uploadGenerationRef.current;
      userImagesOverrideRef.current = true;

      const { preview, refinement, usedCloud } = await processShowcaseUpload(sourceImages, {
        applyBackgroundRemoval,
        onStatus: setStatus,
      });

      const nextImages = preview.slice(0, 12);
      imagesRef.current = nextImages;
      setImages(nextImages);
      setPlaying(true);
      playingRef.current = true;
      sceneRef.current?.setPlaying(true);

      setStatus(
        applyBackgroundRemoval
          ? `${nextImages.length}장 · ${usedCloud ? "미리보기 적용 · 분석 중…" : "배경 제거 완료"}`
          : `${nextImages.length}장 · ${usedCloud ? "미리보기 적용 · 클라우드 분석 중…" : "업로드 완료"}`
      );

      void refinement.then(async (refined) => {
        if (uploadGenerationRef.current !== uploadGeneration) {
          return;
        }
        const refinedImages = refined.slice(0, 12);
        imagesRef.current = refinedImages;
        setImages(refinedImages);
        setStatus(
          applyBackgroundRemoval
            ? `${refinedImages.length}장 · 클라우드 분석 · 배경 제거 완료`
            : `${refinedImages.length}장 · 클라우드 분석 · 업로드 완료`
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "업로드 실패";
      setStatus(message);
    } finally {
      setIsProcessingUpload(false);
    }
  };



  const handleExportVideo = async () => {

    const handle = sceneRef.current;

    if (!handle || !exportReadiness.ready) {

      return;

    }

    const durationSec = Math.round(

      computeShowcaseExportDurationMs(presentationCount, fallPhysicsEnabled) / 1000

    );

    setIsRecording(true);

    handle.applySafeGpuRecovery();
    if (backdropMediaRef.current instanceof HTMLVideoElement) {
      backdropMediaRef.current.pause();
    }

    setExportMessage(
      isCloudRenderBackend()
        ? "클라우드에서 MP4 렌더 중… (1–3분)"
        : bgmUrl
          ? `BGM 합성 · 연출 녹화 중… (약 ${durationSec}초)`
          : `연출 녹화 중… (약 ${durationSec}초)`
    );

    try {

      const { filename } = await runShowcaseExport(handle, {

        imageCount: presentationCount,

        fallPhysicsEnabled,

        catalog,

        backdropMediaPath,

        backdropElement: backdropSourceRef.current,

        backdropOpacity: catalog.backgroundMediaOpacity,

        backgroundPreset: catalog.backgroundPreset,

        viewportElement: viewportWrapRef.current,

        bgmUrl,

        bgmVolume: catalog.bgmVolume,

        images: imagesRef.current ?? [],

      });

      setExportMessage(`${filename} 다운로드 완료`);

    } catch (error) {

      const message = error instanceof Error ? error.message : "MP4 생성 실패";

      setExportMessage(message);

      window.alert(message);

    } finally {

      setIsRecording(false);

      window.setTimeout(() => setExportMessage(""), 6000);

    }

  };

  handleExportVideoRef.current = handleExportVideo;

  useEffect(() => {
    const job = readRenderJobFromWindow();
    if (!job && !isRenderJobAutoMode()) {
      return;
    }
    if (!exportReadiness.ready || renderJobAutoTriggeredRef.current) {
      return;
    }
    renderJobAutoTriggeredRef.current = true;
    void handleExportVideoRef.current();
  }, [exportReadiness.ready]);



  return (

    <>

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">

        <div>

          <a

            href="./index.html"

            className="inline-flex items-center gap-1.5 text-xs mbox-link mb-3"

          >

            <ArrowLeft size={14} />

            mbox 메인

          </a>

          <h1 className="text-3xl serif-title metallic-text">크리스털 쇼케이스</h1>

          <p className="text-mbox-muted text-sm mt-1">

            Havok 홀로그램 디스플레이 · 크리스탈 스택 ({pipelineLabel})

          </p>

          <p className="text-mbox-muted text-xs mt-1" data-testid="showcase-content-manifest">

            {contentManifestSummary}

          </p>

          <p className="text-mbox-muted text-xs mt-1" data-testid="showcase-env">

            {catalogSummary}

          </p>

          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-mbox-subtle italic">

            {status} · {STAGE_LABEL[phase]} · {currentStep}/{presentationCount}

            {exportMessage ? ` · ${exportMessage}` : ""}

          </p>

        </div>

      </header>



      <main className="space-y-6">

        <div className="flex items-center gap-2 text-mbox-gold">

          <Box size={20} />

          <h2 className="font-bold text-mbox-text">3D 쇼케이스 미리보기</h2>

        </div>



        <div className="showcase-layout">

          <div className="mbox-card p-3 md:p-4 showcase-viewport-card">

            <div

              ref={viewportWrapRef}

              className="showcase-viewport-wrap relative mx-auto w-full max-w-[640px] rounded-xl bg-black overflow-hidden"

            >

              <ShowcaseDomMediaBackdrop
                mediaPath={backdropDeferred ? null : backdropMediaPath}
                isVideo={backdropMediaIsVideo}
                opacity={catalog.backgroundMediaOpacity}
                onReady={handleBackdropReady}
              />

              <div ref={spillRef} className="showcase-backdrop-spill" aria-hidden />

              <canvas

                key={sceneRecoveryKey}

                ref={canvasRef}

                className="showcase-canvas"

                aria-label="3D physics showcase viewport"

              />

              {!ready && (

                <div
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-4 text-center bg-black/55 backdrop-blur-sm"
                >

                  {!sceneLoadError ? (
                    <Loader2 className="w-8 h-8 animate-spin text-mbox-gold" aria-hidden />
                  ) : null}

                  {!sceneLoadError ? (
                    <p className="text-sm text-mbox-muted max-w-sm">{status}</p>
                  ) : null}

                  {sceneLoadError ? (
                    <div className="max-w-md space-y-2 text-xs leading-relaxed text-amber-200/90">
                      {sceneLoadHelp.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                      <p className="text-[11px] text-amber-200/70">
                        debug: electron=
                        {String(isShowcaseElectronPreviewShell())}
                        {" · "}
                        ctxLost=
                        {(() => {
                          const c = canvasRef.current;
                          return c ? String(isShowcaseCanvasContextLost(c)) : "no-canvas";
                        })()}
                        {" · "}
                        attempts={contextLossRebuildAttemptsRef.current}
                        {" · "}
                        probe=
                        {(() => {
                          const p = probeWebGLSupport();
                          return `${p.webgl2 ? "w2" : "w2-"}${p.webgl1 ? "w1" : "w1-"}${p.usable ? "" : "(!)"}`;
                        })()}
                        {" · "}
                        lastErr={(lastInitErrorRef.current ?? "").slice(0, 120)}
                      </p>
                    </div>
                  ) : null}

                  {sceneLoadError ? (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <a
                        href={window.location.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="secondary-btn text-xs font-semibold"
                      >
                        Chrome/Edge에서 열기
                      </a>
                      <button
                        type="button"
                        className="secondary-btn text-xs font-semibold"
                        onClick={() => {
                          contextLossRebuildAttemptsRef.current = 0;
                          contextLossStreakRef.current = 0;
                          setSceneLoadError(null);
                          setSceneLoadHelp([]);
                          setWebglRecovering(false);
                          sceneRef.current?.dispose();
                          sceneRef.current = null;
                          disposeAllBabylonEngines();
                          webglLiveRef.current = false;
                          sceneRecoveryKeyRef.current += 1;
                          setSceneRecoveryKey(sceneRecoveryKeyRef.current);
                        }}
                      >
                        다시 시도
                      </button>
                      <button
                        type="button"
                        className="secondary-btn text-xs font-semibold"
                        onClick={() => window.location.reload()}
                      >
                        새로고침
                      </button>
                    </div>
                  ) : null}

                </div>

              )}

              {webglRecovering && ready ? (
                <div
                  className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-1 text-[11px] text-mbox-muted pointer-events-none"
                  aria-live="polite"
                >
                  <Loader2 className="w-3 h-3 animate-spin text-mbox-gold" aria-hidden />
                  GPU 복구 중…
                </div>
              ) : null}

            </div>

          </div>



          <ShowcaseCatalogPanel

            value={catalog}

            onChange={handleCatalogChange}

            disabled={!images}

            bgmCustomUrl={bgmCustomUrl}

            onBgmCustomUrlChange={setBgmCustomUrl}

          />

        </div>



        <div className="flex flex-wrap items-center justify-center gap-3">

          <button

            type="button"

            className={`secondary-btn inline-flex items-center gap-2 text-sm font-semibold disabled:opacity-50 ${

              fallPhysicsEnabled ? "ring-1 ring-mbox-gold/40" : ""

            }`}

            onClick={toggleFallPhysics}

            disabled={!ready || shouldUseKinematicShowcasePreview()}

          >

            낙하 물리 {fallPhysicsEnabled ? "ON" : "OFF"}

          </button>

          <button

            type="button"

            className={`secondary-btn inline-flex items-center gap-2 text-sm font-semibold disabled:opacity-50 ${

              presentationPrefs.variableSpinEnabled ? "ring-1 ring-mbox-gold/40" : ""

            }`}

            onClick={toggleVariableSpin}

            disabled={!ready}

            title={
              !presentationPrefs.variableSpinEnabled
                ? "클릭: 복합 회전"
                : normalizeVariableSpinMode(presentationPrefs.variableSpinMode) === "compound"
                  ? "복합 — Y 회전 + 피치 흔들림. 클릭: 4방"
                  : "4방 — 루프마다 좌→우→상→하. 클릭: OFF"
            }

          >

            난방향 {getVariableSpinUiLabel(presentationPrefs)}

          </button>

          <button

            type="button"

            className={`secondary-btn inline-flex items-center gap-2 text-sm font-semibold disabled:opacity-50 ${

              presentationPrefs.zoomBreathingEnabled ? "ring-1 ring-mbox-gold/40" : ""

            }`}

            onClick={toggleZoomBreathing}

            disabled={!ready}

          >

            호흡 줌 {presentationPrefs.zoomBreathingEnabled ? "ON" : "OFF"}

          </button>

          {presentationPrefs.zoomBreathingEnabled ? (
            <div className="flex w-full max-w-md flex-col gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/80">
              <label className="flex flex-col gap-1">
                <span>
                  줌 주기{" "}
                  {(presentationPrefs.zoomBreathingPeriodMs / 1000).toFixed(1)}초
                </span>
                <input
                  type="range"
                  min={SHOWCASE_ZOOM_BREATHING_PERIOD_MIN_MS}
                  max={SHOWCASE_ZOOM_BREATHING_PERIOD_MAX_MS}
                  step={200}
                  value={presentationPrefs.zoomBreathingPeriodMs}
                  disabled={!ready}
                  onChange={(e) =>
                    patchPresentationPrefs({
                      zoomBreathingPeriodMs: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span>
                  줌 깊이{" "}
                  {(presentationPrefs.zoomBreathingAmplitude * 100).toFixed(1)}%
                </span>
                <input
                  type="range"
                  min={SHOWCASE_ZOOM_BREATHING_AMPLITUDE_MIN}
                  max={SHOWCASE_ZOOM_BREATHING_AMPLITUDE_MAX}
                  step={0.005}
                  value={presentationPrefs.zoomBreathingAmplitude}
                  disabled={!ready}
                  onChange={(e) =>
                    patchPresentationPrefs({
                      zoomBreathingAmplitude: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400"
                />
              </label>
            </div>
          ) : null}

          <button

            type="button"

            className="secondary-btn inline-flex items-center gap-2 text-sm font-semibold disabled:opacity-50"

            onClick={togglePlay}

            disabled={!ready}

          >

            <Play className="w-4 h-4" aria-hidden />

            {playing ? "일시정지" : "재생"}

          </button>

          <label className="secondary-btn inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">

            <Upload className="w-4 h-4" aria-hidden />

            사진 업로드

            <input

              type="file"

              accept="image/*"

              multiple

              className="sr-only"

              data-testid="showcase-photo-upload"

              disabled={isProcessingUpload}

              onChange={(e) => {

                void handleUpload(e.target.files);

                e.target.value = "";

              }}

            />

          </label>



          <label className="secondary-btn inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">

            <input

              type="checkbox"

              className="accent-[var(--mbox-gold)]"

              checked={applyBackgroundRemoval}

              onChange={(e) => setApplyBackgroundRemoval(e.target.checked)}

            />

            배경 제거

          </label>



          <button

            type="button"

            className="secondary-btn inline-flex items-center gap-2 text-sm font-semibold disabled:opacity-50"

            onClick={() => void handleExportVideo()}

            disabled={!exportReadiness.ready}

            title={exportReadiness.reason ?? undefined}

          >

            <Download className="w-4 h-4" aria-hidden />

            {isRecording ? "MP4 생성 중…" : "MP4 다운로드"}

          </button>

          <a

            href="./index.html"

            className="secondary-btn inline-flex items-center gap-2 text-sm font-semibold no-underline"

          >

            <ArrowLeft className="w-4 h-4" aria-hidden />

            메인으로

          </a>

        </div>

      </main>



      <footer className="mt-12 pt-8 border-t border-[rgba(223,179,134,0.12)] flex flex-col md:flex-row justify-between items-center text-mbox-muted text-sm">

        <p>© 2026 mbox. All rights reserved.</p>

        <div className="flex gap-6 mt-4 md:mt-0">

          <a href="./index.html" className="mbox-link">

            메인 앱

          </a>

          <a href="./showcase.html" className="mbox-link">

            쇼케이스

          </a>

        </div>

      </footer>

    </>

  );

}


