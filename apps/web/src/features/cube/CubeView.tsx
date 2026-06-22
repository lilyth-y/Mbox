import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Download, Layers, Loader2, Play } from "lucide-react";
import { CollapsibleOptionSelect } from "./CollapsibleOptionSelect";
import { CollapsibleSection } from "./CollapsibleSection";
import { CubePhotoStrip } from "./CubePhotoStrip";
import { FrameSettingsControls } from "./FrameSettingsControls";
import { CubeSizeControl } from "./CubeSizeControl";
import * as THREE from "three";
import type { ProcessedImage } from "../../shared/types";
import { PARALLAX_MS, ZOOM_MS, getPresentationFace } from "./cubeSequence";
import {
  createPresentationMotionSeed,
  formatPresentationDurationMs,
  getLoopBridgeMs,
  getStepMotionVariety,
  getStepPhaseTiming,
  getStepSegmentMs,
  resolvePresentationTimeline,
  sumSegmentDurations,
} from "./cubeMotionVariety";
import {
  createCubeAngularInertiaState,
  type CubeInertiaPhase,
} from "./cubeAngularInertia";
import { createCubeDragControls } from "./cubeDragControls";
import {
  applyCubeFocusFrameToRoot,
  resolveCubeFocusTextureStep,
} from "./cubeFocusMotionApply";
import {
  computePresentationFrame,
  computePresentationLoopBridgeFrame,
} from "./presentationFrame";
import { getGradientShift } from "./presentationGradient";
import { resolveFanPhase } from "./fan";
import { PRESENTATION_EFFECTS, type PresentationEffectId } from "./presentationEffects";
import { createPresentationScene } from "./presentationScene";
import { cs5FxOptionsFromSettings } from "./cs5Fx";
import { constrainPresentationImages } from "../../shared/lib/mediaLimits";
import {
  isVoluMaxCutoutReady,
  isVoluMaxLayerReady,
  isTransparentMatteDataUrl,
  resolveCubeShowcaseFx,
  resolvePresentationEffectWithMicroModules,
  resolveSubjectForegroundUrl,
  writeMicroModuleEnabled,
} from "@mbox/shared";
import { PresentationMicroModuleHost } from "./microModules";
import type { PresentationMicroModuleHostOptions } from "./microModules";
import { applyPresentationPrepareBatch, applyBackgroundPlateThemeBatch, ensureBackgroundPlatesForCube } from "../processing/applyPresentationPrepare";
import {
  formatVoluMaxOneClickMessage,
  formatVoluMaxPrepareMessage,
  summarizeVoluMaxReadiness,
} from "../../shared/lib/voluMaxReadiness";
import { auditVoluMaxVaultIntegrity } from "../../shared/lib/voluMaxVaultIntegrity";
import { mountViewportBackdrop, type ViewportBackdropBinding } from "./viewportBackdrop";
import {
  CubeVideoRecorder,
  downloadBlob,
  looksLikeIsoMp4,
  normalizeRecordingBlob,
  resolveRecordingMimeType,
} from "./cubeRecorder";
import {
  createCubeRecordingVideoStream,
  endCubeRecordingExport,
  prepareCubeRecordingExport,
  resolveRecordDurationMs,
  restoreRendererLayout,
  resolveCubeExportPixelSize,
  resolveVideoBitsPerSecond,
  snapshotRendererLayout,
} from "./cubeExportCapture";
import { resolveExportMotionElapsedMs } from "./fanExportRotation";
import {
  applyPresentationTextureSampling,
  buildCubeSceneContentKey,
  disposePresentationTextureSnapshot,
  loadPresentationTextureSet,
} from "./presentationTextures";
import {
  CubeFocusPanel,
  DEFAULT_CUBE_FOCUS_SETTINGS,
  type CubeFocusSettings,
} from "./CubeFocusPanel";
import { patchVoluMaxDepthEnabled } from "./voluMaxDepthSettings";
import { getCubeFramePreset } from "./cubeFramePresets";
import { resolveBgmSource } from "./bgm/bgmTracks";
import { startBgmRecordingSession } from "./bgm/compositeStreamWithBgm";
import { applyResolutionEnhanceBatch } from "../processing/applyResolutionEnhance";
import type { PresentationScene } from "./presentationScene";
import {
  aimCameraAtCubeOrigin,
  applyHologramPreviewScale,
  clearCubeMount,
  disposeCubeRenderer,
  syncRendererToContainer,
} from "./cubeSceneLifecycle";
import {
  applyWorkflowMediaToCubeDefaults,
  saveWorkflowMedia,
  workflowMediaFromCubeSettings,
} from "../../shared/lib/workflowMediaSettings";

interface CubeViewProps {
  active: boolean;
  workspaceReady?: boolean;
  processedImages: ProcessedImage[];
  onProcessedImagesChange?: (images: ProcessedImage[]) => void;
}

function countVoluMaxLayers(images: ProcessedImage[]): number {
  return images.filter((img) => isVoluMaxCutoutReady(img)).length;
}

function needsVoluMaxLayerBuild(
  images: ProcessedImage[],
  theme: CubeFocusSettings["backgroundPlateTheme"],
  requireAiCutout = false
): boolean {
  if (images.length === 0) {
    return false;
  }
  return images.some((img) => {
    if (!isVoluMaxLayerReady(img) || img.backgroundPlateTheme !== theme) {
      return true;
    }
    if (requireAiCutout && !isVoluMaxCutoutReady(img)) {
      return true;
    }
    return false;
  });
}

function canUpdateBackgroundPlateOnly(images: ProcessedImage[]): boolean {
  return (
    images.length > 0 &&
    images.every((image) => {
      const fg = resolveSubjectForegroundUrl(image);
      return Boolean(fg && isTransparentMatteDataUrl(fg));
    })
  );
}

function buildMicroModuleHostOptions(args: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer?: THREE.WebGLRenderer;
  cubeSettings: Pick<CubeFocusSettings, "hologramMode" | "microModules">;
  getPresentationRoot: () => THREE.Object3D | null;
}): PresentationMicroModuleHostOptions {
  return {
    scene: args.scene,
    camera: args.camera,
    renderer: args.renderer,
    hologramMode: false,
    modules: args.cubeSettings.microModules,
    getPresentationRoot: args.getPresentationRoot,
  };
}

