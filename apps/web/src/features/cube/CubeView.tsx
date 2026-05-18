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
import { computeCubeLoopBridgeFrame, computePresentationFrame } from "./presentationFrame";
import { PRESENTATION_EFFECTS, type PresentationEffectId } from "./presentationEffects";
import { createPresentationScene } from "./presentationScene";
import {
  constrainPresentationImages,
  formatPresentationBytes,
  getPresentationTotalBytes,
  MAX_PRESENTATION_BYTES,
} from "../../shared/lib/mediaLimits";
import { countSubjectCutouts } from "../../shared/lib/cutoutPresentation";
import {
  CubeVideoRecorder,
  RECORD_ENCODER_FLUSH_MS,
  downloadBlob,
  looksLikeIsoMp4,
  normalizeRecordingBlob,
  resolveRecordingMimeType,
} from "./cubeRecorder";
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
  const presentationRef = useRef<PresentationScene | null>(null);

  const orderedImages = useMemo(
    () => constrainPresentationImages(processedImages),
    [processedImages]
  );
  const presentationCount = orderedImages.length;
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
  useEffect(() => {
    if (!active || !cubeContainerRef.current || presentationCount === 0) {
      return;
    }

    const container = cubeContainerRef.current;
    if (rendererRef.current) {
      container.removeChild(rendererRef.current.domElement);
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(framePreset.sceneBackground);

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const pointLight = new THREE.PointLight(0xffffff, 1.1);
    pointLight.position.set(4, 6, 8);
    scene.add(pointLight);

    const loader = new THREE.TextureLoader();
    const textures = orderedImages.map((image) => loader.load(image.url));
    const plateTextures = orderedImages.map((image) =>
      image.backgroundPlateUrl ? loader.load(image.backgroundPlateUrl) : null
    );
    const presentation = createPresentationScene(
      selectedEffect,
      orderedImages,
      textures,
      plateTextures,
      cubeSettings.framePresetId
    );
    presentationRef.current = presentation;
    scene.add(presentation.root);

    timelineStartRef.current = performance.now();
    const recordingDuration = presentationDurationMs;
    let appliedStep = -1;

    const animate = (now: number) => {
      const elapsed = now - timelineStartRef.current;
      const timeline =
        recordingRef.current || recordingDuration <= 0
          ? elapsed
          : elapsed % recordingDuration;
      const resolved = resolvePresentationTimeline(timeline, segmentMsByStep, loopBridgeMs);

      if (resolved.kind === "loop_bridge") {
        const textureStep =
          loopBridgeMs > 0 && resolved.bridgeElapsed >= loopBridgeMs * 0.82
            ? 0
            : resolved.lastStep;
        if (textureStep !== appliedStep) {
          presentation.applyStepTexture(textureStep);
          setCurrentStep(textureStep + 1);
          appliedStep = textureStep;
        }
        const frame = computeCubeLoopBridgeFrame(
          resolved.bridgeElapsed,
          loopBridgeMs,
          resolved.lastStep
        );
        frame.applyRootTransform(presentation.root, resolved.lastStep, presentationCount);
        camera.position.x = 0;
        camera.position.y = 0;
        camera.position.z = frame.cameraZ;
        camera.fov = frame.fieldOfView;
        camera.updateProjectionMatrix();
        presentation.setParallaxAmount(resolved.lastStep, 0);
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

        const frame = computePresentationFrame(
          selectedEffect,
          step,
          stepElapsed,
          presentationCount,
          currentFace,
          { timing: stepTiming, variety: stepVariety }
        );
        frame.applyRootTransform(presentation.root, step, presentationCount);
        camera.position.x = frame.cameraOffsetX ?? 0;
        camera.position.y = frame.cameraOffsetY ?? 0;
        camera.position.z = frame.cameraZ;
        camera.fov = frame.fieldOfView;
        camera.updateProjectionMatrix();
        presentation.setParallaxAmount(step, frame.parallaxAmount);
      }

      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      const nextWidth = container.clientWidth;
      const nextHeight = container.clientHeight;
      renderer.setSize(nextWidth, nextHeight);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);
    requestRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      presentationRef.current = null;
      presentation.dispose();
      textures.forEach((texture) => texture.dispose());
      plateTextures.forEach((texture) => texture?.dispose());
      renderer.dispose();
      rendererRef.current = null;
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
    const renderer = rendererRef.current;
    if (!renderer || presentationCount === 0 || isRecording) {
      return;
    }

    const recordDurationMs = presentationDurationMs + RECORD_ENCODER_FLUSH_MS;
    const bgmUrl =
      cubeSettings.bgmEnabled && cubeSettings.bgmTrackId !== "none"
        ? resolveBgmSource(cubeSettings.bgmTrackId, cubeSettings.bgmCustomUrl)
        : null;
    const withAudio = Boolean(bgmUrl);

    setIsRecording(true);
    setRecordingMessage(
      withAudio ? "MP4 + BGM 합성 중입니다..." : "선택한 연출을 MP4로 생성하는 중입니다..."
    );

    let bgmSession: Awaited<ReturnType<typeof startBgmRecordingSession>> | null = null;

    try {
      const { mimeType, extension } = resolveRecordingMimeType({ withAudio });
      const recorder = new CubeVideoRecorder();
      const videoStream = renderer.domElement.captureStream(30);
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
      recordingRef.current = true;
      recorder.start(recordStream, mimeType);

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, recordDurationMs);
      });

      let blob = normalizeRecordingBlob(await recorder.stop(), extension);
      bgmSession?.stop();

      if (extension === "mp4" && !(await looksLikeIsoMp4(blob))) {
        throw new Error(
          "MP4 container validation failed (file may be truncated or WebM). Try Chrome/Edge or use WebM export."
        );
      }
      const suffix = withAudio ? "-bgm" : "";
      downloadBlob(blob, `mbox-cube_focus${suffix}.${extension}`);
      setRecordingMessage(
        withAudio
          ? "BGM이 합성된 MP4가 준비되었습니다."
          : extension === "mp4"
            ? "MP4 생성 파일이 준비되었습니다."
            : "브라우저가 MP4를 지원하지 않아 WebM으로 저장했습니다."
      );
    } catch (error) {
      bgmSession?.stop();
      const message = error instanceof Error ? error.message : "Unknown error";
      setRecordingMessage(`영상 저장에 실패했습니다: ${message}`);
    } finally {
      recordingRef.current = false;
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
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {PRESENTATION_EFFECTS.filter((effect) => effect.id !== "cube_focus").map((effect) => {
            const selected = effect.id === selectedEffect;
            return (
              <button
                key={effect.id}
                type="button"
                disabled={isRecording}
                onClick={() => setSelectedEffect(effect.id)}
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

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative">
        <div
          ref={cubeContainerRef}
          className="w-full h-[600px] cursor-grab active:cursor-grabbing"
        />

        <div className="absolute top-6 left-6 pointer-events-none max-w-[420px]">
          <h3 className="text-2xl font-black text-white/90">3D VISUALIZATION</h3>
          <p className="text-blue-400 text-sm leading-relaxed">
            {framePreset.label} 프레임 · 누끼 {cutoutCount}/{presentationCount}장 분리 · 2× {enhancedCount}장
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
            {presentationCount > 0 && cutoutCount === 0 ? (
              <p className="mt-2 text-amber-300">
                배경 제거(누끼)된 이미지가 없습니다. 프로세싱 탭에서 배경 제거를 적용하세요.
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
