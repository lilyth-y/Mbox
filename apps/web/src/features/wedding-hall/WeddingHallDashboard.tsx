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
  Heart
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
import { resolveFanPhase } from "../cube/cubeFanTimeline";
import { getGradientShift } from "../cube/presentationGradient";
import {
  clearCubeMount,
  disposeCubeRenderer,
  syncRendererToContainer,
} from "../cube/cubeSceneLifecycle";
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
import { processUploadedImages } from "../processing/processImage";
import { applyPresentationPrepareBatch } from "../processing/applyPresentationPrepare";
import type { PresentationScene } from "../cube/presentationScene";
import type { CubeFocusSettings } from "../cube/CubeFocusPanel";

export interface WeddingHallDashboardProps {
  active: boolean;
}

export function WeddingHallDashboard({ active }: WeddingHallDashboardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceImages, setSourceImages] = useState<string[]>([]);
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState("");
  const [bgmAvailable, setBgmAvailable] = useState<Record<string, boolean>>({});

  const [cubeSettings, setCubeSettings] = useState<CubeFocusSettings>({
    framePresetId: "rose_gold",
    bgmEnabled: true,
    bgmTrackId: "romantic_wedding",
    bgmCustomUrl: null,
    bgmVolume: 0.85,
    hologramMode: true, // Hologram mode active by default
    particleTheme: "floating_hearts", // Crystal hearts by default
    cubeRotationMode: "auto",
    gradientColorCycle: false,
  });

  const cubeContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const requestRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const timelineStartRef = useRef(performance.now());
  const presentationRef = useRef<PresentationScene | null>(null);

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
  const presentationCount = orderedImages.length;
  const motionSeed = useMemo(() => createPresentationMotionSeed(orderedImages, 0), [orderedImages]);

  const segmentMsByStep = useMemo(() =>
    orderedImages.map((_, s) =>
      getStepSegmentMs(motionSeed, s, ZOOM_MS, PARALLAX_MS, "cube_focus", orderedImages.length)
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
    setIsProcessing(true);
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

      setProcessingStatus("연출용 텍스처 준비 중 (배경 유지)...");
      const preparedResults = await applyPresentationPrepareBatch(cropResults, {
        onStatus: setProcessingStatus,
        onProgress: (current, total) => {
          setProcessingProgress({ current, total });
        },
      });

      setProcessedImages(preparedResults);
      setIsProcessing(false);
      setStep(3);
    } catch (err) {
      console.error(err);
      alert(`AI 자동 연출 생성 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`);
      setIsProcessing(false);
      setStep(1);
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
    scene.background = new THREE.Color(0x000000); // Lock to black for hologram

    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 1.0);
    container.appendChild(renderer.domElement);
    syncRendererToContainer(renderer, camera, container);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const pointLight = new THREE.PointLight(0xffffff, 1.2);
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
        camera.position.x = 0;
        camera.position.y = 0;
        camera.position.z = frame.cameraZ;
        camera.fov = frame.fieldOfView;
        camera.updateProjectionMatrix();
        presentation.setParallaxAmount(resolved.lastStep, 0);
      } else {
        const { step: curS, stepElapsed } = resolved;
        const currentFace = getPresentationFace(curS);
        const stepTiming = getStepPhaseTiming(motionSeed, curS, ZOOM_MS, PARALLAX_MS, "cube_focus", presentationCount);
        const stepVariety = getStepMotionVariety(motionSeed, curS);

        const fanPhase = resolveFanPhase(curS, stepElapsed);
        const textureStep =
          fanPhase.phase === "approach" && curS > 0 ? curS - 1 : curS;
        if (textureStep !== appliedStep) {
          presentation.applyStepTexture(textureStep);
          appliedStep = textureStep;
        }

        const frame = computePresentationFrame("cube_focus", curS, stepElapsed, presentationCount, currentFace, {
          timing: stepTiming,
          variety: stepVariety,
          imageCenter: orderedImages[curS]?.center,
          cubeRotationMode: cubeSettings.cubeRotationMode,
          exportRecording: recordingRef.current,
          motionSeed,
        });
        frame.applyRootTransform(presentation.root, curS, presentationCount);
        camera.position.x = frame.cameraOffsetX ?? 0;
        camera.position.y = frame.cameraOffsetY ?? 0;
        camera.position.z = frame.cameraZ;
        camera.fov = frame.fieldOfView;
        camera.updateProjectionMatrix();
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
    };
  }, [step, active, orderedImages, presentationCount, presentationDurationMs, cubeSettings.framePresetId, cubeSettings.hologramMode, cubeSettings.particleTheme, cubeSettings.cubeRotationMode, cubeSettings.gradientColorCycle]);

  // Export video (marriage.mp4)
  const handleExportVideo = async () => {
    const renderer = rendererRef.current;
    if (!renderer || presentationCount === 0 || isRecording) {
      return;
    }

    const recordDurationMs = presentationDurationMs + RECORD_ENCODER_FLUSH_MS;
    const bgmUrl = cubeSettings.bgmEnabled && cubeSettings.bgmTrackId !== "none"
      ? resolveBgmSource(cubeSettings.bgmTrackId, null)
      : null;
    const withAudio = Boolean(bgmUrl) && !window.__MBOX_E2E_EXPORT__;

    setIsRecording(true);
    setRecordingMessage(withAudio ? "웨딩 BGM 합성 및 MP4 파일 인코딩 중..." : "MP4 비디오 생성 중...");

    let bgmSession: Awaited<ReturnType<typeof startBgmRecordingSession>> | null = null;

    try {
      if (presentationRef.current?.resetTextureCarousel) {
        presentationRef.current.resetTextureCarousel();
      }

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

      // 150ms 웜업 대기 (초기 비디오/오디오 파이프라인 프레임 드랍 방지)
      await new Promise<void>((resolve) => window.setTimeout(resolve, 150));

      timelineStartRef.current = performance.now();
      recorder.start(recordStream, mimeType);

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
      setRecordingMessage(`${outName} 동영상이 다운로드되었습니다.`);
    } catch (err) {
      bgmSession?.stop();
      alert(`MP4 생성 실패: ${err instanceof Error ? err.message : String(err)}`);
      setRecordingMessage("");
    } finally {
      recordingRef.current = false;
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
    <div className="w-full max-w-6xl mx-auto p-4 md:p-6 bg-slate-950/80 backdrop-blur-2xl border border-slate-900 rounded-3xl shadow-2xl relative overflow-hidden">
      
      {/* Background glowing meshes */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />

      {/* Title & workflow indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-900 pb-6 mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-black bg-gradient-to-r from-rose-300 via-pink-400 to-violet-400 bg-clip-text text-transparent flex items-center gap-2">
            <Heart className="fill-rose-400 stroke-none" size={24} />
            결혼식장 간편 홀로그램 오퍼레이터
          </h2>
          <p className="text-slate-400 text-xs mt-1">식장/전시장의 3D 홀로그램 팬 디스플레이 전용 1:1 비디오 생성 도구</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs font-semibold">
          {[
            { num: 1, label: "사진 선택" },
            { num: 2, label: "자동 변환" },
            { num: 3, label: "MP4 다운로드" }
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                step === s.num
                  ? "bg-rose-500 border-rose-400 text-white font-bold scale-110"
                  : step > s.num
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : "border-slate-800 text-slate-500"
              }`}>
                {step > s.num ? "✓" : s.num}
              </span>
              <span className={step === s.num ? "text-slate-200" : "text-slate-500"}>{s.label}</span>
              {s.num < 3 && <ArrowRight size={12} className="text-slate-800" />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-slate-900/40 border-2 border-dashed border-rose-500/20 hover:border-rose-400/40 rounded-3xl p-10 text-center transition relative group">
            <input
              type="file"
              multiple
              accept="image/*"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileSelect}
            />
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-300 group-hover:scale-105 transition">
                <UploadIcon size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-200">웨딩 이미지 등록</h3>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                식장에서 전시할 신랑, 신부 사진을 <strong>3~20장</strong> 선택하세요. <br />
                (드래그 앤 드롭 또는 클릭하여 업로드 가능)
              </p>
            </div>
          </div>

          {sourceImages.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">업로드된 파일 ({sourceImages.length}/20장)</h4>
                <button
                  type="button"
                  onClick={() => setSourceImages([])}
                  className="text-xs text-slate-500 hover:text-slate-300 underline"
                >
                  전체 삭제
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {sourceImages.map((src, i) => (
                  <div key={i} className="aspect-square rounded-2xl border border-slate-800 overflow-hidden relative group">
                    <img src={src} className="w-full h-full object-cover" alt="Source" />
                    <button
                      type="button"
                      onClick={() => handleRemoveSourceImage(i)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-black/70 hover:bg-red-600/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAutoProcess}
                disabled={sourceImages.length < 3}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-500 via-pink-600 to-violet-600 text-white font-bold text-sm tracking-wide shadow-lg hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Flame size={18} />
                AI 원클릭 자동 보정 시작 (배경 유지)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: AI Processing */}
      {step === 2 && (
        <div className="py-16 flex flex-col items-center justify-center gap-6 animate-pulse">
          <div className="relative flex items-center justify-center">
            <div className="w-24 h-24 rounded-full border-4 border-rose-500/20 border-t-rose-400 animate-spin" />
            <Sparkles className="absolute text-rose-300 animate-bounce" size={32} />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-bold text-slate-200">AI 3D 홀로그램 전처리 진행 중...</h3>
            <p className="text-xs text-rose-400 font-mono tracking-wide">{processingStatus}</p>
          </div>
          <div className="w-full max-w-xs bg-slate-900 border border-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-rose-500 to-pink-500 h-full transition-all duration-300"
              style={{ width: `${(processingProgress.current / Math.max(1, processingProgress.total)) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
            {processingProgress.current} / {processingProgress.total} 완료
          </span>
        </div>
      )}

      {/* Step 3: Preview & Export */}
      {step === 3 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
          {/* 3D Visualizer viewport */}
          <div className="lg:col-span-6 space-y-3">
            <div className="bg-slate-950 border border-slate-900 rounded-3xl overflow-hidden shadow-inner relative flex items-center justify-center aspect-square w-full max-w-[500px] mx-auto">
              <div
                ref={cubeContainerRef}
                className="w-full aspect-square cursor-grab active:cursor-grabbing"
              />
              <div className="absolute top-4 left-4 pointer-events-none">
                <span className="px-2 py-0.5 rounded bg-rose-500/10 border border-rose-400/20 text-[10px] text-rose-300 font-bold uppercase tracking-wider">
                  3D HOLOGRAM FAN SIMULATION
                </span>
              </div>
            </div>
            <p className="text-center text-[11px] text-slate-500">
              드래그하면 마우스로 큐브 회전축을 조작할 수 있습니다.
            </p>
          </div>

          {/* Quick Settings & Export Panel */}
          <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              {/* Frame Style Select */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={14} className="text-rose-400" />
                  액자 프레임 선택
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {CUBE_FRAME_PRESETS.slice(0, 3).map((preset) => {
                    const selected = cubeSettings.framePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setCubeSettings(prev => ({ ...prev, framePresetId: preset.id }))}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          selected
                            ? "border-rose-400 bg-rose-500/10"
                            : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
                        }`}
                      >
                        <div className={`mb-1.5 h-1.5 rounded-full bg-gradient-to-r ${preset.swatchClass}`} />
                        <p className="text-[11px] font-bold text-slate-100">{preset.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Particle Theme Select */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Heart size={14} className="text-rose-400" />
                  웨딩 파티클 필터
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "none", label: "없음" },
                    { id: "gold_dust", label: "금가루 (Gold)" },
                    { id: "white_petals", label: "벚꽃 꽃잎 (Petals)" },
                    { id: "floating_hearts", label: "보석 하트 (Hearts)" },
                    { id: "confetti", label: "컨페티 (Confetti)" },
                  ].map((themeOption) => {
                    const selected = cubeSettings.particleTheme === themeOption.id;
                    return (
                      <button
                        key={themeOption.id}
                        type="button"
                        onClick={() => setCubeSettings(prev => ({ ...prev, particleTheme: themeOption.id as any }))}
                        className={`rounded-xl border py-2 text-center text-xs transition ${
                          selected
                            ? "border-rose-400 bg-rose-500/10 text-rose-200"
                            : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        {themeOption.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* BGM Track Select */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Music size={14} className="text-rose-400" />
                  배경 음악 (BGM)
                </span>
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
                        className={`rounded-xl border py-2 text-center text-xs transition ${
                          selected
                            ? "border-rose-400 bg-rose-500/10 text-rose-200"
                            : available
                              ? "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700"
                              : "border-slate-900 opacity-30 cursor-not-allowed text-slate-600"
                        }`}
                      >
                        {track.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-6 border-t border-slate-900">
              {recordingMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
                  <Loader2 className="animate-spin text-rose-400" size={14} />
                  <span>{recordingMessage}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isRecording}
                  className="px-4 py-3.5 rounded-2xl border border-slate-800 hover:bg-slate-900/60 text-slate-400 hover:text-slate-200 transition flex items-center justify-center"
                  title="다시 만들기"
                >
                  <RotateCcw size={18} />
                </button>
                
                <button
                  type="button"
                  onClick={handleExportVideo}
                  disabled={isRecording}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:brightness-110 active:scale-[0.99] text-white font-bold text-sm tracking-wide shadow-lg disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  {isRecording ? <Loader2 className="animate-spin" size={18} /> : <DownloadIcon size={18} />}
                  marriage.mp4 동영상 파일 만들기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