function previewMicroModuleLayoutSize(container: HTMLElement): number {
  return Math.min(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
}

export function CubeView({
  active,
  workspaceReady = true,
  processedImages,
  onProcessedImagesChange,
}: CubeViewProps) {
  const cubeContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRuntimeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    container: HTMLDivElement;
    scene: THREE.Scene;
  } | null>(null);
  const texturesRef = useRef<{
    textures: THREE.Texture[];
    plateTextures: Array<THREE.Texture | null>;
    subjectForegroundTextures: Array<THREE.Texture | null>;
  } | null>(null);
  const requestRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const exportPipelineActiveRef = useRef(false);
  const exportFrameIndexRef = useRef(0);
  const timelineStartRef = useRef(performance.now());
  const [presentationKey, setPresentationKey] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedEffect, setSelectedEffect] =
    useState<PresentationEffectId>("cube_focus");
  const [cubeSettings, setCubeSettings] = useState<CubeFocusSettings>(() =>
    applyWorkflowMediaToCubeDefaults(DEFAULT_CUBE_FOCUS_SETTINGS)
  );

  useEffect(() => {
    saveWorkflowMedia(workflowMediaFromCubeSettings(cubeSettings));
  }, [
    cubeSettings.viewportBackdropPath,
    cubeSettings.bgmEnabled,
    cubeSettings.bgmTrackId,
    cubeSettings.bgmWorkspacePath,
    cubeSettings.cubeSizeScale,
  ]);
  /** Product: circular fan-blade viewport retired — flat 3D preview only. */
  const hologramMode = false;
  const isCubeFocusPreview = selectedEffect === "cube_focus";
  const cubeFocusPreviewModules = useMemo(
    () =>
      isCubeFocusPreview
        ? { ...cubeSettings.microModules, orbitalShowcase: false }
        : cubeSettings.microModules,
    [isCubeFocusPreview, cubeSettings.microModules]
  );
  const effectivePresentationEffect = useMemo(
    () =>
      resolvePresentationEffectWithMicroModules(
        selectedEffect,
        cubeFocusPreviewModules
      ) as PresentationEffectId,
    [selectedEffect, cubeFocusPreviewModules]
  );
  const cubeShowcaseFx = useMemo(
    () =>
      resolveCubeShowcaseFx({
        cubeHeartbeatEnabled: cubeSettings.cubeHeartbeatEnabled,
        cubeShowcaseZoomEnabled: cubeSettings.cubeShowcaseZoomEnabled,
        cubeComplexRotationEnabled: cubeSettings.cubeComplexRotationEnabled,
        cubeSubjectPullEnabled: cubeSettings.cubeSubjectPullEnabled,
        cubeScaleCoupledSpinEnabled: cubeSettings.cubeScaleCoupledSpinEnabled,
        cubeZoomIntensity: cubeSettings.cubeZoomIntensity,
        cubeComplexRotationIntensity: cubeSettings.cubeComplexRotationIntensity,
        cubeAcceleratedSpinIntensity: cubeSettings.cubeAcceleratedSpinIntensity,
        cubeSubjectPullIntensity: cubeSettings.cubeSubjectPullIntensity,
        cubeHeartbeatIntensity: cubeSettings.cubeHeartbeatIntensity,
      }),
    [
      cubeSettings.cubeHeartbeatEnabled,
      cubeSettings.cubeShowcaseZoomEnabled,
      cubeSettings.cubeComplexRotationEnabled,
      cubeSettings.cubeSubjectPullEnabled,
      cubeSettings.cubeScaleCoupledSpinEnabled,
      cubeSettings.cubeZoomIntensity,
      cubeSettings.cubeComplexRotationIntensity,
      cubeSettings.cubeAcceleratedSpinIntensity,
      cubeSettings.cubeSubjectPullIntensity,
      cubeSettings.cubeHeartbeatIntensity,
    ]
  );
  const [isEnhancingResolution, setIsEnhancingResolution] = useState(false);
  const [isPreparingPlates, setIsPreparingPlates] = useState(false);
  const [isSceneLoading, setIsSceneLoading] = useState(false);
  const presentationRef = useRef<PresentationScene | null>(null);
  const microModuleHostRef = useRef(new PresentationMicroModuleHost());
  const voluMaxVaultRepairRef = useRef(false);
  const perfObserverRef = useRef<PerformanceObserver | null>(null);

  const orderedImages = useMemo(
    () => constrainPresentationImages(processedImages),
    [processedImages]
  );
  const presentationCount = orderedImages.length;
  const voluMaxLayerCount = useMemo(() => countVoluMaxLayers(orderedImages), [orderedImages]);
  const voluMaxReadiness = useMemo(
    () => summarizeVoluMaxReadiness(orderedImages),
    [orderedImages]
  );
  const enhancedCount = useMemo(
    () => processedImages.filter((image) => image.resolutionEnhanceScale === 2).length,
    [processedImages]
  );
  const framePreset = useMemo(
    () => getCubeFramePreset(cubeSettings.framePresetId),
    [cubeSettings.framePresetId]
  );
  const omittedCount = processedImages.length - orderedImages.length;
  const captionSignature = useMemo(
    () => orderedImages.map((image) => `${image.id}:${image.caption ?? ""}`).join("|"),
    [orderedImages]
  );
  const cubeSceneContentKey = useMemo(
    () => buildCubeSceneContentKey(orderedImages, cubeSettings.voluMaxDepthEnabled),
    [orderedImages, cubeSettings.voluMaxDepthEnabled]
  );
  const motionSeed = useMemo(
    () => createPresentationMotionSeed(orderedImages, presentationKey),
    [orderedImages, presentationKey]
  );
  const segmentMsByStep = useMemo(
    () =>
      orderedImages.map((_, step) =>
        getStepSegmentMs(
          motionSeed,
          step,
          ZOOM_MS,
          PARALLAX_MS,
          effectivePresentationEffect,
          orderedImages.length,
          "wedding_default",
          cubeSettings.fanSpeed
        )
      ),
    [orderedImages, motionSeed, effectivePresentationEffect, cubeSettings.fanSpeed]
  );
  const loopBridgeMs = useMemo(
    () => getLoopBridgeMs(effectivePresentationEffect, presentationCount),
    [effectivePresentationEffect, presentationCount]
  );
  const contentDurationMs = useMemo(
    () => sumSegmentDurations(segmentMsByStep),
    [segmentMsByStep]
  );
  const presentationDurationMs = contentDurationMs + loopBridgeMs;
  const selectedEffectMeta = useMemo(
    () => PRESENTATION_EFFECTS.find((effect) => effect.id === selectedEffect),
    [selectedEffect]
  );

  useEffect(() => {
    presentationRef.current?.updateCaptionTexts?.(
      orderedImages.map((image) => image.caption ?? "")
    );
  }, [captionSignature, orderedImages]);

  const handleCaptionChange = useCallback(
    (imageId: number, caption: string) => {
      if (!onProcessedImagesChange) {
        return;
      }
      onProcessedImagesChange(
        processedImages.map((image) => (image.id === imageId ? { ...image, caption } : image))
      );
    },
    [onProcessedImagesChange, processedImages]
  );

  const handleDeleteImage = useCallback(
    (imageId: number) => {
      if (!onProcessedImagesChange || isRecording || isEnhancingResolution) {
        return;
      }
      const target = processedImages.find((image) => image.id === imageId);
      const label = target?.label ?? "사진";
      if (!window.confirm(`'${label}'을(를) 큐브에서 제거할까요?`)) {
        return;
      }
      onProcessedImagesChange(processedImages.filter((image) => image.id !== imageId));
      setPresentationKey((value) => value + 1);
    },
    [
      onProcessedImagesChange,
      processedImages,
      isRecording,
      isEnhancingResolution,
    ]
  );

  const handleSelectEffect = (effectId: PresentationEffectId) => {
    if (isRecording || effectId === selectedEffect) {
      return;
    }
    setSelectedEffect(effectId);
    setPresentationKey((value) => value + 1);
    setCurrentStep(0);
    const label = PRESENTATION_EFFECTS.find((effect) => effect.id === effectId)?.label;
    setRecordingMessage(
      label ? `${label} 연출로 처음부터 다시 시작합니다.` : "연출 템플릿을 변경했습니다."
    );
    window.setTimeout(() => setRecordingMessage(""), 4000);
  };

  const runPresentationPrepare = useCallback(
    (
      images: ProcessedImage[],
      options?: {
        enableDepthAfter?: boolean;
        forceAiCutout?: boolean;
      }
    ) => {
      if (!onProcessedImagesChange || images.length === 0 || isPreparingPlates) {
        return;
      }
      setIsPreparingPlates(true);
      const useAiCutout =
        options?.forceAiCutout ?? cubeSettings.voluMaxAiForegroundCutout;
      setRecordingMessage(
        useAiCutout
          ? "VoluMax: AI 누끼 + 원본 블러 배경 plate 생성 중..."
          : "VoluMax: 배경·인물 레이어 생성 중..."
      );
      void applyPresentationPrepareBatch(images, {
        backgroundPlateTheme: cubeSettings.backgroundPlateTheme,
        useAiForegroundCutout: useAiCutout,
        forceRegenerateLayers: options?.enableDepthAfter === true,
      })
        .then((prepared) => {
          onProcessedImagesChange(prepared);
          const summary = summarizeVoluMaxReadiness(prepared);
          if (options?.enableDepthAfter) {
            if (summary.cutoutReady === 0) {
              setRecordingMessage(formatVoluMaxOneClickMessage(summary));
              window.setTimeout(() => setRecordingMessage(""), 6000);
              return;
            }
            setCubeSettings((prev) => ({
              ...prev,
              voluMaxDepthEnabled: true,
              voluMaxAiForegroundCutout: useAiCutout,
            }));
            setPresentationKey((value) => value + 1);
            setRecordingMessage(formatVoluMaxOneClickMessage(summary));
            window.setTimeout(() => setRecordingMessage(""), 6000);
            return;
          }
          setPresentationKey((value) => value + 1);
          setRecordingMessage(formatVoluMaxPrepareMessage(summary));
          window.setTimeout(() => setRecordingMessage(""), 5000);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setRecordingMessage(`VoluMax 준비 실패: ${message}`);
        })
        .finally(() => {
          setIsPreparingPlates(false);
        });
    },
    [
      onProcessedImagesChange,
      isPreparingPlates,
      cubeSettings.backgroundPlateTheme,
      cubeSettings.voluMaxAiForegroundCutout,
    ]
  );

  const runVoluMaxOneClickSetup = useCallback(() => {
    runPresentationPrepare(processedImages, {
      enableDepthAfter: true,
      forceAiCutout: true,
    });
  }, [runPresentationPrepare, processedImages]);

  useEffect(() => {
    if (
      !active ||
      !workspaceReady ||
      !onProcessedImagesChange ||
      voluMaxVaultRepairRef.current ||
      isPreparingPlates ||
      processedImages.length === 0
    ) {
      return;
    }
    const audit = auditVoluMaxVaultIntegrity(processedImages);
    const needsRebuild = audit.some(
      (entry) =>
        entry.issue === "missing_subject_fg" ||
        entry.issue === "missing_bg_plate" ||
        entry.issue === "stale_prepared" ||
        entry.issue === "stale_ai_cutout_kind"
    );
    if (!needsRebuild) {
      return;
    }
    voluMaxVaultRepairRef.current = true;
    setRecordingMessage("VoluMax 전경 URL 누락 — AI 누끼 레이어를 자동 재생성합니다…");
    runPresentationPrepare(processedImages, { forceAiCutout: true });
  }, [
    active,
    workspaceReady,
    onProcessedImagesChange,
    isPreparingPlates,
    processedImages,
    runPresentationPrepare,
  ]);

  useEffect(() => {
    if (
      !active ||
      !onProcessedImagesChange ||
      processedImages.length === 0 ||
      isPreparingPlates ||
      !cubeSettings.voluMaxDepthEnabled
    ) {
      return;
    }
    const shouldPrepare =
      cubeSettings.voluMaxAutoPrepareLayers ||
      needsVoluMaxLayerBuild(
        processedImages,
        cubeSettings.backgroundPlateTheme,
        cubeSettings.voluMaxAiForegroundCutout
      );
    if (!shouldPrepare) {
      return;
    }
    const plateOnly = canUpdateBackgroundPlateOnly(processedImages);
    let cancelled = false;
    setIsPreparingPlates(true);
    setRecordingMessage(
      plateOnly
        ? "배경 플레이트 테마 적용 중 (VoluMax 설정 유지)..."
        : "VoluMax 연출용 배경 플레이트 생성 중..."
    );
    const preparePromise = plateOnly
      ? applyBackgroundPlateThemeBatch(processedImages, cubeSettings.backgroundPlateTheme)
      : applyPresentationPrepareBatch(processedImages, {
          backgroundPlateTheme: cubeSettings.backgroundPlateTheme,
          useAiForegroundCutout: cubeSettings.voluMaxAiForegroundCutout,
        });
    void preparePromise
      .then((prepared) => {
        if (!cancelled) {
          onProcessedImagesChange(prepared);
          if (!plateOnly) {
            setPresentationKey((value) => value + 1);
          }
          setRecordingMessage(
            plateOnly
              ? "배경 플레이트가 적용되었습니다 (VoluMax·시차 유지)."
              : formatVoluMaxPrepareMessage(summarizeVoluMaxReadiness(prepared))
          );
          window.setTimeout(() => setRecordingMessage(""), 5000);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setRecordingMessage(`배경 플레이트 준비 실패: ${message}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPreparingPlates(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    active,
    processedImages,
    onProcessedImagesChange,
    isPreparingPlates,
    cubeSettings.voluMaxDepthEnabled,
    cubeSettings.voluMaxAutoPrepareLayers,
    cubeSettings.backgroundPlateTheme,
    cubeSettings.voluMaxAiForegroundCutout,
  ]);

  const viewportBackdropRef = useRef<ViewportBackdropBinding | null>(null);

  useEffect(() => {
    const runtime = sceneRuntimeRef.current;
    if (!active || !runtime?.scene || !runtime.renderer) {
      return;
    }
    mountViewportBackdrop(
      viewportBackdropRef,
      runtime.scene,
      runtime.renderer,
      cubeSettings.viewportBackdropPath,
      {
        galaxyBackgroundActive: cubeSettings.microModules.galaxyBackground,
        opacity: cubeSettings.viewportBackdropOpacity,
        camera: runtime.camera,
      }
    );
  }, [
    active,
    cubeSettings.viewportBackdropPath,
    cubeSettings.microModules.galaxyBackground,
    cubeSceneContentKey,
    presentationKey,
  ]);

  useEffect(() => {
    const runtime = sceneRuntimeRef.current;
    if (!active || !runtime?.camera) return;
    viewportBackdropRef.current?.syncToCamera(runtime.camera);
  }, [active, presentationKey, cubeSceneContentKey]);

  useEffect(() => {
    viewportBackdropRef.current?.setOpacity(cubeSettings.viewportBackdropOpacity);
  }, [cubeSettings.viewportBackdropOpacity]);

  useEffect(() => {
    if (!active || !isCubeFocusPreview) {
      return;
    }
    if (cubeSettings.microModules.orbitalShowcase) {
      setCubeSettings((prev) => ({
        ...prev,
        microModules: writeMicroModuleEnabled(prev.microModules, "orbital_showcase", false),
      }));
    }
  }, [active, isCubeFocusPreview, cubeSettings.microModules.orbitalShowcase]);

  useEffect(() => {
    presentationRef.current?.setFrameBorderWidth(cubeSettings.frameBorderWidth);
  }, [active, cubeSettings.frameBorderWidth, presentationKey]);

  useEffect(() => {
    presentationRef.current?.setFrameFinish(cubeSettings.frameFinishId);
  }, [active, cubeSettings.frameFinishId, presentationKey]);

  useEffect(() => {
    presentationRef.current?.setCubeSizeScale(cubeSettings.cubeSizeScale);
  }, [active, cubeSettings.cubeSizeScale, presentationKey, cubeSceneContentKey]);

  useEffect(() => {
    presentationRef.current?.setFramePreset(cubeSettings.framePresetId);
  }, [active, cubeSettings.framePresetId, presentationKey]);

  useEffect(() => {
    if (!active || !cubeContainerRef.current || presentationCount === 0) {
      return;
    }

    const container = cubeContainerRef.current;
    disposeCubeRenderer(container, rendererRef.current);
    clearCubeMount(container);

    const scene = new THREE.Scene();
    const previewBackdropHex = "#000000";
    const previewBackdrop = new THREE.Color(previewBackdropHex);
    scene.background = previewBackdrop;

    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.z = 5;
    scene.add(camera);

    const microModuleHost = microModuleHostRef.current;
    const getPresentationRoot = () => presentationRef.current?.root ?? null;

    // Camera must be in the scene graph so HUD children (ring, screen particles) render.

    let cancelled = false;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true,
    });
    renderer.setClearColor(previewBackdrop, 1.0);
    container.appendChild(renderer.domElement);
    const syncLayout = () => syncRendererToContainer(renderer, camera, container);
    syncLayout();
    requestAnimationFrame(syncLayout);
    rendererRef.current = renderer;
    sceneRuntimeRef.current = { renderer, camera, container, scene };

    // GPU timer query (DEV-only): helps decide if 1s hitch is GPU stall vs CPU / rAF scheduling.
    const gpuTimer =
      import.meta.env.DEV && typeof document !== "undefined"
        ? (() => {
            const gl =
              (renderer.getContext() as WebGL2RenderingContext | WebGLRenderingContext | null) ??
              null;
            if (!gl) {
              return null;
            }
            const extWebgl2 = (gl as any).getExtension?.("EXT_disjoint_timer_query_webgl2") ?? null;
            const extWebgl1 = (gl as any).getExtension?.("EXT_disjoint_timer_query") ?? null;
            const isWebgl2 = typeof (gl as any).beginQuery === "function";
            const ext = extWebgl2 ?? extWebgl1;
            if (!ext) {
              return null;
            }
            const state: {
              isWebgl2: boolean;
              ext: any;
              query: any | null;
              pending: any | null;
              lastGpuMs: number | null;
              disjoint: boolean;
            } = {
              isWebgl2,
              ext,
              query: null,
              pending: null,
              lastGpuMs: null,
              disjoint: false,
            };
            const createQuery = () =>
              state.isWebgl2 ? (gl as any).createQuery() : state.ext.createQueryEXT();
            const begin = (q: any) => {
              if (state.isWebgl2) {
                (gl as any).beginQuery(state.ext.TIME_ELAPSED_EXT, q);
              } else {
                state.ext.beginQueryEXT(state.ext.TIME_ELAPSED_EXT, q);
              }
            };
            const end = () => {
              if (state.isWebgl2) {
                (gl as any).endQuery(state.ext.TIME_ELAPSED_EXT);
              } else {
                state.ext.endQueryEXT(state.ext.TIME_ELAPSED_EXT);
              }
            };
            const isAvailable = (q: any) =>
              state.isWebgl2
                ? (gl as any).getQueryParameter(q, (gl as any).QUERY_RESULT_AVAILABLE)
                : state.ext.getQueryObjectEXT(q, state.ext.QUERY_RESULT_AVAILABLE_EXT);
            const getResult = (q: any) =>
              state.isWebgl2
                ? (gl as any).getQueryParameter(q, (gl as any).QUERY_RESULT)
                : state.ext.getQueryObjectEXT(q, state.ext.QUERY_RESULT_EXT);
            const isDisjoint = () => {
              // WebGL2: gl.GPU_DISJOINT_EXT (from ext). WebGL1: ext.GPU_DISJOINT_EXT.
              const key = state.ext.GPU_DISJOINT_EXT;
              return Boolean((gl as any).getParameter?.(key));
            };
            return {
              beginFrame: () => {
                if (state.pending) {
                  // poll previous query
                  try {
                    state.disjoint = isDisjoint();
                    if (!state.disjoint && isAvailable(state.pending)) {
                      const ns = getResult(state.pending);
                      const ms = typeof ns === "number" ? ns / 1e6 : 0;
                      state.lastGpuMs = Math.round(ms * 100) / 100;
                      state.pending = null;
                    }
                  } catch {
                    // ignore
                  }
                }
                if (!state.query) {
                  try {
                    state.query = createQuery();
                    begin(state.query);
                  } catch {
                    state.query = null;
                  }
                }
              },
              endFrame: () => {
                if (!state.query) return;
                try {
                  end();
                  state.pending = state.query;
                } catch {
                  // ignore
                } finally {
                  state.query = null;
                }
              },
              snapshot: () => ({
                gpuMs: state.lastGpuMs,
                disjoint: state.disjoint,
                pending: Boolean(state.pending),
              }),
              dispose: () => {
                try {
                  const del = (q: any) =>
                    state.isWebgl2 ? (gl as any).deleteQuery(q) : state.ext.deleteQueryEXT(q);
                  if (state.query) del(state.query);
                  if (state.pending) del(state.pending);
                } catch {
                  // ignore
                }
              },
            };
          })()
        : null;

    // Capture main-thread long tasks (e.g., GC, layout, heavy JS) to explain rare 1s hitches.
    // This is DEV-only instrumentation and has no effect in production builds.
    if (import.meta.env.DEV && typeof PerformanceObserver !== "undefined") {
      try {
        // Reset per-page load so we can fetch the latest events via CDP.
        (window as any).__mboxLongTasks = [];
        perfObserverRef.current?.disconnect();
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const duration = (entry as any).duration ?? 0;
            if (duration >= 50) {
              const payload = {
                name: entry.name,
                startTime: Math.round(((entry as any).startTime ?? 0) * 100) / 100,
                duration: Math.round(duration * 100) / 100,
              };
              (window as any).__mboxLongTasks.push(payload);
              console.warn("[CubeView][longtask]", payload);
            }
          }
        });
        observer.observe({ entryTypes: ["longtask"] as any });
        perfObserverRef.current = observer;
      } catch {
        // Best-effort only.
      }
    }
    mountViewportBackdrop(
      viewportBackdropRef,
      scene,
      renderer,
      cubeSettings.viewportBackdropPath,
      {
        galaxyBackgroundActive: cubeSettings.microModules.galaxyBackground,
        opacity: cubeSettings.viewportBackdropOpacity,
        camera,
      }
    );

    const moduleHostOptions = () =>
      buildMicroModuleHostOptions({
        scene,
        camera,
        renderer,
        cubeSettings: { ...cubeSettings, microModules: cubeFocusPreviewModules },
        getPresentationRoot,
      });

    microModuleHost.mount(moduleHostOptions());

    scene.add(new THREE.AmbientLight(0xffffff, 0.88));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.75);
    dirLight.position.set(4, 7, 5);
    scene.add(dirLight);
    const specLight = new THREE.PointLight(0xfff5e6, 2.85, 14);
    specLight.position.set(0, 3, 4);
    scene.add(specLight);
    const rimLight = new THREE.PointLight(0xd8e8ff, 1.35, 11);
    rimLight.position.set(-3.5, 1.5, 2.5);
    scene.add(rimLight);

    let presentation: PresentationScene | null = null;
    const inertiaState = createCubeAngularInertiaState();
    const inertiaEnabled =
      cubeSettings.cubeAngularInertiaEnabled && effectivePresentationEffect === "cube_focus";
    let timelinePauseAccumMs = 0;
    let dragPauseStartedAt: number | null = null;
    // Preview clock: do NOT let focus-loss cause a 1s delta jump.
    // - clamp dt to avoid rare huge spikes (OS scheduling / focus changes)
    // - freeze time when unfocused or dragging, so step seams don't "teleport"
    let previewClockMs = 0;
    const dragControls = createCubeDragControls(renderer.domElement, {
      enabled: () =>
        effectivePresentationEffect === "cube_focus" &&
        !recordingRef.current &&
        !exportPipelineActiveRef.current &&
        presentation !== null,
      getBaseRotation: () => presentation?.root.rotation ?? new THREE.Euler(0, 0.38, 0),
      onDragStart: () => {
        dragPauseStartedAt = performance.now();
      },
      onDragEnd: () => {
        if (dragPauseStartedAt !== null) {
          timelinePauseAccumMs += performance.now() - dragPauseStartedAt;
          dragPauseStartedAt = null;
        }
      },
    });
    timelineStartRef.current = performance.now();
    let lastTime = performance.now();
    const recordingDuration = presentationDurationMs;
    let appliedStep = -1;
    let lastSlowLogAt = 0;
    let lastSlowFrameLogAt = 0;
    let pendingUiStep: number | null = null;
    let pendingUiStepRaf: number | null = null;

    const scheduleUiStepUpdate = (nextStep: number) => {
      if (recordingRef.current || exportPipelineActiveRef.current) {
        return;
      }
      pendingUiStep = nextStep;
      if (pendingUiStepRaf !== null) {
        return;
      }
      pendingUiStepRaf = requestAnimationFrame(() => {
        pendingUiStepRaf = null;
        if (pendingUiStep !== null) {
          setCurrentStep(pendingUiStep);
          pendingUiStep = null;
        }
      });
    };

    const applyRootMotion = (
      frame: ReturnType<typeof computePresentationFrame>,
      step: number,
      deltaMs: number,
      phase?: CubeInertiaPhase
    ) => {
      if (!presentation) {
        return;
      }
      applyCubeFocusFrameToRoot(frame, presentation.root, step, presentationCount, {
        zoomEnabled: cubeShowcaseFx.cubeShowcaseZoomEnabled,
        inertiaEnabled:
          inertiaEnabled && cubeShowcaseFx.cubeShowcaseZoomEnabled,
        recording:
          recordingRef.current || exportPipelineActiveRef.current,
        deltaMs,
        phase,
        inertiaState,
      });
    };

    const animate = (now: number) => {
      const isExportCapture =
        recordingRef.current || exportPipelineActiveRef.current;
      if (!presentation) {
        renderer.render(scene, camera);
        requestRef.current = requestAnimationFrame(animate);
        return;
      }
      const deltaMs = now - lastTime;
      lastTime = now;
      const isSlowFrame = deltaMs > 40;
      const slowFrameProfileEnabled = import.meta.env.DEV && isSlowFrame;
      const slowFrameT0 = slowFrameProfileEnabled ? performance.now() : 0;
      let tFrame0: number | null = null;
      let tFrame1: number | null = null;
      gpuTimer?.beginFrame();

      if (dragPauseStartedAt !== null) {
        timelinePauseAccumMs += now - dragPauseStartedAt;
        dragPauseStartedAt = now;
      }

      // Update particle physics
      const tParticles0 = slowFrameProfileEnabled ? performance.now() : 0;
      const hasFocus = typeof document !== "undefined" ? document.hasFocus?.() ?? true : true;
      const isPreviewPaused = dragPauseStartedAt !== null || !hasFocus;
      const dtClamped = Math.min(deltaMs, 50);
      const dtPreview = isPreviewPaused ? 0 : dtClamped;

      previewClockMs += dtPreview;

      presentation.updateParticles(dtPreview);
      const tParticles1 = slowFrameProfileEnabled ? performance.now() : 0;
      microModuleHost.update(dtPreview);
      const tModules1 = slowFrameProfileEnabled ? performance.now() : 0;

      const elapsed = previewClockMs;
      const timeline = isExportCapture || recordingDuration <= 0 ? elapsed : elapsed % recordingDuration;
      const motionElapsed = isExportCapture
        ? recordingRef.current
          ? resolveExportMotionElapsedMs(
              exportFrameIndexRef.current++,
              contentDurationMs
            )
          : 0
        : timeline;
      const resolved = resolvePresentationTimeline(
        motionElapsed,
        segmentMsByStep,
        isExportCapture ? 0 : loopBridgeMs
      );
      const tTimeline1 = slowFrameProfileEnabled ? performance.now() : 0;

      if (resolved.kind === "loop_bridge") {
        if (effectivePresentationEffect !== "cube_focus") {
          // loopBridgeMs should be 0; hold last step until timeline wraps
          const holdStep = resolved.lastStep;
          const frame = computePresentationFrame(
            effectivePresentationEffect,
            holdStep,
            0,
            presentationCount,
            getPresentationFace(holdStep),
            {
              timing: getStepPhaseTiming(
                motionSeed,
                holdStep,
                ZOOM_MS,
                PARALLAX_MS,
                effectivePresentationEffect,
                presentationCount
              ),
              variety: getStepMotionVariety(motionSeed, holdStep),
              imageCenter: orderedImages[holdStep]?.center,
              cubeRotationMode: cubeSettings.cubeRotationMode,
              exportRecording: isExportCapture,
              motionSeed,
              fanTimelineProfile: "wedding_default",
              fanSpeed: cubeSettings.fanSpeed,
              cubeShowcaseFx,
            }
          );
          applyRootMotion(frame, holdStep, deltaMs);
          camera.position.x = frame.cameraOffsetX ?? 0;
          camera.position.y = frame.cameraOffsetY ?? 0;
          camera.position.z = frame.cameraZ;
          camera.fov = frame.fieldOfView;
          camera.updateProjectionMatrix();
          aimCameraAtCubeOrigin(camera);
          presentation.setParallaxAmount(holdStep, frame.parallaxAmount, frame.focusPulse ?? 0);
        } else {
        const textureStep =
          loopBridgeMs > 0 && resolved.bridgeElapsed >= loopBridgeMs * 0.82
            ? 0
            : resolved.lastStep;
        const frame = computePresentationLoopBridgeFrame(
          effectivePresentationEffect,
          resolved.bridgeElapsed,
          loopBridgeMs,
          resolved.lastStep,
          {
            cubeRotationMode: cubeSettings.cubeRotationMode,
            motionSeed,
            fanTimelineProfile: "wedding_default",
            fanSpeed: cubeSettings.fanSpeed,
            cubeShowcaseFx,
          }
        );
        if (!dragControls.applyDragRotation(presentation.root)) {
          applyRootMotion(frame, resolved.lastStep, deltaMs, "loop_bridge");
        }
        if (textureStep !== appliedStep) {
          presentation.applyStepTexture(textureStep);
          if (presentationCount > 6) {
            presentation.resetTextureCarousel?.();
          }
          scheduleUiStepUpdate(textureStep + 1);
          appliedStep = textureStep;
        }
        if (hologramMode && !recordingRef.current) {
          applyHologramPreviewScale(presentation.root);
        }
        presentation.setVoluMaxFx(
          cubeSettings.voluMaxFxEnabled && hologramMode,
          cubeSettings.voluMaxFxIntensity
        );
        presentation.setCs5Fx(
          hologramMode ? cs5FxOptionsFromSettings(cubeSettings) : null
        );
        camera.position.x = 0;
        camera.position.y = 0;
        camera.position.z = frame.cameraZ;
        camera.fov = frame.fieldOfView;
        camera.updateProjectionMatrix();
        aimCameraAtCubeOrigin(camera);
        presentation.setParallaxAmount(resolved.lastStep, 0);
        if (effectivePresentationEffect === "cube_focus" && presentation.updateFaceCaptions) {
          presentation.updateFaceCaptions(resolved.lastStep, "approach", 0);
        }
        }
      } else {
        const { step, stepElapsed } = resolved;
        const currentFace = getPresentationFace(step);
        tFrame0 = slowFrameProfileEnabled ? performance.now() : null;
        const stepTiming = getStepPhaseTiming(
        motionSeed,
        step,
        ZOOM_MS,
        PARALLAX_MS,
        effectivePresentationEffect,
        presentationCount
      );
        const stepVariety = getStepMotionVariety(motionSeed, step);

        const fanPhase =
          effectivePresentationEffect === "cube_focus"
            ? resolveFanPhase(step, stepElapsed, "wedding_default", cubeSettings.fanSpeed)
            : null;
        const textureStep = resolveCubeFocusTextureStep(
          effectivePresentationEffect,
          isExportCapture,
          fanPhase,
          step,
          cubeShowcaseFx.cubeShowcaseZoomEnabled
        );

        const stepCenter = orderedImages[step]?.center;
        const frame = computePresentationFrame(
          effectivePresentationEffect,
          step,
          stepElapsed,
          presentationCount,
          currentFace,
          {
            timing: stepTiming,
            variety: stepVariety,
            imageCenter: hologramMode ? { x: 50, y: 50 } : stepCenter,
            cubeRotationMode: cubeSettings.cubeRotationMode,
            exportRecording: isExportCapture,
            motionSeed,
            hologramMode,
            fanTimelineProfile: "wedding_default",
            fanSpeed: cubeSettings.fanSpeed,
            cubeShowcaseFx,
          }
        );
        tFrame1 = slowFrameProfileEnabled ? performance.now() : null;
        if (!dragControls.applyDragRotation(presentation.root)) {
          applyRootMotion(frame, step, deltaMs, fanPhase?.phase);
        }
        if (textureStep !== appliedStep) {
          const t0 = performance.now();
          presentation.applyStepTexture(textureStep);
          const t1 = performance.now();
          if (presentationCount > 6) {
            presentation.resetTextureCarousel?.();
          }
          scheduleUiStepUpdate(step + 1);
          appliedStep = textureStep;
          if (
            import.meta.env.DEV &&
            (isSlowFrame || t1 - t0 > 6) &&
            now - lastSlowLogAt > 250
          ) {
            lastSlowLogAt = now;
            const gpu = gpuTimer?.snapshot() ?? null;
            // Highest-signal hitch telemetry for debugging step seams.
            console.warn("[CubeView][hitch]", {
              deltaMs: Math.round(deltaMs * 100) / 100,
              applyStepTextureMs: Math.round((t1 - t0) * 100) / 100,
              visibility: typeof document !== "undefined" ? document.visibilityState : "unknown",
              hasFocus: typeof document !== "undefined" ? document.hasFocus?.() ?? null : null,
              scrollY: typeof window !== "undefined" ? window.scrollY : null,
              gpu,
              step,
              stepElapsed,
              textureStep,
              fanPhase: fanPhase ? { phase: fanPhase.phase, u: fanPhase.phaseU } : null,
              zoom: cubeShowcaseFx.cubeShowcaseZoomEnabled,
              complexRot: cubeShowcaseFx.cubeComplexRotationEnabled,
              scaleSpin: cubeShowcaseFx.cubeScaleCoupledSpinEnabled,
              subjectPull: cubeShowcaseFx.cubeSubjectPullEnabled,
            });
          }
        }
        if (hologramMode && !recordingRef.current) {
          applyHologramPreviewScale(presentation.root);
        }
        presentation.setVoluMaxFx(
          cubeSettings.voluMaxFxEnabled && hologramMode,
          cubeSettings.voluMaxFxIntensity
        );
        presentation.setCs5Fx(
          hologramMode ? cs5FxOptionsFromSettings(cubeSettings) : null
        );
        camera.position.x = frame.cameraOffsetX ?? 0;
        camera.position.y = frame.cameraOffsetY ?? 0;
        camera.position.z = frame.cameraZ;
        camera.fov = frame.fieldOfView;
        camera.updateProjectionMatrix();
        aimCameraAtCubeOrigin(camera);
        presentation.setParallaxAmount(step, frame.parallaxAmount, frame.focusPulse ?? 0);
        if (effectivePresentationEffect === "cube_focus" && presentation.updateFaceCaptions && fanPhase) {
          presentation.updateFaceCaptions(step, fanPhase.phase, fanPhase.phaseU);
        }
      }
      if (
        effectivePresentationEffect === "cube_focus" &&
        presentation.updateTextureCarousel &&
        dragControls.isDragging
      ) {
        presentation.updateTextureCarousel(presentation.root.rotation.y);
      }
      if (!isExportCapture) {
        presentation.updateRotationParallax?.(
          presentation.root.rotation.y,
          presentation.root.rotation.x
        );
      }
      // VoluMax mesh parallax is face-local + timeline-gated; extra rotation coupling misaligns photos from frame.
      presentation.setGradientShift(
        getGradientShift(elapsed),
        cubeSettings.gradientColorCycle,
        cubeSettings.customFrameColor
      );


      microModuleHost.render(renderer, scene, camera);
      gpuTimer?.endFrame();
      const tRender1 = slowFrameProfileEnabled ? performance.now() : 0;
      if (recordingRef.current) {
        renderer.getContext().finish();
      }
      if (slowFrameProfileEnabled && import.meta.env.DEV && now - lastSlowFrameLogAt > 250) {
        lastSlowFrameLogAt = now;
        console.warn("[CubeView][slow-frame]", {
          deltaMs: Math.round(deltaMs * 100) / 100,
          visibility: typeof document !== "undefined" ? document.visibilityState : "unknown",
          hasFocus: typeof document !== "undefined" ? document.hasFocus?.() ?? null : null,
          scrollY: typeof window !== "undefined" ? window.scrollY : null,
          particlesMs: Math.round((tParticles1 - tParticles0) * 100) / 100,
          modulesUpdateMs: Math.round((tModules1 - tParticles1) * 100) / 100,
          timelineResolveMs: Math.round((tTimeline1 - tModules1) * 100) / 100,
          frameComputeMs:
            tFrame0 !== null && tFrame1 !== null
              ? Math.round((tFrame1 - tFrame0) * 100) / 100
              : null,
          renderMs: Math.round((tRender1 - tTimeline1) * 100) / 100,
          totalProfileMs: Math.round((tRender1 - slowFrameT0) * 100) / 100,
        });
      }
      requestRef.current = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      syncLayout();
      const size = previewMicroModuleLayoutSize(container);
      microModuleHost.resize(size, size);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener("resize", handleResize);
    requestRef.current = requestAnimationFrame(animate);

    void (async () => {
      setIsSceneLoading(true);
      try {
        let imagesForScene = orderedImages;
        if (imagesForScene.some((image) => !image.backgroundPlateUrl)) {
          imagesForScene = await ensureBackgroundPlatesForCube(
            imagesForScene,
            cubeSettings.backgroundPlateTheme
          );
          if (!cancelled && onProcessedImagesChange) {
            const plateById = new Map(imagesForScene.map((image) => [image.id, image]));
            onProcessedImagesChange(
              processedImages.map((image) => plateById.get(image.id) ?? image)
            );
          }
        }
        if (cancelled) {
          return;
        }
        const snapshot = await loadPresentationTextureSet(
          imagesForScene,
          cubeSettings.voluMaxDepthEnabled
        );
        if (cancelled) {
          disposePresentationTextureSnapshot(snapshot);
          return;
        }
        texturesRef.current = snapshot;
        applyPresentationTextureSampling(snapshot, renderer);
        presentation = createPresentationScene(
          effectivePresentationEffect,
          imagesForScene,
          snapshot.textures,
          snapshot.plateTextures,
          cubeSettings.framePresetId,
          hologramMode,
          cubeSettings.particleTheme,
          cubeSettings.voluMaxDepthEnabled,
          snapshot.subjectForegroundTextures,
          camera,
          cubeSettings.microModules.orbitalShapeId
        );
        presentationRef.current = presentation;
        if (import.meta.env.DEV && typeof window !== "undefined") {
          const sceneRef = presentation;
          (
            window as unknown as {
              __mboxCubeFaceAudit?: () => ReturnType<
                NonNullable<typeof sceneRef.auditFaceIntegrity>
              >;
            }
          ).__mboxCubeFaceAudit = () => sceneRef.auditFaceIntegrity?.() ?? {
            ok: false,
            faceCount: 0,
            expectedFaces: 6,
            entries: [],
            issueCount: 1,
          };
        }
        scene.add(presentation.root);
        microModuleHost.applySettings(moduleHostOptions());
        presentation.refreshFaceTextures?.();
        presentation.setVoluMaxFx(
          cubeSettings.voluMaxFxEnabled && hologramMode,
          cubeSettings.voluMaxFxIntensity
        );
        presentation.setCs5Fx(
          hologramMode ? cs5FxOptionsFromSettings(cubeSettings) : null
        );
        if (effectivePresentationEffect === "cube_focus") {
          presentation.resetTextureCarousel?.();
        }
        presentation.setFrameBorderWidth(cubeSettings.frameBorderWidth);
        presentation.setFrameFinish(cubeSettings.frameFinishId);
        presentation.setCubeSizeScale(cubeSettings.cubeSizeScale);
        timelineStartRef.current = performance.now();

        // Warm textures/materials on the GPU to avoid a hitch the first time a new step's
        // photo becomes active (texture upload + shader compile can stall a frame).
        // Spread the warmup across RAF ticks so we don't create a single long freeze.
        if (!recordingRef.current && !exportPipelineActiveRef.current) {
          try {
            // Warm as many steps as reasonable so carousel swaps don't hitch later.
            // Cap to keep worst-case startup bounded.
            const warmupSteps = Math.min(presentationCount, 60);
            aimCameraAtCubeOrigin(camera);
            // Ensure a baseline compile happens before step-by-step warmup.
            renderer.compile(scene, camera);
            for (let step = 0; step < warmupSteps; step += 1) {
              if (cancelled) {
                break;
              }
              presentation.applyStepTexture(step);
              renderer.render(scene, camera);
              // Let the browser breathe between uploads/compiles.
              // eslint-disable-next-line no-await-in-loop
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            }
            if (!cancelled) {
              presentation.applyStepTexture(0);
            }
          } catch {
            // Best-effort only; warmup should never block scene startup.
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[CubeView] presentation textures failed:", error);
        setRecordingMessage(`큐브 연출 로드 실패: ${message}`);
      } finally {
        if (!cancelled) {
          setIsSceneLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      setIsSceneLoading(false);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      perfObserverRef.current?.disconnect();
      perfObserverRef.current = null;
      gpuTimer?.dispose();
      if (pendingUiStepRaf !== null) {
        cancelAnimationFrame(pendingUiStepRaf);
      }
      dragControls.dispose();
      presentationRef.current = null;
      if (presentation) {
        presentation.dispose();
      }
      microModuleHost.dispose();
      viewportBackdropRef.current?.dispose();
      viewportBackdropRef.current = null;
      disposePresentationTextureSnapshot(texturesRef.current);
      disposeCubeRenderer(container, renderer);
      rendererRef.current = null;
      sceneRuntimeRef.current = null;
      texturesRef.current = null;
    };
  }, [
    active,
    cubeSceneContentKey,
    motionSeed,
    presentationCount,
    contentDurationMs,
    loopBridgeMs,
    presentationDurationMs,
    presentationKey,
    segmentMsByStep,
    selectedEffect,
    effectivePresentationEffect,
    cubeSettings.particleTheme,
    cubeSettings.cubeRotationMode,
    cubeSettings.fanSpeed,
    cubeShowcaseFx,
    cubeSettings.cubeAngularInertiaEnabled,
    cubeSettings.voluMaxDepthEnabled,
    cubeSettings.backgroundPlateTheme,
    cubeSettings.voluMaxFxEnabled,
    cubeSettings.voluMaxFxIntensity,
    cubeSettings.microModules.galaxyBackground,
    cubeSettings.microModules.orbitalShowcase,
    cubeSettings.microModules.orbitalShapeId,
    cubeSettings.microModules.hologramFresnelRim,
    cubeSettings.microModules.selectiveBloom,
    orderedImages,
    processedImages,
    onProcessedImagesChange,
  ]);

  const handleApplyPresentation = () => {
    if (presentationCount === 0 || isRecording) {
      return;
    }
    setPresentationKey((value) => value + 1);
    setRecordingMessage("선택한 템플릿으로 연출을 처음부터 다시 적용했습니다.");
    window.setTimeout(() => setRecordingMessage(""), 4000);
  };

  const handleEnhanceResolution = async () => {
    if (!onProcessedImagesChange || processedImages.length === 0 || isEnhancingResolution) {
      return;
    }
    setIsEnhancingResolution(true);
    setRecordingMessage("보관함 해상도 2× 향상 중...");
    try {
      const updated = await applyResolutionEnhanceBatch(processedImages, {
        scale: 2,
        onProgress: (_current, _total, message) => setRecordingMessage(message),
      });
      onProcessedImagesChange(updated);
      setPresentationKey((value) => value + 1);
      setRecordingMessage("해상도 향상이 완료되었습니다. 연출을 다시 적용해 주세요.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setRecordingMessage(`해상도 향상 실패: ${message}`);
    } finally {
      setIsEnhancingResolution(false);
      window.setTimeout(() => setRecordingMessage(""), 6_000);
    }
  };

  const handleDownloadVideo = async () => {
    const runtime = sceneRuntimeRef.current;
    if (!runtime || presentationCount === 0 || isRecording) {
      return;
    }
    const { renderer, camera, container, scene } = runtime;

    const recordDurationMs = resolveRecordDurationMs(contentDurationMs);
    const maxEnhanceScale = processedImages.some((img) => img.resolutionEnhanceScale === 2) ? 2 : 1;
    const exportSize = resolveCubeExportPixelSize("standard", maxEnhanceScale);
    const layout = snapshotRendererLayout(renderer, camera);

    const bgmUrl =
      cubeSettings.bgmEnabled && cubeSettings.bgmTrackId !== "none"
        ? resolveBgmSource(
            cubeSettings.bgmTrackId,
            cubeSettings.bgmCustomUrl,
            cubeSettings.bgmWorkspacePath
          )
        : null;
    const withAudio = Boolean(bgmUrl) && !window.__MBOX_E2E_EXPORT__;

    setIsRecording(true);
    setRecordingMessage(
      withAudio
        ? `연출 안정화 후 MP4 + BGM 합성 중 (${exportSize}px)...`
        : `연출 안정화 후 ${exportSize}px MP4 생성 중...`
    );

    let bgmSession: Awaited<ReturnType<typeof startBgmRecordingSession>> | null = null;

    try {
      exportPipelineActiveRef.current = true;
      exportFrameIndexRef.current = 0;
      await prepareCubeRecordingExport({
        renderer,
        camera,
        scene,
        exportSize,
        presentation: presentationRef.current,
        texturesSnapshot: texturesRef.current,
        onLayoutResized: () => {
          // applyExportRendererSize is wrapped inside prepareCubeRecordingExport; syncLayout(exportSize) is called here:
          microModuleHostRef.current.syncLayout(exportSize, exportSize, buildMicroModuleHostOptions({
            scene,
            camera,
            renderer,
            cubeSettings,
            getPresentationRoot: () => presentationRef.current?.root ?? null,
          }));
        },
      });

      const { mimeType, extension } = resolveRecordingMimeType({ withAudio });
      const recorder = new CubeVideoRecorder();
      const videoStream = createCubeRecordingVideoStream(renderer);
      if (withAudio && bgmUrl) {
        bgmSession = await startBgmRecordingSession({
          videoStream,
          audioUrl: bgmUrl,
          durationMs: recordDurationMs,
          volume: cubeSettings.bgmVolume,
        });
      }
      const recordStream = bgmSession?.compositeStream ?? videoStream;

      timelineStartRef.current = performance.now();
      exportFrameIndexRef.current = 0;
      recordingRef.current = true;
      recorder.start(recordStream, mimeType, resolveVideoBitsPerSecond(exportSize));

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, recordDurationMs);
      });

      let blob = normalizeRecordingBlob(await recorder.stop(), extension);
      bgmSession?.stop();

      let outExtension = extension;
      if (extension === "mp4" && !(await looksLikeIsoMp4(blob))) {
        outExtension = "webm";
        blob = normalizeRecordingBlob(blob, "webm");
      }
      const suffix = withAudio ? "-bgm" : "";
      downloadBlob(blob, `mbox-cube_focus${suffix}.${outExtension}`);
      setRecordingMessage(
        withAudio
          ? `BGM이 합성된 ${exportSize}px MP4가 준비되었습니다.`
          : extension === "mp4"
            ? `${exportSize}px MP4 생성 파일이 준비되었습니다.`
            : "브라우저가 MP4를 지원하지 않아 WebM으로 저장했습니다."
      );
    } catch (error) {
      bgmSession?.stop();
      const message = error instanceof Error ? error.message : "Unknown error";
      setRecordingMessage(`영상 저장에 실패했습니다: ${message}`);
    } finally {
      recordingRef.current = false;
      exportPipelineActiveRef.current = false;
      endCubeRecordingExport(presentationRef.current);
      restoreRendererLayout(renderer, camera, container, layout);
      syncRendererToContainer(renderer, camera, container);
      const previewSize = previewMicroModuleLayoutSize(container);
      microModuleHostRef.current.syncLayout(
        previewSize,
        previewSize,
        buildMicroModuleHostOptions({
          scene,
          camera,
          renderer,
          cubeSettings,
          getPresentationRoot: () => presentationRef.current?.root ?? null,
        })
      );
      setIsRecording(false);
    }
  };

  const effectOptions = useMemo(
    () =>
      PRESENTATION_EFFECTS.map((effect) => ({
        id: effect.id,
        label: effect.label,
        description: effect.moodLabel,
      })),
    []
  );
  const settingsDisabled = isRecording || isEnhancingResolution;
  const frameSummary = `${framePreset.label} · ${cubeSettings.frameFinishId === "none" ? "테두리 없음" : cubeSettings.frameFinishId === "wood" ? "우드" : "광택"}`;
  const voluMaxSummary = cubeSettings.voluMaxDepthEnabled ? "VoluMax ON" : "VoluMax OFF";

  return (
    <div className="lg:col-span-12 space-y-3">
      <div className="flex items-center gap-2 text-mbox-gold">
        <Box size={20} />
        <h2 className="font-bold text-mbox-text">3D 큐브 미리보기</h2>
      </div>

      <div className="mbox-card p-3">
        <div className="cube-preview-viewport relative mx-auto w-full max-w-[640px]">
          <div
            ref={cubeContainerRef}
            className="cube-canvas-mount cursor-grab rounded-xl active:cursor-grabbing"
          />

        {presentationCount === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl px-8 text-center">
            {!workspaceReady ? (
              <>
                <p className="text-lg font-bold text-mbox-text">보관함 불러오는 중…</p>
                <p className="max-w-md text-sm leading-relaxed text-mbox-muted">
                  이벤트 보관함(IndexedDB)에서 처리된 사진을 읽고 있습니다.
                </p>
              </>
            ) : processedImages.length > 0 ? (
              <>
                <p className="text-lg font-bold text-amber-300">연출용 용량 한도로 큐브를 표시할 수 없습니다</p>
                <p className="max-w-md text-sm leading-relaxed text-mbox-muted">
                  갤러리 {processedImages.length}장 중 1GB 한도에 맞는 장면이 없습니다. 이미지 수를 줄이거나 해상도를
                  낮춰 주세요.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-amber-300">큐브를 보려면 사진이 필요합니다</p>
                <p className="max-w-md text-sm leading-relaxed text-mbox-muted">
                  <span className="text-mbox-text">프로세싱</span> 탭에서 이미지를 업로드·처리한 뒤 다시{" "}
                  <span className="text-mbox-text">3D 큐브</span> 탭으로 오세요. (최소 1장)
                </p>
              </>
            )}
            {processedImages.length > 0 && omittedCount > 0 ? (
              <p className="text-xs text-amber-400/90">
                {processedImages.length}장 중 {omittedCount}장은 1GB 한도로 연출에서 제외되었습니다.
              </p>
            ) : null}
          </div>
        ) : null}

        {presentationCount > 0 && isSceneLoading ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-[1px]">
            <p className="text-sm font-semibold text-mbox-text">큐브 연출 로딩 중… ({presentationCount}장)</p>
          </div>
        ) : null}

        {presentationCount > 0 &&
        !isSceneLoading &&
        recordingMessage.startsWith("큐브 연출 로드 실패") ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-black/50 px-6 text-center">
            <p className="text-sm font-semibold text-mbox-gold">{recordingMessage}</p>
            <p className="text-xs text-mbox-muted">새로고침 후에도 반복되면 프로세싱 탭에서 이미지를 다시 처리해 보세요.</p>
          </div>
        ) : null}

        {presentationCount > 0 ? (
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-end justify-between gap-2">
            <p className="rounded-lg bg-black/55 px-3 py-1.5 text-xs text-mbox-muted backdrop-blur-sm">
              {selectedEffectMeta?.label ?? "연출"} · {currentStep}/{presentationCount} ·{" "}
              {formatPresentationDurationMs(presentationDurationMs)}
            </p>
            {recordingMessage ? (
              <p className="max-w-md rounded-lg bg-black/55 px-3 py-1.5 text-xs text-mbox-gold backdrop-blur-sm">
                {recordingMessage}
              </p>
            ) : null}
          </div>
        ) : null}
        </div>
      </div>

      <div className="mbox-card space-y-3 p-3">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,140px)_auto_auto] lg:items-start">
          <CollapsibleOptionSelect
            label="연출"
            value={selectedEffect}
            options={effectOptions}
            onChange={(id) => handleSelectEffect(id)}
            disabled={settingsDisabled}
          />
          <FrameSettingsControls
            value={{
              framePresetId: cubeSettings.framePresetId,
              frameFinishId: cubeSettings.frameFinishId,
              frameBorderWidth: cubeSettings.frameBorderWidth,
              customFrameColor: cubeSettings.customFrameColor,
              gradientColorCycle: cubeSettings.gradientColorCycle,
            }}
            onChange={(patch) => setCubeSettings((prev) => ({ ...prev, ...patch }))}
            disabled={settingsDisabled}
          />
          <CubeSizeControl
            compact
            value={cubeSettings.cubeSizeScale}
            disabled={settingsDisabled}
            onChange={(cubeSizeScale) =>
              setCubeSettings((prev) => ({ ...prev, cubeSizeScale }))
            }
          />
          <label
            className={`inline-flex h-[42px] cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition ${
              cubeSettings.voluMaxDepthEnabled
                ? "border-mbox-gold/45 bg-mbox-gold/15 text-mbox-gold"
                : "border-[rgba(223,179,134,0.18)] bg-[rgba(18,14,24,0.55)] text-mbox-muted hover:border-mbox-gold/30"
            } ${settingsDisabled ? "cursor-not-allowed opacity-50" : ""}`}
            title="VoluMax 인물·배경 분리 (showcase 시차)"
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={cubeSettings.voluMaxDepthEnabled}
              disabled={settingsDisabled}
              onChange={(event) =>
                setCubeSettings((prev) => ({
                  ...prev,
                  ...patchVoluMaxDepthEnabled(event.target.checked),
                }))
              }
            />
            <Layers size={14} className="shrink-0" />
            VoluMax
          </label>
          <button
            type="button"
            disabled={presentationCount === 0 || isRecording}
            onClick={handleApplyPresentation}
            className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl border border-mbox-gold/40 bg-mbox-gold/10 px-4 text-sm font-semibold text-mbox-gold transition hover:bg-mbox-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={16} />
            재생
          </button>
          <button
            type="button"
            disabled={presentationCount === 0 || isRecording}
            onClick={handleDownloadVideo}
            className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl border border-mbox-gold/40 bg-mbox-gold px-4 text-sm font-semibold text-[#140f09] transition hover:bg-mbox-gold/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRecording ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
            MP4
          </button>
        </div>

        <CubePhotoStrip
          images={processedImages}
          disabled={settingsDisabled}
          onDelete={onProcessedImagesChange ? handleDeleteImage : undefined}
        />
      </div>

      <CollapsibleSection
        title="상세 설정"
        summary={`${selectedEffectMeta?.label ?? "연출"} · ${voluMaxSummary} · ${frameSummary} · BGM ${cubeSettings.bgmEnabled ? "ON" : "OFF"}`}
        disabled={settingsDisabled}
      >
        <CubeFocusPanel
          hideFrameSection
          settings={cubeSettings}
          presentationEffectId={selectedEffect}
          onSettingsChange={setCubeSettings}
          disabled={settingsDisabled}
          isEnhancingResolution={isEnhancingResolution}
          enhancedCount={enhancedCount}
          totalCount={processedImages.length}
          onEnhanceResolution={handleEnhanceResolution}
          isPreparingPlates={isPreparingPlates}
          preparedVoluMaxFaceCount={voluMaxLayerCount}
          voluMaxReadiness={voluMaxReadiness}
          onPrepareVoluMaxLayers={
            onProcessedImagesChange ? () => runPresentationPrepare(processedImages) : undefined
          }
          onVoluMaxOneClickSetup={
            onProcessedImagesChange ? runVoluMaxOneClickSetup : undefined
          }
        />
      </CollapsibleSection>

      {presentationCount > 0 && onProcessedImagesChange ? (
        <CollapsibleSection title="쇼케이스 자막" summary={`${orderedImages.length}장`}>
          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {orderedImages.map((image, index) => (
              <label key={image.id} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-[10px] font-bold text-mbox-subtle">{index + 1}</span>
                <input
                  type="text"
                  value={image.caption ?? ""}
                  maxLength={48}
                  disabled={isRecording}
                  placeholder="자막 입력"
                  onChange={(event) => handleCaptionChange(image.id, event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-[rgba(223,179,134,0.18)] bg-[rgba(18,14,24,0.75)] px-2.5 py-1.5 text-xs text-mbox-text placeholder:text-mbox-subtle/80 focus:border-mbox-gold focus:outline-none focus:ring-1 focus:ring-mbox-gold/30 disabled:opacity-50"
                />
              </label>
            ))}
          </div>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
