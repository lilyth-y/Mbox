import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload as UploadIcon,
  Download as DownloadIcon,
  Loader2,
  Sparkles,
  Trash2,
  RotateCcw,
  Flame,
  ArrowRight,
  Heart,
  Play,
  Image as ImageIcon,
  Type,
} from "lucide-react";
import * as THREE from "three";
import type { ProcessedImage } from "../../shared/types";
import { PARALLAX_MS, ZOOM_MS, getPresentationFace } from "../cube/cubeSequence";
import type { PresentationEffectId } from "../cube/presentationEffects";
import { PRESENTATION_EFFECTS } from "../cube/presentationEffects";
import {
  createPresentationMotionSeed,
  getLoopBridgeMs,
  getStepMotionVariety,
  getStepPhaseTiming,
  getStepSegmentMs,
  resolvePresentationTimeline,
  sumSegmentDurations,
} from "../cube/cubeMotionVariety";
import { computePresentationFrame, computePresentationLoopBridgeFrame } from "../cube/presentationFrame";
import { resolveFanPhase, type FanTimelineProfile } from "../cube/fan";
import {
  applyCubeFocusFrameToRoot,
  resolveCubeFocusTextureStep,
} from "../cube/cubeFocusMotionApply";
import { createCubeDragControls } from "../cube/cubeDragControls";
import { getGradientShift } from "../cube/presentationGradient";
import {
  aimCameraAtCubeOrigin,
  applyHologramPreviewScale,
  clearCubeMount,
  disposeCubeRenderer,
  syncRendererToContainer,
} from "../cube/cubeSceneLifecycle";
import { createPresentationScene } from "../cube/presentationScene";
import { cs5FxOptionsFromSettings } from "../cube/cs5Fx";
import { FrameSettingsControls } from "../cube/FrameSettingsControls";
import { CubeSizeControl } from "../cube/CubeSizeControl";
import { resolveBgmSource } from "../cube/bgm/bgmTracks";
import { startBgmRecordingSession } from "../cube/bgm/compositeStreamWithBgm";
import {
  CubeVideoRecorder,
  downloadBlob,
  looksLikeIsoMp4,
  normalizeRecordingBlob,
  resolveRecordingMimeType,
} from "../cube/cubeRecorder";
import {
  createCubeRecordingVideoStream,
  endCubeRecordingExport,
  prepareCubeRecordingExport,
  resolveRecordDurationMs,
  restoreRendererLayout,
  resolveCubeExportPixelSize,
  resolveVideoBitsPerSecond,
  snapshotRendererLayout,
  type CubeExportQuality,
  type PresentationTextureSnapshot,
} from "../cube/cubeExportCapture";
import { resolveExportMotionElapsedMs } from "../cube/fanExportRotation";
import { applyResolutionEnhanceBatch } from "../processing/applyResolutionEnhance";
import { processUploadedImages } from "../processing/processImage";
import { applyPresentationPrepareBatch, ensureBackgroundPlatesForCube } from "../processing/applyPresentationPrepare";
import { applyBackgroundRemovalBatch } from "../processing/applyBackgroundRemoval";
import {
  regenerateBackgroundPlates,
  WEDDING_BACKGROUND_THEMES,
  type BackgroundPlateTheme,
} from "../../shared/lib/backgroundPlate";
import type { MediaComboPreset, MediaComboPresetPatch } from "@mbox/shared";
import { MediaSection } from "../cube/media/MediaSection";
import { VoluMaxStatusHeader } from "../cube/media/VoluMaxStatusHeader";
import { isVoluMaxCutoutReady, resolveCubeShowcaseFx } from "@mbox/shared";
import { summarizeVoluMaxReadiness } from "../../shared/lib/voluMaxReadiness";
import { mountViewportBackdrop, type ViewportBackdropBinding } from "../cube/viewportBackdrop";
import type { PresentationScene } from "../cube/presentationScene";
import {
  applyPresentationTextureSampling,
  disposePresentationTextureSnapshot,
  loadPresentationTextureSet,
} from "../cube/presentationTextures";
import { DEFAULT_CUBE_FOCUS_SETTINGS, type CubeFocusSettings } from "../cube/CubeFocusPanel";
import { CubeShowcaseStepsControls } from "../cube/CubeShowcaseStepsControls";

// Import local premium styles
import "./simple-style.css";

export interface WeddingSimpleDashboardProps {
  active: boolean;
}

