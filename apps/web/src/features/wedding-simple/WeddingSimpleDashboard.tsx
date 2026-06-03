import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload as UploadIcon,
  Download as DownloadIcon,
  Loader2,
  Sparkles,
  Music,
  Trash2,
  RotateCcw,
  Flame,
  ArrowRight,
  Heart,
  Play,
  Image as ImageIcon,
} from "lucide-react";
import * as THREE from "three";
import type { ProcessedImage } from "../../shared/types";
import { PARALLAX_MS, ZOOM_MS, getPresentationFace } from "../cube/cubeSequence";
import {
  createPresentationMotionSeed,
  getLoopBridgeMs,
  getStepMotionVariety,
  getStepPhaseTiming,
  getStepSegmentMs,
  resolvePresentationTimeline,
  sumSegmentDurations,
} from "../cube/cubeMotionVariety";
import { computeCubeLoopBridgeFrame, computePresentationFrame } from "../cube/presentationFrame";
import { resolveFanPhase, type FanTimelineProfile } from "../cube/cubeFanTimeline";
import { getGradientShift } from "../cube/presentationGradient";
import {
  aimCameraAtCubeOrigin,
  applyHologramPreviewScale,
  clearCubeMount,
  disposeCubeRenderer,
  syncRendererToContainer,
} from "../cube/cubeSceneLifecycle";
import type { CubeRotationMode } from "../cube/cubeTransitionRotation";
import { createPresentationScene } from "../cube/presentationScene";
import { CUBE_FRAME_PRESETS } from "../cube/cubeFramePresets";
import { CUBE_BGM_TRACKS, resolveBgmSource, probeBgmAvailability } from "../cube/bgm/bgmTracks";
import { startBgmRecordingSession } from "../cube/bgm/compositeStreamWithBgm";
import {
  CubeVideoRecorder,
  RECORD_ENCODER_FLUSH_MS,
  downloadBlob,
  looksLikeIsoMp4,
  normalizeRecordingBlob,
  resolveRecordingMimeType,
} from "../cube/cubeRecorder";
import {
  applyExportRendererSize,
  restoreRendererLayout,
  resolveCubeExportPixelSize,
  resolveVideoBitsPerSecond,
  snapshotRendererLayout,
  waitForRendererFrames,
  type CubeExportQuality,
} from "../cube/cubeExportCapture";
import { applyResolutionEnhanceBatch } from "../processing/applyResolutionEnhance";
import { processUploadedImages } from "../processing/processImage";
import { applyBackgroundRemovalBatch } from "../processing/applyBackgroundRemoval";
import {
  regenerateBackgroundPlates,
  WEDDING_BACKGROUND_THEMES,
  type BackgroundPlateTheme,
} from "../../shared/lib/backgroundPlate";
import type { PresentationScene } from "../cube/presentationScene";
import type { CubeFocusSettings } from "../cube/CubeFocusPanel";

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
  const [bgmAvailable, setBgmAvailable] = useState<Record<string, boolean>>({});
  const [backgroundTheme, setBackgroundTheme] = useState<BackgroundPlateTheme>("original_blurred");
  const [isCompositingBackground, setIsCompositingBackground] = useState(false);
  const [exportQuality, setExportQuality] = useState<CubeExportQuality>("standard");
  const [isEnhancingResolution, setIsEnhancingResolution] = useState(false);

  const WEDDING_FAN_PROFILE: FanTimelineProfile = "entrance_processional";

  const [cubeSettings, setCubeSettings] = useState<CubeFocusSettings>({
    framePresetId: "rose_gold",
    bgmEnabled: true,
    bgmTrackId: "romantic_wedding",
    bgmCustomUrl: null,
    bgmVolume: 0.85,
    hologramMode: true, // Hologram mode ALWAYS true for 3D Hologram Fan
    particleTheme: "floating_hearts", // Crystal hearts by default
    cubeRotationMode: "yaw_cw",
    gradientColorCycle: true,
  });

  const CUBE_ROTATION_OPTIONS: { id: CubeRotationMode; label: string }[] = [
    { id: "auto", label: "자동" },
    { id: "mixed", label: "혼합" },
    { id: "yaw_cw", label: "좌→우" },
    { id: "yaw_ccw", label: "우→좌" },
    { id: "pitch_up", label: "위로" },
    { id: "pitch_down", label: "아래로" },
    { id: "roll", label: "롤" },
    { id: "corner_swing", label: "코너" },
  ];

  const cubeContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const requestRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const timelineStartRef = useRef(performance.now());
  const presentationRef = useRef<PresentationScene | null>(null);
  const sceneRuntimeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    container: HTMLDivElement;
  } | null>(null);

  // Probe BGM availability
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        CUBE_BGM_TRACKS.map(async (track) => [
          track.id,
          await probeBgmAvailability(track.publicPath),
        ] as const)
      );
      if (!cancelled) {
        setBgmAvailable(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const orderedImages = useMemo(() => processedImages.slice(0, 20), [processedImages]);
  const backgroundPlateSignature = useMemo(
    () => orderedImages.map((img) => img.backgroundPlateUrl ?? "").join("|"),
    [orderedImages]
  );
  const faceCompositeSignature = useMemo(
    () => orderedImages.map((img) => img.faceCompositeUrl ?? "").join("|"),
    [orderedImages]
  );
  const presentationCount = orderedImages.length;
  const motionSeed = useMemo(() => createPresentationMotionSeed(orderedImages, 0), [orderedImages]);

  const segmentMsByStep = useMemo(() =>
    orderedImages.map((_, s) =>
      getStepSegmentMs(motionSeed, s, ZOOM_MS, PARALLAX_MS, "cube_focus", orderedImages.length, WEDDING_FAN_PROFILE)
    ), [orderedImages, motionSeed]
  );
  const loopBridgeMs = useMemo(() => getLoopBridgeMs("cube_focus", presentationCount), [presentationCount]);
  const presentationDurationMs = useMemo(() => sumSegmentDurations(segmentMsByStep) + loopBridgeMs, [segmentMsByStep, loopBridgeMs]);

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

  // 1-Click Process & Remove background batch
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
        preprocessMode: "original",
        onStatus: setProcessingStatus,
        onProgress: (current) => {
          setProcessingProgress(prev => ({ ...prev, current }));
        }
      });

      // NOTE: We intentionally run background removal in the wedding flow.
      // If removal fails, applyBackgroundRemoval now falls back to original so the pipeline never blocks.
      setProcessingStatus("연출용 텍스처 준비 중 (누끼 시도 + 원본 폴백)...");
      const preparedResults = await applyBackgroundRemovalBatch(cropResults, {
        onStatus: setProcessingStatus,
        backgroundPlateTheme: backgroundTheme,
        onProgress: (current, total) => {
          setProcessingProgress({ current, total, message: "배경 제거(누끼) 처리 중..." } as any);
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

    const container = cubeContainerRef.current;
    disposeCubeRenderer(container, rendererRef.current);
    clearCubeMount(container);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Lock to black for hologram fan transparency

    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 1.0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    sceneRuntimeRef.current = { renderer, camera, container };
    // Size the renderer after the browser has laid out the absolute container.
    // clientWidth/Height may be 0 synchronously when the element is first mounted.
    const initSize = () => syncRendererToContainer(renderer, camera, container);
    initSize();
    requestAnimationFrame(initSize);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const pointLight = new THREE.PointLight(0xffffff, 1.5);
    pointLight.position.set(4, 6, 8);
    scene.add(pointLight);

    const loader = new THREE.TextureLoader();
    const textures = orderedImages.map((img) => loader.load(img.url));
    const plateTextures = orderedImages.map((img) =>
      img.backgroundPlateUrl ? loader.load(img.backgroundPlateUrl) : null
    );
    const faceCompositeTextures = orderedImages.map((img) =>
      img.faceCompositeUrl ? loader.load(img.faceCompositeUrl) : null
    );

    const presentation = createPresentationScene(
      "cube_focus",
      orderedImages,
      textures,
      plateTextures,
      cubeSettings.framePresetId,
      cubeSettings.hologramMode,
      cubeSettings.particleTheme,
      faceCompositeTextures
    );
    presentationRef.current = presentation;
    scene.add(presentation.root);

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
      const timeline = recordingRef.current || recordingDuration <= 0
        ? elapsed
        : elapsed % recordingDuration;
      
      const resolved = resolvePresentationTimeline(timeline, segmentMsByStep, loopBridgeMs);

      if (resolved.kind === "loop_bridge") {
        const textureStep = loopBridgeMs > 0 && resolved.bridgeElapsed >= loopBridgeMs * 0.82
          ? 0
          : resolved.lastStep;
        if (textureStep !== appliedStep) {
          presentation.applyStepTexture(textureStep);
          appliedStep = textureStep;
        }
        const frame = computeCubeLoopBridgeFrame(resolved.bridgeElapsed, loopBridgeMs, resolved.lastStep);
        frame.applyRootTransform(presentation.root, resolved.lastStep, presentationCount);
        if (cubeSettings.hologramMode && !recordingRef.current) {
          applyHologramPreviewScale(presentation.root);
        }
        camera.position.x = 0;
        camera.position.y = 0;
        camera.position.z = frame.cameraZ;
        camera.fov = frame.fieldOfView;
        camera.updateProjectionMatrix();
        aimCameraAtCubeOrigin(camera);
        presentation.setParallaxAmount(resolved.lastStep, 0);
      } else {
        const { step: curS, stepElapsed } = resolved;
        const currentFace = getPresentationFace(curS);
        const stepTiming = getStepPhaseTiming(motionSeed, curS, ZOOM_MS, PARALLAX_MS, "cube_focus", presentationCount);
        const stepVariety = getStepMotionVariety(motionSeed, curS);

        const fanPhase = resolveFanPhase(curS, stepElapsed, WEDDING_FAN_PROFILE);
        const textureStep =
          fanPhase.phase === "approach" && curS > 0 ? curS - 1 : curS;
        if (textureStep !== appliedStep) {
          presentation.applyStepTexture(textureStep);
          appliedStep = textureStep;
        }

        const frame = computePresentationFrame("cube_focus", curS, stepElapsed, presentationCount, currentFace, {
          timing: stepTiming,
          variety: stepVariety,
          imageCenter: cubeSettings.hologramMode
            ? { x: 50, y: 50 }
            : orderedImages[curS]?.center,
          cubeRotationMode: cubeSettings.cubeRotationMode,
          exportRecording: recordingRef.current,
          motionSeed,
          fanTimelineProfile: WEDDING_FAN_PROFILE,
          hologramMode: cubeSettings.hologramMode,
        });
        frame.applyRootTransform(presentation.root, curS, presentationCount);
        if (cubeSettings.hologramMode && !recordingRef.current) {
          applyHologramPreviewScale(presentation.root);
        }
        camera.position.x = frame.cameraOffsetX ?? 0;
        camera.position.y = frame.cameraOffsetY ?? 0;
        camera.position.z = frame.cameraZ;
        camera.fov = frame.fieldOfView;
        camera.updateProjectionMatrix();
        aimCameraAtCubeOrigin(camera);
        presentation.setParallaxAmount(curS, frame.parallaxAmount);
      }
      if (presentation.updateTextureCarousel) {
        presentation.updateTextureCarousel(presentation.root.rotation.y);
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
      textures.forEach(t => t.dispose());
      plateTextures.forEach(t => t?.dispose());
      faceCompositeTextures.forEach((t) => t?.dispose());
      disposeCubeRenderer(container, renderer);
      rendererRef.current = null;
      sceneRuntimeRef.current = null;
    };
  }, [step, active, orderedImages, presentationCount, presentationDurationMs, backgroundPlateSignature, faceCompositeSignature, motionSeed, cubeSettings.framePresetId, cubeSettings.hologramMode, cubeSettings.particleTheme, cubeSettings.cubeRotationMode, cubeSettings.gradientColorCycle]);

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
    const { renderer, camera, container } = runtime;

    const recordDurationMs = presentationDurationMs + RECORD_ENCODER_FLUSH_MS;
    const maxEnhanceScale = orderedImages.some((img) => img.resolutionEnhanceScale === 2) ? 2 : 1;
    const exportSize = resolveCubeExportPixelSize(exportQuality, maxEnhanceScale);
    const layout = snapshotRendererLayout(renderer, camera);

    const bgmUrl = cubeSettings.bgmEnabled && cubeSettings.bgmTrackId !== "none"
      ? resolveBgmSource(cubeSettings.bgmTrackId, null)
      : null;
    const withAudio = Boolean(bgmUrl) && !window.__MBOX_E2E_EXPORT__;

    setIsRecording(true);
    setRecordingMessage(
      withAudio
        ? `웨딩 BGM 합성 및 ${exportSize}px MP4 인코딩 중...`
        : `${exportSize}px MP4 비디오 생성 중...`
    );

    let bgmSession: Awaited<ReturnType<typeof startBgmRecordingSession>> | null = null;

    try {
      if (presentationRef.current?.resetTextureCarousel) {
        presentationRef.current.resetTextureCarousel();
      }

      applyExportRendererSize(renderer, camera, exportSize);
      await waitForRendererFrames(3);

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
      recordingRef.current = true;

      await new Promise<void>((resolve) => window.setTimeout(resolve, 150));

      timelineStartRef.current = performance.now();
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
    <div className="w-full max-w-5xl mx-auto p-6 md:p-8 wedding-glass-panel relative overflow-hidden animate-fade-in-up">
      {/* Decorative ambient background glows */}
      <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-rose-500/10 blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full bg-violet-600/10 blur-[100px] pointer-events-none" />

      {/* Elegant Header with step progression */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-900/60 pb-6 mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-black bg-gradient-to-r from-rose-200 via-pink-400 to-violet-300 bg-clip-text text-transparent flex items-center gap-2.5 wedding-title-glow">
            <Heart className="fill-rose-500 stroke-none icon-float" size={26} />
            웨딩 홀로그램 오퍼레이터
          </h2>
          <p className="text-slate-400 text-xs mt-1.5 font-medium tracking-wide">
            식장 홀로그램 디스플레이를 위한 1:1 MP4 비디오 자동 빌더
          </p>
        </div>

        {/* Wizard Progression Steps */}
        <div className="flex items-center gap-3 bg-slate-950/60 px-4 py-2 rounded-2xl border border-slate-900">
          {[
            { num: 1, label: "사진 업로드" },
            { num: 2, label: "AI 변환" },
            { num: 3, label: "MP4 다운로드" }
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs transition-all duration-300 ${
                step === s.num
                  ? "bg-gradient-to-r from-rose-500 to-pink-500 border-none text-white font-extrabold scale-110 shadow-md shadow-rose-500/30"
                  : step > s.num
                    ? "bg-emerald-600 border-none text-white font-bold"
                    : "border-slate-800 text-slate-500"
               }`}>
                {step > s.num ? "✓" : s.num}
              </span>
              <span className={`text-xs font-semibold tracking-tight ${step === s.num ? "text-rose-200" : "text-slate-500"}`}>
                {s.label}
              </span>
              {s.num < 3 && <ArrowRight size={10} className="text-slate-800" />}
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
              <div className="w-20 h-20 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-400 group-hover:scale-105 transition-transform duration-300 shadow-inner">
                <UploadIcon size={36} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-200 tracking-wide">웨딩 사진 업로드</h3>
                <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
                  디스플레이에 송출할 신랑, 신부의 멋진 고해상도 인물 사진을 <strong>3~20장</strong> 등록하세요.
                </p>
              </div>
            </div>
          </div>

          {sourceImages.length > 0 && (
            <div className="space-y-4 pt-4 animate-fade-in-up">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">선택된 이미지 ({sourceImages.length}/20)</h4>
                <button
                  type="button"
                  onClick={() => setSourceImages([])}
                  className="text-xs text-rose-400 hover:text-rose-300 font-bold transition-colors"
                >
                  전체 취소
                </button>
              </div>
              
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                {sourceImages.map((src, i) => (
                  <div key={i} className="aspect-square rounded-2xl border border-slate-900 overflow-hidden relative group shadow-lg">
                    <img src={src} className="w-full h-full object-cover" alt="Uploaded Wedding Source" />
                    <button
                      type="button"
                      onClick={() => handleRemoveSourceImage(i)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-xl bg-slate-950/80 hover:bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAutoProcess}
                disabled={sourceImages.length < 3}
                className="w-full py-4.5 rounded-2xl btn-premium text-sm flex items-center justify-center gap-2 mt-6"
              >
                <Flame size={18} className="fill-white" />
                AI 원클릭 자동 보정 시작 (배경 유지)
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: AI BATCH PROCESSING */}
      {step === 2 && (
        <div className="py-20 flex flex-col items-center justify-center gap-8">
          <div className="relative flex items-center justify-center">
            <div className="w-28 h-28 rounded-full border-4 border-rose-500/10 border-t-rose-500 animate-spin" />
            <Sparkles className="absolute text-rose-400 animate-pulse" size={40} />
          </div>
          
          <div className="text-center space-y-3">
            <h3 className="text-xl font-bold text-slate-100 tracking-wide">AI 3D 홀로그램 전처리 진행 중...</h3>
            <p className="text-xs text-rose-400 font-mono tracking-widest uppercase">{processingStatus}</p>
          </div>

          <div className="w-full max-w-sm bg-slate-950 border border-slate-900 h-2.5 rounded-full overflow-hidden shadow-inner">
            <div
              className="bg-gradient-to-r from-rose-500 via-pink-500 to-violet-500 h-full transition-all duration-300"
              style={{ width: `${(processingProgress.current / Math.max(1, processingProgress.total)) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest font-mono">
            {processingProgress.current} / {processingProgress.total} COMPLETED
          </span>
        </div>
      )}

      {/* STEP 3: PREVIEW & CUSTOM CONFIG */}
      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Hologram Viewport */}
          <div className="lg:col-span-6 space-y-4">
            <div className="hologram-viewport-container aspect-square w-full max-w-[460px] mx-auto">
              <div
                ref={cubeContainerRef}
                className="cube-canvas-mount cursor-grab active:cursor-grabbing"
              />
              <div className="hologram-viewport-badge absolute top-5 left-5 pointer-events-none z-10">
                <span className="px-3 py-1.5 rounded-xl bg-slate-950/80 border border-rose-500/20 text-[9px] text-rose-300 font-black tracking-widest uppercase flex items-center gap-1.5 shadow-md">
                  <Play size={10} className="fill-rose-300 stroke-none" />
                  3D HOLOGRAM FAN SIMULATION
                </span>
              </div>
            </div>
            <p className="text-center text-[10px] text-slate-500 font-semibold tracking-wide">
              사각 프레임·컬러 매트가 적용된 큐브가 화면 중앙에 표시됩니다. MP4보내기는 동일 연출을 사용합니다.
            </p>
          </div>

          {/* Quick Settings Configuration */}
          <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              {/* Preset Selection - Frame */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-slate-400 tracking-wider flex items-center gap-2">
                  <Sparkles size={14} className="text-rose-400" />
                  프레임 디자인
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CUBE_FRAME_PRESETS.slice(0, 3).map((preset) => {
                    const selected = cubeSettings.framePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setCubeSettings(prev => ({ ...prev, framePresetId: preset.id }))}
                        className={`rounded-2xl px-3 py-3 text-left option-select-btn ${selected ? "active" : ""}`}
                      >
                        <div className={`mb-2 h-1.5 rounded-full bg-gradient-to-r ${preset.swatchClass} shadow-md`} />
                        <p className="text-[11px] font-extrabold text-slate-200">{preset.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preset Selection - Background composition */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-slate-400 tracking-wider flex items-center gap-2">
                  <ImageIcon size={14} className="text-rose-400" />
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
                        onClick={() => void handleBackgroundThemeChange(themeOption.id)}
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

              {/* Cube rotation */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-slate-400 tracking-wider flex items-center gap-2">
                  <RotateCcw size={14} className="text-rose-400" />
                  큐브 회전 방향
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {CUBE_ROTATION_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={isRecording}
                      onClick={() => setCubeSettings((prev) => ({ ...prev, cubeRotationMode: option.id }))}
                      className={`rounded-xl py-2 text-[10px] font-bold option-select-btn ${
                        cubeSettings.cubeRotationMode === option.id ? "active" : ""
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cubeSettings.gradientColorCycle}
                  disabled={isRecording}
                  onChange={(event) =>
                    setCubeSettings((prev) => ({ ...prev, gradientColorCycle: event.target.checked }))
                  }
                  className="rounded border-slate-700 bg-slate-950 text-rose-500 focus:ring-rose-500"
                />
                <span>액자·장면 색상 그라데이션 순환</span>
              </label>

              {/* Preset Selection - Particle */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-slate-400 tracking-wider flex items-center gap-2">
                  <Heart size={14} className="text-rose-400" />
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
                        onClick={() => setCubeSettings(prev => ({ ...prev, particleTheme: themeOption.id as any }))}
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
                <label className="text-xs font-bold text-slate-400 tracking-wider flex items-center gap-2">
                  <DownloadIcon size={14} className="text-rose-400" />
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
                  className="w-full rounded-2xl py-3 text-xs font-bold border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 transition-colors disabled:opacity-40"
                >
                  {isEnhancingResolution ? "2× 해상도 향상 중..." : "보관함 2× 해상도 향상 (선택)"}
                </button>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  미리보기는 화면 크기로 보이지만 MP4는 선택한 픽셀 해상도로 녹화됩니다. 더 선명하게 받으려면 2× 향상 후 2048px를 선택하세요.
                </p>
              </div>

              {/* Preset Selection - BGM */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-slate-400 tracking-wider flex items-center gap-2">
                  <Music size={14} className="text-rose-400" />
                  배경음악 (BGM)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CUBE_BGM_TRACKS.map((track) => {
                    const available = bgmAvailable[track.id] ?? false;
                    const selected = cubeSettings.bgmTrackId === track.id;
                    return (
                      <button
                        key={track.id}
                        type="button"
                        disabled={!available}
                        onClick={() => setCubeSettings(prev => ({ ...prev, bgmTrackId: track.id }))}
                        className={`rounded-2xl py-3 text-center text-xs font-bold option-select-btn ${
                          selected ? "active" : ""
                        } ${!available ? "opacity-25 cursor-not-allowed" : ""}`}
                      >
                        {track.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Render & Export Actions */}
            <div className="space-y-4 pt-6 border-t border-slate-900/60">
              {recordingMessage && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2.5 shadow-md">
                  {(isRecording || isCompositingBackground) ? (
                    <Loader2 className="animate-spin text-rose-400" size={14} />
                  ) : null}
                  <span className="font-semibold">{recordingMessage}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isRecording}
                  className="px-4.5 py-4 rounded-2xl border border-slate-900 bg-slate-950/60 hover:bg-slate-900/40 text-slate-400 hover:text-slate-200 transition-all duration-300 flex items-center justify-center shadow-md active:scale-95"
                  title="새로운 영상 만들기"
                >
                  <RotateCcw size={18} />
                </button>
                
                <button
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
