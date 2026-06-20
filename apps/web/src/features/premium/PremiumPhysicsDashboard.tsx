import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Upload, RotateCcw, Play, ImageIcon, ArrowLeft } from "lucide-react";
import { bootstrapLocalWorkspace } from "../events/workspaceBackend";
import type { ProcessedImage } from "../../shared/types";
import type { PremiumPhysicsSceneHandle } from "./babylon/createPremiumPhysicsScene";

/** Dev server serves repo `data/background` at `/backgrounds/`. */
export const PREMIUM_DEMO_IMAGE_URL = "./backgrounds/1024_원본/001.jpg";

export function PremiumPhysicsDashboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PremiumPhysicsSceneHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState("Babylon.js 물리 엔진을 준비하는 중…");
  const [ready, setReady] = useState(false);
  const [activeImageUrl, setActiveImageUrl] = useState(PREMIUM_DEMO_IMAGE_URL);
  const [vaultImages, setVaultImages] = useState<ProcessedImage[]>([]);
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null);

  useEffect(() => {
    bootstrapLocalWorkspace()
      .then((workspace) => {
        setVaultImages(workspace.processedImages);
        if (workspace.processedImages[0]) {
          setSelectedVaultId(workspace.processedImages[0].id);
          setActiveImageUrl(workspace.processedImages[0].url);
        }
      })
      .catch(() => {
        /* vault optional on premium page */
      });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    void (async () => {
      try {
        const { createPremiumPhysicsScene } = await import("./babylon/createPremiumPhysicsScene");
        if (cancelled) return;
        const handle = await createPremiumPhysicsScene(canvas);
        if (cancelled) {
          handle.dispose();
          return;
        }
        sceneRef.current = handle;
        setReady(true);
        setStatus("사진 큐브를 떨어뜨려 보세요. 중력·바운스·충돌이 Havok으로 시뮬레이션됩니다.");
        handle.dropCube(activeImageUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setStatus(`물리 씬 초기화 실패: ${message}`);
      }
    })();

    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const dropActive = useCallback(() => {
    if (!sceneRef.current || !activeImageUrl) return;
    sceneRef.current.dropCube(activeImageUrl);
    setStatus("큐브를 추가했습니다. 바닥에 떨어지며 튕깁니다.");
  }, [activeImageUrl]);

  const resetScene = useCallback(() => {
    sceneRef.current?.reset();
    setStatus("씬을 초기화했습니다.");
  }, []);

  const handleFileUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      setStatus("이미지 파일을 선택해 주세요.");
      return;
    }
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") resolve(result);
        else reject(new Error("read failed"));
      };
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
    });
    setActiveImageUrl(url);
    setSelectedVaultId(null);
    setStatus("업로드한 사진을 선택했습니다. 「낙하」로 큐브를 추가하세요.");
  };

  const selectVaultImage = (image: ProcessedImage) => {
    setSelectedVaultId(image.id);
    setActiveImageUrl(image.url);
    setStatus(`보관함 「${image.label}」을(를) 선택했습니다.`);
  };

  return (
    <div className="glass-panel flex flex-col overflow-hidden p-0">
      <header className="border-b border-[rgba(223,179,134,0.12)] px-4 py-3 md:px-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <a href="./index.html" className="inline-flex items-center gap-1.5 text-xs mbox-link">
            <ArrowLeft size={14} />
            mbox
          </a>
          <div>
            <h1 className="text-lg serif-title metallic-text flex items-center gap-2">
              <Sparkles size={18} className="text-mbox-gold" />
              프리미엄 물리 연출
            </h1>
            <p className="text-[11px] text-mbox-subtle">Babylon.js · Havok Physics · 별도 tier</p>
          </div>
        </div>
        <p className="text-xs text-mbox-muted max-w-xl">{status}</p>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-0 min-h-0">
        <div className="relative min-h-[50vh] lg:min-h-0 bg-black">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" id="premium-canvas" />
          {!ready ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-mbox-subtle">
              Havok WASM 로딩 중…
            </div>
          ) : null}
        </div>

        <aside className="border-t lg:border-t-0 lg:border-l border-[rgba(223,179,134,0.12)] p-4 space-y-4 overflow-y-auto">
          <section className="space-y-2">
            <h2 className="text-xs font-bold text-mbox-muted uppercase tracking-wide">사진 소스</h2>
            <button
              type="button"
              id="premium-demo-btn"
              disabled={!ready}
              onClick={() => {
                setActiveImageUrl(PREMIUM_DEMO_IMAGE_URL);
                setSelectedVaultId(null);
                setStatus("데모 사진을 선택했습니다.");
              }}
              className="w-full rounded-xl secondary-btn text-xs font-semibold disabled:opacity-50"
            >
              데모 사진 (001.jpg)
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl secondary-btn text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Upload size={14} />
              파일 업로드
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              aria-label="프리미엄 연출용 사진 업로드"
              className="hidden"
              onChange={(e) => void handleFileUpload(e.target.files)}
            />
          </section>

          {vaultImages.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-xs font-bold text-mbox-muted uppercase tracking-wide flex items-center gap-1.5">
                <ImageIcon size={13} />
                보관함 ({vaultImages.length})
              </h2>
              <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
                {vaultImages.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => selectVaultImage(image)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 ${
                      selectedVaultId === image.id ? "border-amber-400" : "border-transparent"
                    }`}
                  >
                    <img src={image.url} alt={image.label} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-2 pt-2 border-t border-[rgba(223,179,134,0.12)]">
            <button
              type="button"
              id="premium-drop-btn"
              disabled={!ready || !activeImageUrl}
              onClick={dropActive}
              className="w-full gold-btn px-4 py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play size={16} />
              큐브 낙하
            </button>
            <button
              type="button"
              id="premium-reset-btn"
              disabled={!ready}
              onClick={resetScene}
              className="w-full secondary-btn px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RotateCcw size={14} />
              씬 초기화
            </button>
          </section>

          <p className="text-[10px] leading-relaxed text-mbox-subtle/80">
            P0: 사진 텍스처 큐브 + 중력 낙하 + 바닥 바운스. P1에서 다중 큐브 충돌·프리셋·MP4 녹화 예정.
          </p>
        </aside>
      </div>
    </div>
  );
}