export function WeddingSimpleDashboard({ active }: WeddingSimpleDashboardProps) {
  // Simplifies interaction steps:
  // 1: Upload photos
  // 2: AI processing
  // 3: Customization & Video Export
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceImages, setSourceImages] = useState<string[]>([]);
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [processingStatus, setProcessingStatus] = useState("");
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState("");
  const [backgroundTheme, setBackgroundTheme] = useState<BackgroundPlateTheme>("original");
  const [isCompositingBackground, setIsCompositingBackground] = useState(false);
  const [isPreparingPlates, setIsPreparingPlates] = useState(false);
  const [exportQuality, setExportQuality] = useState<CubeExportQuality>("standard");
  const [isEnhancingResolution, setIsEnhancingResolution] = useState(false);
  const [presentationEffectId, setPresentationEffectId] = useState<PresentationEffectId>("cube_focus");
  const [applyBackgroundRemoval, setApplyBackgroundRemoval] = useState(false);
  const [activeComboPresetId, setActiveComboPresetId] = useState<string | null>(null);

  /** Matches `public/wedding-simple/fanMotion.js` — arc transitions + approach/retreat spin. */
  const WEDDING_FAN_PROFILE: FanTimelineProfile = "wedding_default";

  const [cubeSettings, setCubeSettings] = useState<CubeFocusSettings>({
    ...DEFAULT_CUBE_FOCUS_SETTINGS,
    bgmEnabled: true,
    bgmTrackId: "piano_slideshow",
    bgmVolume: 0.85,
    cubeRotationMode: "auto",
    gradientColorCycle: true,
    /** Simple 워크플로는 원본+VoluMax 레이어 준비가 기본 */
    voluMaxDepthEnabled: true,
    voluMaxAiForegroundCutout: true,
    cubeSubjectPullEnabled: true,
  });
  const fanSpeed = cubeSettings.fanSpeed;
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

  const cubeContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const requestRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const exportPipelineActiveRef = useRef(false);
  const exportFrameIndexRef = useRef(0);
  const timelineStartRef = useRef(performance.now());
  const presentationRef = useRef<PresentationScene | null>(null);
  const presentationTexturesRef = useRef<PresentationTextureSnapshot | null>(null);
  const sceneRuntimeRef = useRef<{
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    container: HTMLDivElement;
  } | null>(null);
  const viewportBackdropRef = useRef<ViewportBackdropBinding | null>(null);

  const orderedImages = useMemo(() => processedImages.slice(0, 20), [processedImages]);

  const handleCustomBgm = (file: File | null) => {
    setCubeSettings((prev) => {
      if (prev.bgmCustomUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(prev.bgmCustomUrl);
      }
      if (!file) {
        return { ...prev, bgmCustomUrl: null, bgmTrackId: "piano_slideshow", bgmWorkspacePath: null };
      }
      return {
        ...prev,
        bgmCustomUrl: URL.createObjectURL(file),
        bgmTrackId: "custom",
        bgmWorkspacePath: null,
        bgmEnabled: true,
      };
    });
  };
  const backgroundPlateSignature = useMemo(
    () => orderedImages.map((img) => img.backgroundPlateUrl ?? "").join("|"),
    [orderedImages]
  );
  const subjectForegroundSignature = useMemo(
    () => orderedImages.map((img) => img.subjectForegroundUrl ?? "").join("|"),
    [orderedImages]
  );
  const voluMaxFaceCount = useMemo(
    () => orderedImages.filter((img) => isVoluMaxCutoutReady(img)).length,
    [orderedImages]
  );
  const voluMaxReadiness = useMemo(
    () => summarizeVoluMaxReadiness(orderedImages),
    [orderedImages]
  );
  const presentationCount = orderedImages.length;
  const motionSeed = useMemo(() => createPresentationMotionSeed(orderedImages, 0), [orderedImages]);

  const segmentMsByStep = useMemo(() =>
    orderedImages.map((_, s) =>
      getStepSegmentMs(
        motionSeed,
        s,
        ZOOM_MS,
        PARALLAX_MS,
        presentationEffectId,
        orderedImages.length,
        WEDDING_FAN_PROFILE,
        fanSpeed
      )
    ), [orderedImages, motionSeed, presentationEffectId, fanSpeed]
  );
  const loopBridgeMs = useMemo(() => getLoopBridgeMs(presentationEffectId, presentationCount), [presentationCount, presentationEffectId]);
  const contentDurationMs = useMemo(() => sumSegmentDurations(segmentMsByStep), [segmentMsByStep]);
  const presentationDurationMs = useMemo(() => contentDurationMs + loopBridgeMs, [contentDurationMs, loopBridgeMs]);
  const captionSignature = useMemo(
    () => orderedImages.map((image) => `${image.id}:${image.caption ?? ""}`).join("|"),
    [orderedImages]
  );

  useEffect(() => {
    presentationRef.current?.updateCaptionTexts?.(
      orderedImages.map((image) => image.caption ?? "")
    );
  }, [captionSignature, orderedImages]);

  const handleCaptionChange = (imageId: number, caption: string) => {
    setProcessedImages((previous) =>
      previous.map((image) => (image.id === imageId ? { ...image, caption } : image))
    );
  };

  // Handle local files selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const imageFiles = files.filter(f => f.type.startsWith("image/"));
    
    Promise.all(
      imageFiles.map(file => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error("파일 읽기 실패"));
        reader.readAsDataURL(file);
      }))
    ).then(urls => {
      setSourceImages(prev => [...prev, ...urls].slice(0, 20));
    });
  };

  const handleRemoveSourceImage = (index: number) => {
    setSourceImages(prev => prev.filter((_, i) => i !== index));
  };

  // 1-Click Process: crop + presentation textures (original background kept)
  const handleAutoProcess = async () => {
    if (sourceImages.length < 3) {
      alert("전시장/식장 연출을 위해 최소 3장 이상의 사진을 업로드해 주세요.");
      return;
    }
    setStep(2);
    setProcessingStatus("AI 원근 분석 및 크롭 진행 중...");
    setProcessingProgress({ current: 0, total: sourceImages.length });

    try {
       // 1. AI Crop & Analyze
       const cropResults = await processUploadedImages(sourceImages, {
         preprocessMode: applyBackgroundRemoval ? "background_removed" : "original",
         onStatus: setProcessingStatus,
         onProgress: (current) => {
           setProcessingProgress(prev => ({ ...prev, current }));
         }
       });
 
       setProcessingStatus(applyBackgroundRemoval ? "연출용 텍스처 준비 중 (인물·배경 분리)..." : "연출용 텍스처 준비 중 (원본 배경 유지)...");
       const preparedResults = applyBackgroundRemoval
         ? await applyBackgroundRemovalBatch(cropResults, {
             onStatus: setProcessingStatus,
             backgroundPlateTheme: backgroundTheme,
             onProgress: (current, total, message) => {
               setProcessingProgress({ current, total, message } as any);
             },
           })
         : await applyPresentationPrepareBatch(cropResults, {
             onStatus: setProcessingStatus,
             backgroundPlateTheme: "original",
             useAiForegroundCutout: cubeSettings.voluMaxAiForegroundCutout,
             onProgress: (current, total) => {
               setProcessingProgress({ current, total, message: "연출용 텍스처 준비 중..." } as any);
             },
           });

      setProcessedImages(preparedResults);
      setStep(3);
    } catch (err) {
      console.error(err);
      alert(`AI 자동 연출 생성 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`);
      setStep(1);
    }
  };

  useEffect(() => {
    if (!active || step < 3 || processedImages.length === 0 || isPreparingPlates) {
      return;
    }
    const needsPlates = processedImages.some((image) => {
      if (image.preprocessMode === "background_removed") {
        return false;
      }
      if (
        !image.backgroundPlateUrl ||
        !image.subjectForegroundUrl ||
        image.backgroundPlateTheme !== backgroundTheme
      ) {
        return true;
      }
      return (
        cubeSettings.voluMaxAiForegroundCutout &&
        image.voluMaxForegroundKind === "soft_matte"
      );
    });
    if (!needsPlates) {
      return;
    }
    let cancelled = false;
    setIsPreparingPlates(true);
    setRecordingMessage("VoluMax 연출용 원본 배경·인물 레이어 준비 중...");
    void applyPresentationPrepareBatch(processedImages, {
      backgroundPlateTheme: backgroundTheme,
      useAiForegroundCutout: cubeSettings.voluMaxAiForegroundCutout,
    })
      .then((prepared) => {
        if (!cancelled) {
          setProcessedImages(prepared);
          setRecordingMessage("원본 배경 플레이트가 준비되었습니다.");
          window.setTimeout(() => setRecordingMessage(""), 4000);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setRecordingMessage(`연출 레이어 준비 실패: ${message}`);
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
    step,
    processedImages,
    isPreparingPlates,
    backgroundTheme,
    cubeSettings.voluMaxAiForegroundCutout,
  ]);

  const handleApplyComboPreset = async (_preset: MediaComboPreset, patch: MediaComboPresetPatch) => {
    if (patch.backgroundPlateTheme && patch.backgroundPlateTheme !== backgroundTheme) {
      await handleBackgroundThemeChange(patch.backgroundPlateTheme);
    }
    if (patch.particleTheme !== undefined) {
      setCubeSettings((prev) => ({
        ...prev,
        particleTheme: patch.particleTheme as CubeFocusSettings["particleTheme"],
      }));
    }
  };

  const handleBackgroundThemeChange = async (theme: BackgroundPlateTheme) => {
    if (processedImages.length === 0 || isCompositingBackground || isRecording) {
      return;
    }
    setBackgroundTheme(theme);
    setIsCompositingBackground(true);
    setRecordingMessage("배경 합성 테마 적용 중...");
    try {
      const updated = await regenerateBackgroundPlates(processedImages, sourceImages, theme);
      setProcessedImages(updated);
    } catch (err) {
      console.error(err);
      alert(`배경 합성 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsCompositingBackground(false);
      setRecordingMessage("");
    }
  };

  // Rendering Loop in Step 3
  useEffect(() => {
    if (step !== 3 || !active || !cubeContainerRef.current || presentationCount === 0) {
      return;
    }

    let cancelled = false;
    const container = cubeContainerRef.current;
    disposeCubeRenderer(container, rendererRef.current);
    clearCubeMount(container);

    const hologramMode = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.z = 5;
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 1.0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    sceneRuntimeRef.current = { scene, renderer, camera, container };
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
    // Size the renderer after the browser has laid out the absolute container.
    // clientWidth/Height may be 0 synchronously when the element is first mounted.
    const initSize = () => syncRendererToContainer(renderer, camera, container);
    initSize();
    requestAnimationFrame(initSize);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const pointLight = new THREE.PointLight(0xffffff, 1.5);
    pointLight.position.set(4, 6, 8);
    scene.add(pointLight);

    let presentation: PresentationScene | null = null;
    let lastTime = performance.now();
    const recordingDuration = presentationDurationMs;
    let appliedStep = -1;
    let timelinePauseAccumMs = 0;
    let dragPauseStartedAt: number | null = null;

    const dragControls = createCubeDragControls(renderer.domElement, {
      enabled: () =>
        presentationEffectId === "cube_focus" &&
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

      if (dragPauseStartedAt !== null) {
        timelinePauseAccumMs += now - dragPauseStartedAt;
        dragPauseStartedAt = now;
      }

      // Update particle physics
      presentation.updateParticles(deltaMs);

      const elapsed = now - timelineStartRef.current - timelinePauseAccumMs;
      const timeline = isExportCapture || recordingDuration <= 0
        ? elapsed
        : elapsed % recordingDuration;
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

      if (resolved.kind === "loop_bridge") {
        const textureStep = loopBridgeMs > 0 && resolved.bridgeElapsed >= loopBridgeMs * 0.82
          ? 0
          : resolved.lastStep;
        const frame = computePresentationLoopBridgeFrame(
          presentationEffectId,
          resolved.bridgeElapsed,
          loopBridgeMs,
          resolved.lastStep,
          {
            cubeRotationMode: cubeSettings.cubeRotationMode,
            motionSeed,
            fanTimelineProfile: WEDDING_FAN_PROFILE,
            fanSpeed,
            cubeShowcaseFx,
          }
        );
        if (!dragControls.applyDragRotation(presentation.root)) {
          frame.applyRootTransform(presentation.root, resolved.lastStep, presentationCount);
        }
        if (textureStep !== appliedStep) {
          presentation.applyStepTexture(textureStep);
          if (presentationCount > 6) {
            presentation.resetTextureCarousel?.();
          }
          appliedStep = textureStep;
        }
        if (hologramMode && !recordingRef.current) {
          applyHologramPreviewScale(presentation.root);
        }
        camera.position.x = 0;
        camera.position.y = 0;
        camera.position.z = frame.cameraZ;
        camera.fov = frame.fieldOfView;
        camera.updateProjectionMatrix();
        aimCameraAtCubeOrigin(camera);
        presentation.setParallaxAmount(resolved.lastStep, 0);
        if (presentationEffectId === "cube_focus" && presentation.updateFaceCaptions) {
          presentation.updateFaceCaptions(resolved.lastStep, "approach", 0);
        }
      } else {
        const { step: curS, stepElapsed } = resolved;
        const currentFace = getPresentationFace(curS);
        const stepTiming = getStepPhaseTiming(motionSeed, curS, ZOOM_MS, PARALLAX_MS, presentationEffectId, presentationCount);
        const stepVariety = getStepMotionVariety(motionSeed, curS);

        const fanPhase = resolveFanPhase(curS, stepElapsed, WEDDING_FAN_PROFILE, fanSpeed);
        const textureStep = resolveCubeFocusTextureStep(
          presentationEffectId,
          isExportCapture,
          fanPhase,
          curS,
          cubeSettings.cubeShowcaseZoomEnabled
        );

        const frame = computePresentationFrame(presentationEffectId, curS, stepElapsed, presentationCount, currentFace, {
          timing: stepTiming,
          variety: stepVariety,
          imageCenter: hologramMode
            ? { x: 50, y: 50 }
            : orderedImages[curS]?.center,
          cubeRotationMode: cubeSettings.cubeRotationMode,
          exportRecording: isExportCapture,
          motionSeed,
          fanTimelineProfile: WEDDING_FAN_PROFILE,
          fanSpeed,
          hologramMode,
          cubeShowcaseFx,
        });
        if (!dragControls.applyDragRotation(presentation.root)) {
          applyCubeFocusFrameToRoot(frame, presentation.root, curS, presentationCount, {
            zoomEnabled: cubeSettings.cubeShowcaseZoomEnabled,
            recording: isExportCapture,
          });
        }
        if (textureStep !== appliedStep) {
          presentation.applyStepTexture(textureStep);
          if (presentationCount > 6) {
            presentation.resetTextureCarousel?.();
          }
          appliedStep = textureStep;
        }
        if (hologramMode && !recordingRef.current) {
          applyHologramPreviewScale(presentation.root);
        }
        camera.position.x = frame.cameraOffsetX ?? 0;
        camera.position.y = frame.cameraOffsetY ?? 0;
        camera.position.z = frame.cameraZ;
        camera.fov = frame.fieldOfView;
        camera.updateProjectionMatrix();
        aimCameraAtCubeOrigin(camera);
        presentation.setParallaxAmount(curS, frame.parallaxAmount, frame.focusPulse ?? 0);
        if (presentationEffectId === "cube_focus" && presentation.updateFaceCaptions) {
          presentation.updateFaceCaptions(curS, fanPhase.phase, fanPhase.phaseU);
        }
      }
      if (presentation.updateTextureCarousel && dragControls.isDragging) {
        presentation.updateTextureCarousel(presentation.root.rotation.y);
      }
      if (!isExportCapture) {
        presentation.updateRotationParallax?.(
          presentation.root.rotation.y,
          presentation.root.rotation.x
        );
      }
      presentation.setGradientShift(
        getGradientShift(elapsed),
        cubeSettings.gradientColorCycle,
        cubeSettings.customFrameColor
      );

      renderer.render(scene, camera);
      if (recordingRef.current) {
        renderer.getContext().finish();
      }
      requestRef.current = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      syncRendererToContainer(renderer, camera, container);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener("resize", handleResize);
    requestRef.current = requestAnimationFrame(animate);

    void (async () => {
      try {
        let imagesForScene = orderedImages;
        if (imagesForScene.some((image) => !image.backgroundPlateUrl)) {
          imagesForScene = await ensureBackgroundPlatesForCube(
            imagesForScene,
            cubeSettings.backgroundPlateTheme
          );
          if (!cancelled) {
            const plateById = new Map(imagesForScene.map((image) => [image.id, image]));
            setProcessedImages((previous) =>
              previous.map((image) => plateById.get(image.id) ?? image)
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
        presentationTexturesRef.current = snapshot;
        applyPresentationTextureSampling(snapshot, renderer);
        presentation = createPresentationScene(
          presentationEffectId,
          imagesForScene,
          snapshot.textures,
          snapshot.plateTextures,
          cubeSettings.framePresetId,
          hologramMode,
          cubeSettings.particleTheme,
          cubeSettings.voluMaxDepthEnabled,
          snapshot.subjectForegroundTextures,
          camera
        );
        presentationRef.current = presentation;
        scene.add(presentation.root);
        presentation.refreshFaceTextures?.();
        presentation.setVoluMaxFx(
          cubeSettings.voluMaxFxEnabled && hologramMode,
          cubeSettings.voluMaxFxIntensity
        );
        presentation.setCs5Fx(
          hologramMode ? cs5FxOptionsFromSettings(cubeSettings) : null
        );
        if (presentationEffectId === "cube_focus") {
          presentation.resetTextureCarousel?.();
        }
        presentation.setFrameBorderWidth(cubeSettings.frameBorderWidth);
        presentation.setFrameFinish(cubeSettings.frameFinishId);
        presentation.setCubeSizeScale(cubeSettings.cubeSizeScale);
        timelineStartRef.current = performance.now();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn("[WeddingSimple] presentation textures failed:", error);
        setRecordingMessage(`큐브 연출 로드 실패: ${message}`);
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      dragControls.dispose();
      presentationRef.current = null;
      disposePresentationTextureSnapshot(presentationTexturesRef.current);
      presentationTexturesRef.current = null;
      presentation?.dispose();
      disposeCubeRenderer(container, renderer);
      rendererRef.current = null;
      viewportBackdropRef.current?.dispose();
      viewportBackdropRef.current = null;
      sceneRuntimeRef.current = null;
    };
  }, [
    step,
    active,
    orderedImages,
    presentationCount,
    contentDurationMs,
    presentationDurationMs,
    backgroundPlateSignature,
    subjectForegroundSignature,
    motionSeed,
    cubeSettings.particleTheme,
    cubeSettings.cubeRotationMode,
    cubeShowcaseFx,
    fanSpeed,
    cubeSettings.voluMaxDepthEnabled,
    cubeSettings.voluMaxFxEnabled,
    cubeSettings.voluMaxFxIntensity,
    presentationEffectId,
  ]);

  useEffect(() => {
    const runtime = sceneRuntimeRef.current;
    if (step !== 3 || !active || !runtime?.scene || !runtime.renderer) {
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
    step,
    active,
    orderedImages.length,
    cubeSettings.viewportBackdropPath,
    cubeSettings.microModules.galaxyBackground,
  ]);

  useEffect(() => {
    viewportBackdropRef.current?.setOpacity(cubeSettings.viewportBackdropOpacity);
  }, [cubeSettings.viewportBackdropOpacity]);

  useEffect(() => {
    presentationRef.current?.setFrameBorderWidth(cubeSettings.frameBorderWidth);
  }, [step, active, cubeSettings.frameBorderWidth, presentationEffectId]);

  useEffect(() => {
    presentationRef.current?.setFrameFinish(cubeSettings.frameFinishId);
  }, [step, active, cubeSettings.frameFinishId, presentationEffectId]);

  useEffect(() => {
    presentationRef.current?.setCubeSizeScale(cubeSettings.cubeSizeScale);
  }, [step, active, cubeSettings.cubeSizeScale, presentationEffectId, orderedImages.length]);

  useEffect(() => {
    presentationRef.current?.setFramePreset(cubeSettings.framePresetId);
  }, [step, active, cubeSettings.framePresetId, presentationEffectId]);

  const handleEnhanceResolution = async () => {
    if (processedImages.length === 0 || isEnhancingResolution || isRecording) {
      return;
    }
    setIsEnhancingResolution(true);
    setRecordingMessage("보관함 해상도 2× 향상 중...");
    try {
      const updated = await applyResolutionEnhanceBatch(processedImages, {
        scale: 2,
        onProgress: (_current, _total, message) => setRecordingMessage(message),
      });
      setProcessedImages(updated);
      setRecordingMessage("해상도 향상 완료. 고화질(2048) 내보내기를 권장합니다.");
    } catch (err) {
      alert(`해상도 향상 실패: ${err instanceof Error ? err.message : String(err)}`);
      setRecordingMessage("");
    } finally {
      setIsEnhancingResolution(false);
      window.setTimeout(() => setRecordingMessage(""), 6000);
    }
  };

  // Export video (marriage.mp4)
  const handleExportVideo = async () => {
    const runtime = sceneRuntimeRef.current;
    if (!runtime || presentationCount === 0 || isRecording) {
      return;
    }
    const { renderer, camera, container, scene } = runtime;

    const recordDurationMs = resolveRecordDurationMs(contentDurationMs);
    const maxEnhanceScale = orderedImages.some((img) => img.resolutionEnhanceScale === 2) ? 2 : 1;
    const exportSize = resolveCubeExportPixelSize(exportQuality, maxEnhanceScale);
    const layout = snapshotRendererLayout(renderer, camera);

    const bgmUrl = cubeSettings.bgmEnabled && cubeSettings.bgmTrackId !== "none"
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
        ? `연출 안정화 후 BGM 합성 · ${exportSize}px MP4 인코딩 중...`
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
        texturesSnapshot: presentationTexturesRef.current,
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

      const outName = outExtension === "mp4" ? "marriage.mp4" : "marriage.webm";
      downloadBlob(blob, outName);
      setRecordingMessage(`${exportSize}px ${outName}가 다운로드되었습니다.`);
    } catch (err) {
      bgmSession?.stop();
      alert(`MP4 생성 실패: ${err instanceof Error ? err.message : String(err)}`);
      setRecordingMessage("");
    } finally {
      recordingRef.current = false;
      exportPipelineActiveRef.current = false;
      endCubeRecordingExport(presentationRef.current);
      restoreRendererLayout(renderer, camera, container, layout);
      setIsRecording(false);
      window.setTimeout(() => setRecordingMessage(""), 5000);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSourceImages([]);
    setProcessedImages([]);
  };

  if (!active) return null;

  return (
    <div className="w-full max-w-5xl mx-auto wedding-glass-panel relative overflow-hidden animate-fade-in-up p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[rgba(223,179,134,0.12)] pb-6 mb-8 gap-4">
        <div>
          <h2 className="text-3xl serif-title metallic-text flex items-center gap-2.5 wedding-title-glow">
            <Heart className="fill-[var(--rose-gold)] stroke-none icon-float" size={26} />
            웨딩 홀로그램 오퍼레이터
          </h2>
          <p className="text-mbox-muted text-xs mt-1.5 font-medium tracking-wide">
            식장 홀로그램 디스플레이를 위한 1:1 MP4 비디오 자동 빌더
          </p>
        </div>

        <div className="flex items-center gap-3 px-4 py-2 rounded-2xl border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.6)]">
          {[
            { num: 1, label: "사진 업로드" },
            { num: 2, label: "AI 변환" },
            { num: 3, label: "MP4 다운로드" },
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-2">
              <span
                className={`step-dot ${
                  step === s.num ? "active" : step > s.num ? "completed" : ""
                }`}
              >
                {step > s.num ? "✓" : s.num}
              </span>
              <span
                className={`text-xs font-semibold tracking-tight ${
                  step === s.num ? "text-mbox-gold" : "text-mbox-subtle"
                }`}
              >
                {s.label}
              </span>
              {s.num < 3 && <ArrowRight size={10} className="text-mbox-subtle/50" />}
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: UPLOAD PHOTOS */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="wedding-drop-zone rounded-3xl p-12 text-center relative group cursor-pointer">
            <input
              type="file"
              multiple
              accept="image/*"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileSelect}
            />
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="drop-zone-icon w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <UploadIcon size={36} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-mbox-text tracking-wide">웨딩 사진 업로드</h3>
                <p className="text-xs text-mbox-muted mt-2 max-w-sm mx-auto leading-relaxed">
                  디스플레이에 송출할 신랑, 신부의 멋진 고해상도 인물 사진을 <strong>3~20장</strong> 등록하세요.
                </p>
              </div>
            </div>
          </div>

          {sourceImages.length > 0 && (
            <div className="space-y-4 pt-4 animate-fade-in-up">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-mbox-muted uppercase tracking-widest">선택된 이미지 ({sourceImages.length}/20)</h4>
                <button
                  type="button"
                  onClick={() => setSourceImages([])}
                  className="text-xs text-mbox-gold hover:text-mbox-rose-gold font-bold transition-colors"
                >
                  전체 취소
                </button>
              </div>
              
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                {sourceImages.map((src, i) => (
                  <div key={i} className="thumbnail-box group shadow-lg">
                    <img src={src} className="w-full h-full object-cover" alt="Uploaded Wedding Source" />
                    <button
                      type="button"
                      onClick={() => handleRemoveSourceImage(i)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-xl bg-[rgba(18,14,24,0.8)] hover:bg-mbox-gold/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between p-4.5 rounded-2xl bg-[rgba(18,14,24,0.6)] border border-[rgba(223,179,134,0.1)]/60 mt-4">
                <div className="space-y-0.5 pr-4 text-left">
                  <p className="text-xs font-bold text-mbox-text">AI 배경 제거 (누끼)</p>
                  <p className="text-[10px] text-mbox-subtle leading-normal">
                    켜면 배경이 제거됩니다. VoluMax 시차(원본 배경 유지)는 꺼진 상태에서 자동 적용됩니다.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={applyBackgroundRemoval}
                    onChange={(e) => setApplyBackgroundRemoval(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[rgba(18,14,24,0.85)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-mbox-muted after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mbox-gold after:bg-white" />
                </label>
              </div>

              <button
                id="start-ai-btn"
                type="button"
                onClick={handleAutoProcess}
                disabled={sourceImages.length < 3}
                className="w-full py-4.5 rounded-2xl btn-premium text-sm flex items-center justify-center gap-2 mt-4"
              >
                <Flame size={18} className="fill-white" />
                AI 원클릭 자동 보정 시작 {applyBackgroundRemoval ? "(누끼)" : "(원본 + VoluMax)"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: AI BATCH PROCESSING */}
      {step === 2 && (
        <div className="py-20 flex flex-col items-center justify-center gap-8">
          <div className="relative flex items-center justify-center">
            <div className="w-28 h-28 rounded-full border-4 border-mbox-gold/10 border-t-mbox-gold animate-spin" />
            <Sparkles className="absolute text-mbox-gold animate-pulse" size={40} />
          </div>
          
          <div className="text-center space-y-3">
            <h3 className="text-xl font-bold text-mbox-text tracking-wide">AI 3D 홀로그램 전처리 진행 중...</h3>
            <p className="text-xs progress-text uppercase">{processingStatus}</p>
          </div>

          <div className="w-full max-w-sm bg-[rgba(18,14,24,0.75)] border border-[rgba(223,179,134,0.1)] h-2.5 rounded-full overflow-hidden shadow-inner">
            <div
              className="bg-gradient-to-r from-[#dfb386] via-[#e5b3b3] to-[#cca073] h-full transition-all duration-300"
              style={{ width: `${(processingProgress.current / Math.max(1, processingProgress.total)) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-mbox-subtle font-extrabold uppercase tracking-widest font-mono">
            {processingProgress.current} / {processingProgress.total} COMPLETED
          </span>
        </div>
      )}

      {/* STEP 3: PREVIEW & CUSTOM CONFIG */}
      {step === 3 && (
        <div id="step-3-view" className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Hologram Viewport */}
          <div className="lg:col-span-6 space-y-4">
            <div className="hologram-viewport-container aspect-square w-full max-w-[460px] mx-auto">
              <div
                ref={cubeContainerRef}
                className="cube-canvas-mount cursor-grab active:cursor-grabbing"
              />
              <div className="hologram-viewport-badge absolute top-5 left-5 pointer-events-none z-10">
                <span className="px-3 py-1.5 rounded-xl bg-[rgba(18,14,24,0.8)] border border-mbox-gold/20 text-[9px] text-mbox-gold font-black tracking-widest uppercase flex items-center gap-1.5 shadow-md">
                  <Play size={10} className="fill-mbox-gold stroke-none" />
                  3D PREVIEW
                </span>
              </div>
            </div>
            <p className="text-center text-[10px] text-mbox-subtle font-semibold tracking-wide">
              사각 프레임·컬러 매트가 적용된 큐브가 화면 중앙에 표시됩니다. MP4보내기는 동일 연출을 사용합니다.
            </p>
            {presentationEffectId === "cube_focus" ? (
              <VoluMaxStatusHeader
                variant="preview"
                preparedFaceCount={voluMaxFaceCount}
                totalFaceCount={presentationCount}
                isPreparing={isPreparingPlates}
                backgroundPlateTheme={backgroundTheme}
                depthEnabled={cubeSettings.voluMaxDepthEnabled}
                readiness={voluMaxReadiness}
              />
            ) : null}
          </div>

          {/* Quick Settings Configuration */}
          <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              {/* Preset Selection - Template */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-mbox-muted tracking-wider flex items-center gap-2">
                  <Sparkles size={14} className="text-mbox-gold" />
                  홀로그램 템플릿 연출
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PRESENTATION_EFFECTS.map((preset) => {
                    const selected = presentationEffectId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setPresentationEffectId(preset.id)}
                        className={`rounded-2xl px-3 py-3 text-left option-select-btn ${selected ? "active" : ""}`}
                      >
                        <p className="text-[10px] font-semibold tracking-wide text-mbox-gold/90">{preset.moodLabel}</p>
                        <p className="mt-1 text-[11px] font-extrabold text-mbox-text">{preset.label}</p>
                        <p className="text-[9px] text-mbox-subtle mt-0.5">{preset.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-mbox-muted tracking-wider flex items-center gap-2">
                  <Sparkles size={14} className="text-mbox-gold" />
                  프레임
                </label>
                <FrameSettingsControls
                  variant="wedding"
                  disabled={isRecording}
                  value={{
                    framePresetId: cubeSettings.framePresetId,
                    frameFinishId: cubeSettings.frameFinishId,
                    frameBorderWidth: cubeSettings.frameBorderWidth,
                    customFrameColor: cubeSettings.customFrameColor,
                    gradientColorCycle: cubeSettings.gradientColorCycle,
                  }}
                  onChange={(patch) => setCubeSettings((prev) => ({ ...prev, ...patch }))}
                />
                <CubeSizeControl
                  value={cubeSettings.cubeSizeScale}
                  disabled={isRecording}
                  onChange={(cubeSizeScale) =>
                    setCubeSettings((prev) => ({ ...prev, cubeSizeScale }))
                  }
                />
              </div>

              {/* Preset Selection - Background composition */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-mbox-muted tracking-wider flex items-center gap-2">
                  <ImageIcon size={14} className="text-mbox-gold" />
                  배경 자동합성 테마
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {WEDDING_BACKGROUND_THEMES.map((themeOption) => {
                    const selected = backgroundTheme === themeOption.id;
                    return (
                      <button
                        key={themeOption.id}
                        type="button"
                        disabled={isCompositingBackground || isRecording}
                        onClick={() => {
                          setActiveComboPresetId(null);
                          void handleBackgroundThemeChange(themeOption.id);
                        }}
                        className={`rounded-2xl py-3 px-2 text-center text-xs font-bold option-select-btn ${
                          selected ? "active" : ""
                        } ${isCompositingBackground ? "opacity-60 cursor-wait" : ""}`}
                      >
                        {themeOption.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <MediaSection
                compact
                settings={cubeSettings}
                backgroundPlateTheme={backgroundTheme}
                particleTheme={cubeSettings.particleTheme}
                activeComboPresetId={activeComboPresetId}
                disabled={isRecording || isCompositingBackground}
                onPatch={(partial) => {
                  setActiveComboPresetId(null);
                  setCubeSettings((prev) => ({ ...prev, ...partial }));
                }}
                onCustomBgmFile={handleCustomBgm}
                onApplyComboPreset={(preset, patch) => {
                  setActiveComboPresetId(preset.id);
                  void handleApplyComboPreset(preset, patch);
                }}
              />

              {presentationEffectId === "cube_focus" ? (
                <div className="space-y-2.5">
                  <label className="text-xs font-bold text-mbox-muted tracking-wider flex items-center gap-2">
                    <Sparkles size={14} className="text-mbox-gold" />
                    3D 쇼케이스 연출 (단계별)
                  </label>
                  <CubeShowcaseStepsControls
                    settings={cubeSettings}
                    disabled={isRecording}
                    rotationControlsEnabled
                    onPatch={(partial) => {
                      setActiveComboPresetId(null);
                      setCubeSettings((prev) => ({ ...prev, ...partial }));
                    }}
                  />
                  <div className="flex items-center justify-between rounded-2xl border border-[rgba(223,179,134,0.08)] bg-[rgba(18,14,24,0.45)] p-3.5">
                    <div className="space-y-0.5 pr-4 text-left">
                      <p className="text-xs font-bold text-mbox-text">VoluMax 깊이 분리</p>
                      <p className="text-[10px] leading-normal text-mbox-subtle">
                        인물·배경 레이어 시차 (5단계 인물 당겨오기에 필요)
                      </p>
                    </div>
                    <label className="relative inline-flex shrink-0 cursor-pointer select-none items-center">
                      <input
                        type="checkbox"
                        checked={cubeSettings.voluMaxDepthEnabled}
                        disabled={isRecording}
                        onChange={(event) => {
                          const voluMaxDepthEnabled = event.target.checked;
                          setCubeSettings((prev) => ({
                            ...prev,
                            voluMaxDepthEnabled,
                            ...(!voluMaxDepthEnabled ? { cubeSubjectPullEnabled: false } : {}),
                          }));
                        }}
                        className="peer sr-only"
                      />
                      <div className="h-6 w-11 rounded-full bg-[rgba(18,14,24,0.85)] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-mbox-muted after:transition-all peer-checked:bg-mbox-gold peer-checked:after:translate-x-full peer-checked:after:border-white after:bg-white after:content-['']" />
                    </label>
                  </div>
                </div>
              ) : null}

              {/* Preset Selection - Particle */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-mbox-muted tracking-wider flex items-center gap-2">
                  <Heart size={14} className="text-mbox-gold" />
                  웨딩 파티클 필터
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "none", label: "파티클 없음" },
                    { id: "gold_dust", label: "럭셔리 금가루 (Gold)" },
                    { id: "white_petals", label: "로맨틱 벚꽃 (Blossom)" },
                    { id: "floating_hearts", label: "보석 결정 하트 (Crystal)" },
                    { id: "confetti", label: "축하 컨페티 (Confetti)" },
                  ].map((themeOption) => {
                    const selected = cubeSettings.particleTheme === themeOption.id;
                    return (
                      <button
                        key={themeOption.id}
                        type="button"
                        onClick={() => {
                          setActiveComboPresetId(null);
                          setCubeSettings((prev) => ({
                            ...prev,
                            particleTheme: themeOption.id as CubeFocusSettings["particleTheme"],
                          }));
                        }}
                        className={`rounded-2xl py-3 text-center text-xs font-bold option-select-btn ${selected ? "active" : ""}`}
                      >
                        {themeOption.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Export quality */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-mbox-muted tracking-wider flex items-center gap-2">
                  <DownloadIcon size={14} className="text-mbox-gold" />
                  MP4 내보내기 해상도
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: "standard" as const, label: "1024px (표준)" },
                      { id: "high" as const, label: "2048px (고화질)" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={isRecording || isCompositingBackground || isEnhancingResolution}
                      onClick={() => setExportQuality(option.id)}
                      className={`rounded-2xl py-3 text-center text-xs font-bold option-select-btn ${
                        exportQuality === option.id ? "active" : ""
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={isRecording || isCompositingBackground || isEnhancingResolution}
                  onClick={() => void handleEnhanceResolution()}
                  className="w-full rounded-2xl py-3 text-xs font-bold border border-mbox-gold/30 bg-mbox-gold/10 text-mbox-gold hover:bg-mbox-gold/20 transition-colors disabled:opacity-40"
                >
                  {isEnhancingResolution ? "2× 해상도 향상 중..." : "보관함 2× 해상도 향상 (선택)"}
                </button>
                <p className="text-[10px] text-mbox-subtle leading-relaxed">
                  미리보기는 화면 크기로 보이지만 MP4는 선택한 픽셀 해상도로 녹화됩니다. 더 선명하게 받으려면 2× 향상 후 2048px를 선택하세요.
                </p>
              </div>

              {/* Per-photo captions */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-mbox-muted tracking-wider flex items-center gap-2">
                  <Type size={14} className="text-mbox-gold" />
                  사진별 한 줄 자막
                </label>
                <p className="text-[10px] text-mbox-subtle leading-relaxed pl-1">
                  쇼케이스 정지 구간 하단에 표시 · marriage.mp4에도 녹화됩니다.
                </p>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-2xl border border-[rgba(223,179,134,0.1)] bg-[rgba(18,14,24,0.45)] p-3">
                  {orderedImages.map((image, index) => (
                    <label key={image.id} className="flex items-center gap-2">
                      <span className="w-5 shrink-0 text-[10px] font-bold text-mbox-subtle">{index + 1}</span>
                      <input
                        type="text"
                        value={image.caption ?? ""}
                        maxLength={48}
                        disabled={isRecording}
                        placeholder="자막 입력"
                        onChange={(event) => handleCaptionChange(image.id, event.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.75)] px-2 py-1.5 text-[11px] text-mbox-text placeholder:text-mbox-subtle/80 focus:border-mbox-gold/50 focus:outline-none disabled:opacity-50"
                      />
                    </label>
                  ))}
                </div>
              </div>

            </div>

            {/* Render & Export Actions */}
            <div className="space-y-4 pt-6 border-t border-[rgba(223,179,134,0.1)]/60">
              {recordingMessage && (
                <div className="p-3.5 rounded-2xl bg-mbox-gold/10 border border-mbox-gold/20 text-xs text-mbox-gold flex items-center gap-2.5 shadow-md">
                  {(isRecording || isCompositingBackground) ? (
                    <Loader2 className="animate-spin text-mbox-gold" size={14} />
                  ) : null}
                  <span className="font-semibold">{recordingMessage}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isRecording}
                  className="px-4.5 py-4 rounded-2xl border border-[rgba(223,179,134,0.1)] bg-[rgba(18,14,24,0.6)] hover:bg-[rgba(18,14,24,0.75)]/40 text-mbox-muted hover:text-mbox-text transition-all duration-300 flex items-center justify-center shadow-md active:scale-95"
                  title="새로운 영상 만들기"
                >
                  <RotateCcw size={18} />
                </button>
                
                <button
                  id="export-btn"
                  type="button"
                  onClick={handleExportVideo}
                  disabled={isRecording || isCompositingBackground || isEnhancingResolution}
                  className="flex-1 py-4 rounded-2xl btn-emerald-glow text-sm flex items-center justify-center gap-2 shadow-lg"
                >
                  {isRecording ? <Loader2 className="animate-spin" size={18} /> : <DownloadIcon size={18} />}
                  marriage.mp4 동영상 파일 내보내기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
