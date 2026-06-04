import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Download, Loader2, Play } from "lucide-react";
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
  computePresentationFrame,
  computePresentationLoopBridgeFrame,
} from "./presentationFrame";
import { getGradientShift } from "./presentationGradient";
import { PRESENTATION_EFFECTS, type PresentationEffectId } from "./presentationEffects";
import { createPresentationScene } from "./presentationScene";
import { cs5FxOptionsFromSettings } from "./cs5Fx";
import {
  constrainPresentationImages,
  formatPresentationBytes,
  getPresentationTotalBytes,
  MAX_PRESENTATION_BYTES,
} from "../../shared/lib/mediaLimits";
import { countSubjectCutouts } from "../../shared/lib/cutoutPresentation";
import { applyPresentationPrepareBatch } from "../processing/applyPresentationPrepare";
import {
  CubeVideoRecorder,
  RECORD_ENCODER_FLUSH_MS,
  downloadBlob,
  looksLikeIsoMp4,
  normalizeRecordingBlob,
  resolveRecordingMimeType,
} from "./cubeRecorder";
import {
  applyExportRendererSize,
  restoreRendererLayout,
  resolveCubeExportPixelSize,
  resolveVideoBitsPerSecond,
  snapshotRendererLayout,
  waitForRendererFrames,
} from "./cubeExportCapture";
import {
  CubeFocusPanel,
  DEFAULT_CUBE_FOCUS_SETTINGS,
  type CubeFocusSettings,
} from "./CubeFocusPanel";
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

interface CubeViewProps {
  active: boolean;
  processedImages: ProcessedImage[];
  onProcessedImagesChange?: (images: ProcessedImage[]) => void;
}

