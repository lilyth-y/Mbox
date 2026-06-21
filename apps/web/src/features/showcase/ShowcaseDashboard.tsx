import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArrowLeft, Box, Download, Loader2, Play, Upload } from "lucide-react";

import type { ProcessedImage } from "../../shared/types";

import { processShowcaseUpload } from "./processShowcaseUpload";

import { bootstrapLocalWorkspace } from "../events/workspaceBackend";

import type { ShowcasePhysicsSceneHandle } from "./babylon/createShowcasePhysicsScene";

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
import { resolveShowcaseBackgroundMediaPath } from "./showcaseBackgroundMedia";
import {
  auditShowcaseShapeRuntime,
  type ShowcaseShapeAuditResult,
} from "./showcaseShapeAcceptance";
import "./showcase-style.css";

import { createShowcaseDemoDataUrl } from "./showcaseDemoImages";

import {
  computeShowcaseExportDurationMs,
  exportShowcaseMp4,
} from "./showcaseExportCapture";
import { evaluateShowcaseExportReadiness } from "./showcaseExportReadiness";
import { ShowcaseDomMediaBackdrop } from "./showcaseDomMediaBackdrop";

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

  rotate: "회전",

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



export function ShowcaseDashboard() {

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const viewportWrapRef = useRef<HTMLDivElement>(null);
  const spillRef = useRef<HTMLDivElement>(null);

  const sceneRef = useRef<ShowcasePhysicsSceneHandle | null>(null);

  const playingRef = useRef(true);

  /** User upload must win over async workspace bootstrap. */
  const userImagesOverrideRef = useRef(false);

  const imagesRef = useRef<ProcessedImage[] | null>(null);

  const sceneLoadTokenRef = useRef(0);

  const sceneImagesKeyRef = useRef<string | null>(null);

  const sceneJewelProfileKeyRef = useRef<string | null>(null);

  const uploadGenerationRef = useRef(0);

  const sceneImagesApplyChainRef = useRef(Promise.resolve());



  const [images, setImages] = useState<ProcessedImage[] | null>(null);

  const [status, setStatus] = useState("Havok 물리 엔진을 준비하는 중…");

  const [ready, setReady] = useState(false);

  const [playing, setPlaying] = useState(true);

  const [fallPhysicsEnabled, setFallPhysicsEnabled] = useState(false);

  const [phase, setPhase] = useState<ShowcasePipelineStageId>("reveal");

  const [currentStep, setCurrentStep] = useState(1);

  const [catalog, setCatalog] = useState<ShowcaseCatalogOptions>(() =>

    parseShowcaseCatalogFromSearch(window.location.search)

  );

  const [applyBackgroundRemoval, setApplyBackgroundRemoval] = useState(false);

  const [isRecording, setIsRecording] = useState(false);

  const [exportMessage, setExportMessage] = useState("");

  const [isProcessingUpload, setIsProcessingUpload] = useState(false);

  const [backdropSource, setBackdropSource] = useState<HTMLVideoElement | HTMLImageElement | null>(
    null
  );
  const backdropSourceRef = useRef(backdropSource);
  backdropSourceRef.current = backdropSource;

  const backdropMediaPath = useMemo(
    () =>
      catalog.backgroundMediaSource !== "none"
        ? resolveShowcaseBackgroundMediaPath(catalog)
        : null,
    [catalog]
  );

  const environmentKey = useMemo(() => buildEnvironmentKey(catalog), [catalog]);

  const jewelProfileKey = useMemo(() => buildJewelProfileKey(catalog), [catalog]);

  const handleBackdropReady = useCallback((source: HTMLVideoElement | HTMLImageElement | null) => {
    setBackdropSource(source);
  }, []);

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

    let cancelled = false;

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

        } else {

          setImages(DEMO_IMAGES);

          setStatus("데모 사진으로 크리스탈 쇼케이스를 재생합니다.");

        }

      })

      .catch(() => {

        if (!cancelled && !userImagesOverrideRef.current) {

          setImages(DEMO_IMAGES);

          setStatus("데모 사진으로 크리스탈 쇼케이스를 재생합니다.");

        }

      });

    return () => {

      cancelled = true;

    };

  }, []);



  const fallPhysicsRef = useRef(fallPhysicsEnabled);

  fallPhysicsRef.current = fallPhysicsEnabled;



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

      setReady(false);

      setStatus("Havok WASM · 물리 씬 로딩…");



      const { createShowcasePhysicsScene } = await import("./babylon/createShowcasePhysicsScene");

      if (cancelled) {

        return;

      }



      const snapshot = imagesRef.current;

      if (!snapshot?.length) {

        return;

      }



      try {

        sceneHandle = await createShowcasePhysicsScene(canvas, snapshot, {

          fallPhysicsEnabled: fallPhysicsRef.current,

          catalog: catalogRef.current,

          backdropMediaElement: backdropSourceRef.current,

          backdropSpillElement: spillRef.current,

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

        const message = error instanceof Error ? error.message : "초기화 실패";

        setStatus(`물리 씬 오류: ${message}`);

      }

    })();



    return () => {

      cancelled = true;

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

  }, [hasPresentationImages, environmentKey]);



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

      const { preview, refinement, usedCloud } = await processShowcaseUpload(sourceImages, {
        applyBackgroundRemoval,
        onStatus: setStatus,
      });

      const nextImages = preview.slice(0, 20);
      userImagesOverrideRef.current = true;
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
        const refinedImages = refined.slice(0, 20);
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

    setExportMessage(`연출 녹화 중… (약 ${durationSec}초)`);

    try {

      const { filename } = await exportShowcaseMp4(handle, {

        imageCount: presentationCount,

        fallPhysicsEnabled,

        catalog,

        backdropMediaPath,

        backdropElement: backdropSourceRef.current,

        backdropOpacity: catalog.backgroundMediaOpacity,

        backgroundPreset: catalog.backgroundPreset,

        viewportElement: viewportWrapRef.current,

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
                mediaPath={backdropMediaPath}
                opacity={catalog.backgroundMediaOpacity}
                onReady={handleBackdropReady}
              />

              <div ref={spillRef} className="showcase-backdrop-spill" aria-hidden />

              <canvas

                ref={canvasRef}

                className="showcase-canvas"

                aria-label="3D physics showcase viewport"

              />

              {!ready && (

                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm">

                  <Loader2 className="w-8 h-8 animate-spin text-mbox-gold" aria-hidden />

                  <p className="text-sm text-mbox-muted">Havok WASM 로딩 중…</p>

                </div>

              )}

            </div>

          </div>



          <ShowcaseCatalogPanel

            value={catalog}

            onChange={handleCatalogChange}

            disabled={!images}

          />

        </div>



        <div className="flex flex-wrap items-center justify-center gap-3">

          <button

            type="button"

            className={`secondary-btn inline-flex items-center gap-2 text-sm font-semibold disabled:opacity-50 ${

              fallPhysicsEnabled ? "ring-1 ring-mbox-gold/40" : ""

            }`}

            onClick={toggleFallPhysics}

            disabled={!ready}

            aria-pressed={fallPhysicsEnabled ? "true" : "false"}

          >

            낙하 물리 {fallPhysicsEnabled ? "ON" : "OFF"}

          </button>

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


