import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Download, Loader2, Play } from "lucide-react";
import * as THREE from "three";
import type { ProcessedImage } from "../../shared/types";
import {
  PHOTO_SEGMENT_MS,
  getPresentationFace,
  getSequenceDurationMs,
} from "./cubeSequence";
import { computePresentationFrame } from "./presentationFrame";
import {
  DEFAULT_PRESENTATION_EFFECT,
  PRESENTATION_EFFECTS,
  type PresentationEffectId,
} from "./presentationEffects";
import { createPresentationScene } from "./presentationScene";
import {
  constrainPresentationImages,
  formatPresentationBytes,
  getPresentationTotalBytes,
  MAX_PRESENTATION_BYTES,
} from "../../shared/lib/mediaLimits";
import { CubeVideoRecorder, downloadBlob, resolveRecordingMimeType } from "./cubeRecorder";

interface CubeViewProps {
  active: boolean;
  processedImages: ProcessedImage[];
}

export function CubeView({ active, processedImages }: CubeViewProps) {
  const cubeContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const requestRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const [presentationKey, setPresentationKey] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedEffect, setSelectedEffect] =
    useState<PresentationEffectId>(DEFAULT_PRESENTATION_EFFECT);

  const orderedImages = useMemo(
    () => constrainPresentationImages(processedImages),
    [processedImages]
  );
  const presentationCount = orderedImages.length;
  const omittedCount = processedImages.length - orderedImages.length;
  const presentationBytes = useMemo(
    () => getPresentationTotalBytes(orderedImages),
    [orderedImages]
  );
  const segmentDuration = PHOTO_SEGMENT_MS;
  const selectedEffectDefinition =
    PRESENTATION_EFFECTS.find((effect) => effect.id === selectedEffect) ??
    PRESENTATION_EFFECTS[0];

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
    scene.background = new THREE.Color(0x0f172a);

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
    const presentation = createPresentationScene(selectedEffect, orderedImages, textures);
    scene.add(presentation.root);

    const startTime = performance.now();
    const recordingDuration = getSequenceDurationMs(presentationCount);
    let appliedStep = -1;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const timeline = recordingRef.current ? elapsed : elapsed % recordingDuration;
      const step = Math.min(presentationCount - 1, Math.floor(timeline / segmentDuration));
      const stepElapsed = timeline - step * segmentDuration;
      const currentFace = getPresentationFace(step);

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
        currentFace
      );
      frame.applyRootTransform(presentation.root, step, presentationCount);
      camera.position.z = frame.cameraZ;
      camera.fov = frame.fieldOfView;
      camera.updateProjectionMatrix();
      presentation.setParallaxAmount(step, frame.parallaxAmount);

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
      presentation.dispose();
      textures.forEach((texture) => texture.dispose());
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [
    active,
    orderedImages,
    presentationCount,
    presentationKey,
    segmentDuration,
    selectedEffect,
  ]);

  const handleApplyPresentation = () => {
    if (presentationCount === 0 || isRecording) {
      return;
    }
    setPresentationKey((value) => value + 1);
    setRecordingMessage("선택한 템플릿으로 연출을 처음부터 다시 적용했습니다.");
    window.setTimeout(() => setRecordingMessage(""), 4000);
  };

  const handleDownloadVideo = async () => {
    const renderer = rendererRef.current;
    if (!renderer || presentationCount === 0 || isRecording) {
      return;
    }

    setIsRecording(true);
    setRecordingMessage("선택한 연출을 MP4로 생성하는 중입니다...");

    try {
      const { mimeType, extension } = resolveRecordingMimeType();
      const recorder = new CubeVideoRecorder();
      const stream = renderer.domElement.captureStream(30);
      recorder.start(stream, mimeType);
      recordingRef.current = true;
      setPresentationKey((value) => value + 1);

      await new Promise<void>((resolve) => {
        const startedAt = performance.now();
        const wait = (now: number) => {
          if (now - startedAt >= getSequenceDurationMs(presentationCount)) {
            resolve();
            return;
          }
          requestAnimationFrame(wait);
        };
        requestAnimationFrame(wait);
      });

      const blob = await recorder.stop();
      downloadBlob(blob, `mbox-${selectedEffect}.${extension}`);
      setRecordingMessage(
        extension === "mp4"
          ? "MP4 생성 파일이 준비되었습니다."
          : "브라우저가 MP4를 지원하지 않아 WebM으로 저장했습니다."
      );
    } catch (error) {
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
          <h2 className="font-bold">3D 프레젠테이션 템플릿</h2>
        </div>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          배경 생성과 같이 <strong className="text-slate-300">템플릿 선택 → 연출 적용 → MP4 생성</strong> 순서입니다.
          템플릿을 바꾸면 바로 미리보기가 갱신되고, 같은 템플릿으로 처음부터 다시 돌리려면「연출 적용」을 누르세요.
        </p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          1. 템플릿 선택 · 2. 연출 적용 · 3. MP4 생성
        </p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {PRESENTATION_EFFECTS.map((effect) => {
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
            MP4 생성
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
            {selectedEffectDefinition.label} · 사진당 약 5초로 천천히 전환한 뒤 정면에서 장면에 머무르며
            인물·배경 원근을 적용합니다.
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
                재생 {presentationCount}장 · 현재 {currentStep}/{presentationCount}번째 · 용량{" "}
                {formatPresentationBytes(presentationBytes)} /{" "}
                {formatPresentationBytes(MAX_PRESENTATION_BYTES)}
              </p>
            )}
            {omittedCount > 0 ? (
              <p className="mt-2 text-amber-300">
                1GB 한도로 {omittedCount}장은 재생에서 제외되었습니다.
              </p>
            ) : null}
            {recordingMessage ? <p className="mt-2 text-slate-400">{recordingMessage}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