export function CubeView({
  active,
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
    faceCompositeTextures: Array<THREE.Texture | null>;
    subjectForegroundTextures: Array<THREE.Texture | null>;
  } | null>(null);
  const requestRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const timelineStartRef = useRef(performance.now());
  const [presentationKey, setPresentationKey] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedEffect, setSelectedEffect] =
    useState<PresentationEffectId>("cube_focus");
  const [cubeSettings, setCubeSettings] = useState<CubeFocusSettings>(DEFAULT_CUBE_FOCUS_SETTINGS);
  const [showBetaTemplates, setShowBetaTemplates] = useState(false);
  const [isEnhancingResolution, setIsEnhancingResolution] = useState(false);
  const [isPreparingPlates, setIsPreparingPlates] = useState(false);
  const presentationRef = useRef<PresentationScene | null>(null);

  const orderedImages = useMemo(
    () => constrainPresentationImages(processedImages),
    [processedImages]
  );
  const presentationCount = orderedImages.length;
  const voluMaxFaceCount = useMemo(
    () =>
      orderedImages.filter(
        (img) =>
          img.voluMaxPrepared ||
          (img.backgroundPlateUrl &&
            img.subjectForegroundUrl &&
            img.subjectForegroundUrl !== img.url)
      ).length,
    [orderedImages]
  );
  const cutoutCount = useMemo(() => countSubjectCutouts(orderedImages), [orderedImages]);
  const enhancedCount = useMemo(
    () => processedImages.filter((image) => image.resolutionEnhanceScale === 2).length,
    [processedImages]
  );
  const framePreset = useMemo(
    () => getCubeFramePreset(cubeSettings.framePresetId),
    [cubeSettings.framePresetId]
  );
  const omittedCount = processedImages.length - orderedImages.length;
  const presentationBytes = useMemo(
    () => getPresentationTotalBytes(orderedImages),
    [orderedImages]
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
          selectedEffect,
          orderedImages.length
        )
      ),
    [orderedImages, motionSeed, selectedEffect]
  );
  const loopBridgeMs = useMemo(
    () => getLoopBridgeMs(selectedEffect, presentationCount),
    [selectedEffect, presentationCount]
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

  useEffect(() => {
    if (!active || !onProcessedImagesChange || processedImages.length === 0 || isPreparingPlates) {
      return;
    }
    const needsPlates = processedImages.some(
      (image) => !image.backgroundPlateUrl || !image.subjectForegroundUrl
    );
    if (!needsPlates) {
      return;
    }
    let cancelled = false;
    setIsPreparingPlates(true);
    setRecordingMessage("VoluMax 연출용 배경 플레이트 생성 중...");
    void applyPresentationPrepareBatch(processedImages, { backgroundPlateTheme: "original_blurred" })
      .then((prepared) => {
        if (!cancelled) {
          onProcessedImagesChange(prepared);
          setPresentationKey((value) => value + 1);
          setRecordingMessage("원본 배경 플레이트가 준비되었습니다.");
          window.setTimeout(() => setRecordingMessage(""), 4000);
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
  }, [active, processedImages, onProcessedImagesChange, isPreparingPlates]);

  useEffect(() => {
    if (!active || !cubeContainerRef.current || presentationCount === 0) {
      return;
    }

    const container = cubeContainerRef.current;
    disposeCubeRenderer(container, rendererRef.current);
    clearCubeMount(container);

    const scene = new THREE.Scene();
    scene.background = cubeSettings.hologramMode
      ? new THREE.Color(0x000000)
      : new THREE.Color(framePreset.sceneBackground);

    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 1.0);
    container.appendChild(renderer.domElement);
    syncRendererToContainer(renderer, camera, container);
    rendererRef.current = renderer;
    sceneRuntimeRef.current = { renderer, camera, container, scene };

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const pointLight = new THREE.PointLight(0xffffff, 1.1);
    pointLight.position.set(4, 6, 8);
    scene.add(pointLight);

    const loader = new THREE.TextureLoader();
    const textures = orderedImages.map((image) => loader.load(image.url));
    const plateTextures = orderedImages.map((image) =>
      image.backgroundPlateUrl ? loader.load(image.backgroundPlateUrl) : null
    );
    const faceCompositeTextures = orderedImages.map((image) =>
      image.faceCompositeUrl ? loader.load(image.faceCompositeUrl) : null
    );
    const subjectForegroundTextures = orderedImages.map((image) =>
      image.subjectForegroundUrl ? loader.load(image.subjectForegroundUrl) : null
    );
    texturesRef.current = { textures, plateTextures, faceCompositeTextures, subjectForegroundTextures };
    const presentation = createPresentationScene(
      selectedEffect,
      orderedImages,
      textures,
      plateTextures,
      cubeSettings.framePresetId,
      cubeSettings.hologramMode,
      cubeSettings.particleTheme,
      [],
      cubeSettings.voluMaxDepthEnabled,
      subjectForegroundTextures
    );
    presentationRef.current = presentation;
    scene.add(presentation.root);
    presentation.setVoluMaxFx(cubeSettings.voluMaxFxEnabled && cubeSettings.hologramMode, cubeSettings.voluMaxFxIntensity);
    presentation.setCs5Fx(
      cubeSettings.hologramMode ? cs5FxOptionsFromSettings(cubeSettings) : null
    );
    if (selectedEffect === "cube_focus") {
      presentation.resetTextureCarousel?.();
    }

    timelineStartRef.current = performance.now();
    let lastTime = performance.now();
    const recordingDuration = presentationDurationMs;
    let appliedStep = -1;

    const animate = (now: number) => {
      const deltaMs = now - lastTime;
      lastTime = now;

      // Update particle physics
      presentation.updateParticles(deltaMs);

      const elapsed = now - timelineStartRef.current;
      const timeline =
        recordingRef.current || recordingDuration <= 0
          ? elapsed
          : elapsed % recordingDuration;
      const resolved = resolvePresentationTimeline(timeline, segmentMsByStep, loopBridgeMs);

      if (resolved.kind === "loop_bridge") {
        if (selectedEffect !== "cube_focus") {
          // loopBridgeMs should be 0; hold last step until timeline wraps
          const holdStep = resolved.lastStep;
          const frame = computePresentationFrame(
            selectedEffect,
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
                selectedEffect,
                presentationCount
              ),
              variety: getStepMotionVariety(motionSeed, holdStep),
              imageCenter: orderedImages[holdStep]?.center,
              cubeRotationMode: cubeSettings.cubeRotationMode,
              exportRecording: recordingRef.current,
              motionSeed,
            }
          );
          frame.applyRootTransform(presentation.root, holdStep, presentationCount);
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
        if (textureStep !== appliedStep) {
          presentation.applyStepTexture(textureStep);
          setCurrentStep(textureStep + 1);
          appliedStep = textureStep;
        }
        const frame = computePresentationLoopBridgeFrame(
          selectedEffect,
          resolved.bridgeElapsed,
          loopBridgeMs,
          resolved.lastStep,
          {
            cubeRotationMode: cubeSettings.cubeRotationMode,
            motionSeed,
          }
        );
        frame.applyRootTransform(presentation.root, resolved.lastStep, presentationCount);
        if (cubeSettings.hologramMode && !recordingRef.current) {
          applyHologramPreviewScale(presentation.root);
        }
        presentation.setVoluMaxFx(
          cubeSettings.voluMaxFxEnabled && cubeSettings.hologramMode,
          cubeSettings.voluMaxFxIntensity
        );
        presentation.setCs5Fx(
          cubeSettings.hologramMode ? cs5FxOptionsFromSettings(cubeSettings) : null
        );
        camera.position.x = 0;
        camera.position.y = 0;
        camera.position.z = frame.cameraZ;
        camera.fov = frame.fieldOfView;
        camera.updateProjectionMatrix();
        aimCameraAtCubeOrigin(camera);
        presentation.setParallaxAmount(resolved.lastStep, 0);
        }
      } else {
        const { step, stepElapsed } = resolved;
        const currentFace = getPresentationFace(step);
        const stepTiming = getStepPhaseTiming(
        motionSeed,
        step,
        ZOOM_MS,
        PARALLAX_MS,
        selectedEffect,
        presentationCount
      );
        const stepVariety = getStepMotionVariety(motionSeed, step);

        if (step !== appliedStep) {
          presentation.applyStepTexture(step);
          setCurrentStep(step + 1);
          appliedStep = step;
        }

        const stepCenter = orderedImages[step]?.center;
        const frame = computePresentationFrame(
          selectedEffect,
          step,
          stepElapsed,
          presentationCount,
          currentFace,
          {
            timing: stepTiming,
            variety: stepVariety,
            imageCenter: cubeSettings.hologramMode ? { x: 50, y: 50 } : stepCenter,
            cubeRotationMode: cubeSettings.cubeRotationMode,
            exportRecording: recordingRef.current,
            motionSeed,
            hologramMode: cubeSettings.hologramMode,
          }
        );
        frame.applyRootTransform(presentation.root, step, presentationCount);
        if (cubeSettings.hologramMode && !recordingRef.current) {
          applyHologramPreviewScale(presentation.root);
        }
        presentation.setVoluMaxFx(
          cubeSettings.voluMaxFxEnabled && cubeSettings.hologramMode,
          cubeSettings.voluMaxFxIntensity
        );
        presentation.setCs5Fx(
          cubeSettings.hologramMode ? cs5FxOptionsFromSettings(cubeSettings) : null
        );
        camera.position.x = frame.cameraOffsetX ?? 0;
        camera.position.y = frame.cameraOffsetY ?? 0;
        camera.position.z = frame.cameraZ;
        camera.fov = frame.fieldOfView;
        camera.updateProjectionMatrix();
        aimCameraAtCubeOrigin(camera);
        presentation.setParallaxAmount(step, frame.parallaxAmount, frame.focusPulse ?? 0);
      }
      if (selectedEffect === "cube_focus" && presentation.updateTextureCarousel) {
        presentation.updateTextureCarousel(presentation.root.rotation.y);
      }
      if (
        selectedEffect === "cube_focus" &&
        cubeSettings.voluMaxDepthEnabled &&
        presentation.updateRotationParallax
      ) {
        presentation.updateRotationParallax(
          presentation.root.rotation.y,
          presentation.root.rotation.x
        );
      }
      presentation.setGradientShift(
        getGradientShift(elapsed),
        cubeSettings.gradientColorCycle
      );

      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      syncRendererToContainer(renderer, camera, container);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener("resize", handleResize);
    requestRef.current = requestAnimationFrame(animate);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      presentationRef.current = null;
      presentation.dispose();
      textures.forEach((texture) => texture.dispose());
      plateTextures.forEach((texture) => texture?.dispose());
      faceCompositeTextures.forEach((texture) => texture?.dispose());
      subjectForegroundTextures.forEach((texture) => texture?.dispose());
      disposeCubeRenderer(container, renderer);
      rendererRef.current = null;
      sceneRuntimeRef.current = null;
      texturesRef.current = null;
    };
  }, [
    active,
    orderedImages,
    motionSeed,
    presentationCount,
    contentDurationMs,
    loopBridgeMs,
    presentationDurationMs,
    presentationKey,
    segmentMsByStep,
    selectedEffect,
    cubeSettings.framePresetId,
    framePreset.sceneBackground,
    cubeSettings.hologramMode,
    cubeSettings.particleTheme,
    cubeSettings.cubeRotationMode,
    cubeSettings.gradientColorCycle,
    cubeSettings.voluMaxDepthEnabled,
    cubeSettings.voluMaxFxEnabled,
    cubeSettings.voluMaxFxIntensity,
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

    const recordDurationMs = presentationDurationMs + RECORD_ENCODER_FLUSH_MS;
    const maxEnhanceScale = processedImages.some((img) => img.resolutionEnhanceScale === 2) ? 2 : 1;
    const exportSize = resolveCubeExportPixelSize("standard", maxEnhanceScale);
    const layout = snapshotRendererLayout(renderer, camera);

    const bgmUrl =
      cubeSettings.bgmEnabled && cubeSettings.bgmTrackId !== "none"
        ? resolveBgmSource(cubeSettings.bgmTrackId, cubeSettings.bgmCustomUrl)
        : null;
    const withAudio = Boolean(bgmUrl) && !window.__MBOX_E2E_EXPORT__;

    setIsRecording(true);
    setRecordingMessage(
      withAudio
        ? `MP4 + BGM 합성 중 (${exportSize}px)...`
        : `선택한 연출을 ${exportSize}px MP4로 생성하는 중입니다...`
    );

    let bgmSession: Awaited<ReturnType<typeof startBgmRecordingSession>> | null = null;

    try {
      presentationRef.current?.resetTextureCarousel?.();
      applyExportRendererSize(renderer, camera, exportSize);

      // Warm up before recording:
      // - Wait for textures to finish loading
      // - Compile shaders at export resolution
      // - Render a few stable frames so recording doesn't start during compilation/loading
      const texturesSnapshot = texturesRef.current;
      if (texturesSnapshot) {
        const all = [
          ...texturesSnapshot.textures,
          ...texturesSnapshot.plateTextures.filter(Boolean),
          ...texturesSnapshot.faceCompositeTextures.filter(Boolean),
        ] as THREE.Texture[];
        const deadline = performance.now() + 15_000;
        while (performance.now() < deadline) {
          const pending = all.some((t) => {
            const img = (t as unknown as { image?: HTMLImageElement | ImageBitmap }).image;
            // ImageBitmap doesn't have complete; treat as ready if present.
            if (!img) return true;
            if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) return false;
            const el = img as HTMLImageElement;
            return !(el.complete && el.naturalWidth > 0);
          });
          if (!pending) break;
          await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
        }
      }

      // Compile at target resolution to avoid "first-frame stutter" in recordings.
      renderer.compile(scene, camera);
      await waitForRendererFrames(12);

      const { mimeType, extension } = resolveRecordingMimeType({ withAudio });
      const recorder = new CubeVideoRecorder();
      // Force a deterministic 30fps capture by drawing into a recording canvas.
      // (Some browsers ignore frameRate constraints on captureStream tracks and emit 60fps containers.)
      const recordCanvas = document.createElement("canvas");
      recordCanvas.width = renderer.domElement.width;
      recordCanvas.height = renderer.domElement.height;
      const recordCtx = recordCanvas.getContext("2d");
      const drawIntervalMs = Math.round(1000 / 30);
      let drawTimer: number | null = null;
      if (recordCtx) {
        drawTimer = window.setInterval(() => {
          try {
            recordCtx.drawImage(renderer.domElement, 0, 0, recordCanvas.width, recordCanvas.height);
          } catch {
            // ignore
          }
        }, drawIntervalMs);
      }
      const videoStream = recordCanvas.captureStream(30);
      if (withAudio && bgmUrl) {
        bgmSession = await startBgmRecordingSession({
          videoStream,
          audioUrl: bgmUrl,
          durationMs: recordDurationMs,
          volume: cubeSettings.bgmVolume,
        });
      }
      const recordStream = bgmSession?.compositeStream ?? videoStream;
      recordingRef.current = true;

      await new Promise<void>((resolve) => window.setTimeout(resolve, 650));

      timelineStartRef.current = performance.now();
      recorder.start(recordStream, mimeType, resolveVideoBitsPerSecond(exportSize));

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, recordDurationMs);
      });

      let blob = normalizeRecordingBlob(await recorder.stop(), extension);
      if (drawTimer != null) {
        window.clearInterval(drawTimer);
      }
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
      restoreRendererLayout(renderer, camera, container, layout);
      setIsRecording(false);
    }
  };

  return (
    <div className="lg:col-span-12 space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 text-blue-300">
          <Box size={20} />
          <h2 className="font-bold">정육면체 큐브 (상품 핵심)</h2>
        </div>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          프레임 5종 · BGM 자동 합성 MP4 · 2× 해상도 향상. 누끼 컷은 인물·배경 분리 연출.
        </p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          1. 프레임·BGM · 2. 연출 적용 · 3. MP4 생성
        </p>
        <div className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-950/20 p-4">
          <CubeFocusPanel
            settings={cubeSettings}
            presentationEffectId={selectedEffect}
            onSettingsChange={setCubeSettings}
            disabled={isRecording || isEnhancingResolution}
            isEnhancingResolution={isEnhancingResolution}
            enhancedCount={enhancedCount}
            totalCount={processedImages.length}
            onEnhanceResolution={handleEnhanceResolution}
          />
        </div>
        <button
          type="button"
          className="mt-4 text-xs text-slate-500 underline"
          onClick={() => setShowBetaTemplates((value) => !value)}
        >
          {showBetaTemplates ? "베타 템플릿 숨기기" : "다른 연출 템플릿 (베타) 보기"}
        </button>
        {showBetaTemplates ? (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {PRESENTATION_EFFECTS.filter((effect) => effect.id !== "cube_focus").map((effect) => {
            const selected = effect.id === selectedEffect;
            return (
              <button
                key={effect.id}
                type="button"
                disabled={isRecording}
                onClick={() => handleSelectEffect(effect.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  selected
                    ? "border-blue-500/60 bg-blue-500/10"
                    : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
                }`}
              >
                <p className="text-sm font-semibold text-slate-100">{effect.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{effect.description}</p>
              </button>
            );
          })}
        </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <button
            type="button"
            disabled={presentationCount === 0 || isRecording}
            onClick={handleApplyPresentation}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 py-3 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={18} />
            연출 적용 (재생 처음부터)
          </button>
          <button
            type="button"
            disabled={presentationCount === 0 || isRecording}
            onClick={handleDownloadVideo}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-600/90 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {isRecording ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
            {cubeSettings.bgmEnabled && cubeSettings.bgmTrackId !== "none"
              ? "MP4 + BGM 생성"
              : "MP4 생성"}
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative flex flex-col items-center justify-center">
        <div
          ref={cubeContainerRef}
          className={`w-full cursor-grab active:cursor-grabbing ${
            cubeSettings.hologramMode ? "aspect-square max-w-[600px]" : "h-[600px]"
          }`}
        />

        <div className="absolute top-6 left-6 pointer-events-none max-w-[420px]">
          <h3 className="text-2xl font-black text-white/90">
            {cubeSettings.hologramMode ? "3D HOLOGRAM FAN" : "3D VISUALIZATION"}
          </h3>
          <p className="text-blue-400 text-sm leading-relaxed">
            {selectedEffectMeta?.label ?? "연출"} · {framePreset.label} 프레임 ·{" "}
            {cubeSettings.hologramMode ? `홀로그램 모드 (1:1)` : `누끼 ${cutoutCount}/${presentationCount}장 분리`} · 2×
            업스케일 {enhancedCount}장
          </p>
        </div>

        <div className="absolute bottom-6 right-6 flex flex-col items-end gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={presentationCount === 0 || isRecording}
              onClick={handleApplyPresentation}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-black/50 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play size={16} />
              연출 적용
            </button>
            <button
              type="button"
              disabled={presentationCount === 0 || isRecording}
              onClick={handleDownloadVideo}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/50 bg-emerald-600/95 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {isRecording ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              MP4 생성
            </button>
          </div>

          <div className="bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-xs text-slate-300 max-w-[280px]">
            {presentationCount === 0 ? (
              <p className="text-amber-400">처리된 이미지가 없습니다.</p>
            ) : (
              <p>
                재생 {presentationCount}장 · 1회전 약{" "}
                {formatPresentationDurationMs(presentationDurationMs)} · 현재 {currentStep}/
                {presentationCount}번째 · 용량 {formatPresentationBytes(presentationBytes)} /{" "}
                {formatPresentationBytes(MAX_PRESENTATION_BYTES)}
              </p>
            )}
            {omittedCount > 0 ? (
              <p className="mt-2 text-amber-300">
                1GB 한도로 {omittedCount}장은 재생에서 제외되었습니다.
              </p>
            ) : null}
            {presentationCount > 0 && cutoutCount === 0 && isPreparingPlates ? (
              <p className="mt-2 text-slate-400">VoluMax 연출용 원본 배경 플레이트 생성 중...</p>
            ) : null}
            {presentationCount > 0 &&
            cutoutCount === 0 &&
            !isPreparingPlates &&
            voluMaxFaceCount > 0 ? (
              <p className="mt-2 text-emerald-300/90">
                VoluMax 적용 {voluMaxFaceCount}/{presentationCount}면 · 블러 배경 + 인물 matte 시차
              </p>
            ) : null}
            {presentationCount > 0 &&
            cutoutCount === 0 &&
            !isPreparingPlates &&
            voluMaxFaceCount === 0 &&
            orderedImages.some((img) => img.backgroundPlateUrl) ? (
              <p className="mt-2 text-amber-300">
                VoluMax matte 미생성 — 프로세싱 후 큐브 탭을 다시 열어 플레이트를 재생성하세요.
              </p>
            ) : null}
            {presentationCount > 0 &&
            cutoutCount === 0 &&
            !isPreparingPlates &&
            !orderedImages.some((img) => img.backgroundPlateUrl) ? (
              <p className="mt-2 text-amber-300">
                배경 플레이트를 준비 중입니다. 잠시 후 큐브 면에 사진이 표시됩니다.
              </p>
            ) : null}
            {presentationCount > 0 && cutoutCount > 0 && cutoutCount < presentationCount ? (
              <p className="mt-2 text-slate-400">
                {presentationCount - cutoutCount}장은 아직 원본이라 분리 연출 없이 표시됩니다.
              </p>
            ) : null}
            {presentationCount > 0 && cutoutCount > 0 ? (
              <p className="mt-2 text-slate-500">
                누끼 컷: 배경 플레이트(블러) + 인물 레이어가 반대 방향으로 움직이며, 포커스 시 림·그림자가 강조됩니다.
              </p>
            ) : null}
            {recordingMessage ? <p className="mt-2 text-slate-400">{recordingMessage}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
