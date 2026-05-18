import { Camera, CheckCircle, Eraser, Image as ImageIcon, Loader2, Play, Trash2, Upload } from "lucide-react";
import type { ImagePreprocessMode, ProcessingProgress } from "../../shared/types";
import { ProcessingProgressDisplay } from "../processing/ProcessingProgressDisplay";

interface UploadPanelProps {
  sourceImages: string[];
  focusTarget: string;
  preprocessMode: ImagePreprocessMode;
  isProcessing: boolean;
  status: string;
  processingProgress: ProcessingProgress | null;
  onFileUpload: (files: File[]) => void;
  onFocusTargetChange: (value: string) => void;
  onPreprocessModeChange: (mode: ImagePreprocessMode) => void;
  onProcess: () => void;
  onProcessAssetBatch: () => void;
  onClear: () => void;
  showDevAssetBatch?: boolean;
}

const PREPROCESS_OPTIONS: Array<{
  mode: ImagePreprocessMode;
  title: string;
  description: string;
  icon: typeof ImageIcon;
}> = [
  {
    mode: "original",
    title: "1. 사진 원본",
    description: "분석·크롭만 합니다. 3D 분리 연출은 이후「배경 제거」단계에서 누끼를 딴 뒤 사용합니다.",
    icon: ImageIcon,
  },
  {
    mode: "background_removed",
    title: "2. 누끼 우선",
    description: "분석·크롭 후 배경 제거(일괄)를 먼저 진행할 계획임을 표시합니다.",
    icon: Eraser,
  },
];

export function UploadPanel({
  sourceImages,
  focusTarget,
  preprocessMode,
  isProcessing,
  status,
  processingProgress,
  onFileUpload,
  onFocusTargetChange,
  onPreprocessModeChange,
  onProcess,
  onProcessAssetBatch,
  onClear,
  showDevAssetBatch = false,
}: UploadPanelProps) {
  const previewImage = sourceImages[0] ?? null;
  const extraImageCount = Math.max(0, sourceImages.length - 1);

  const handleSelectedFiles = (files: FileList | File[] | null | undefined) => {
    const selected = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (selected.length > 0) {
      onFileUpload(selected);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center gap-2 mb-4 text-blue-400">
        <Camera size={20} />
        <h2 className="font-bold">이미지 입력</h2>
      </div>

      <label
        className="relative block group cursor-pointer touch-none overscroll-none"
        onDragEnter={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleSelectedFiles(event.dataTransfer.files);
        }}
      >
        <div
          className={`aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all ${
            previewImage
              ? "border-blue-500/50 bg-blue-500/5"
              : "border-slate-700 hover:border-slate-600 bg-slate-800/50"
          }`}
        >
          {previewImage ? (
            <>
              <img src={previewImage} className="w-full h-full object-contain p-2" alt="Source" />
              {extraImageCount > 0 ? (
                <span className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
                  +{extraImageCount}장
                </span>
              ) : null}
            </>
          ) : (
            <>
              <Upload className="text-slate-500 mb-2" size={32} />
              <span className="text-slate-400 text-sm">여러 장을 드래그하거나 클릭하여 업로드</span>
            </>
          )}
        </div>
        <input
          type="file"
          className="hidden"
          accept="image/*"
          multiple
          onChange={(event) => {
            handleSelectedFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PREPROCESS_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = preprocessMode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              disabled={isProcessing}
              onClick={() => onPreprocessModeChange(option.mode)}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                selected
                  ? "border-blue-500/60 bg-blue-500/10"
                  : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Icon size={16} />
                {option.title}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{option.description}</p>
            </button>
          );
        })}
      </div>

      <label className="mt-4 block">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          포커스 대상
        </span>
        <input
          type="text"
          value={focusTarget}
          onChange={(event) => onFocusTargetChange(event.target.value)}
          placeholder="예: 인물, 강아지, 자동차"
          className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-blue-500/60"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          비워 두면 가장 눈에 띄는 피사체를 자동으로 선택합니다.
        </p>
      </label>

      <div className="mt-6 flex gap-3">
        <button
          disabled={sourceImages.length === 0 || isProcessing}
          onClick={onProcess}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
        >
          {isProcessing ? <Loader2 className="animate-spin" /> : <Play size={18} />}

          분석·크롭 시작

        </button>

        <button

          onClick={onClear}

          className="p-3 bg-slate-800 hover:bg-red-900/30 hover:text-red-400 rounded-xl transition-all"

        >

          <Trash2 size={18} />

        </button>

      </div>



      {showDevAssetBatch ? (
        <button
          disabled={isProcessing}
          onClick={onProcessAssetBatch}
          className="mt-3 w-full rounded-xl border border-indigo-500/40 bg-indigo-500/10 py-3 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          data/asset 배치 처리 (1GB 한도)
        </button>
      ) : null}



      <div className="mt-4 p-3 bg-black/40 rounded-lg border border-slate-800 flex items-start gap-3">

        <div

          className={`p-1 rounded-full mt-0.5 ${

            isProcessing ? "bg-blue-500/20 text-blue-500" : "bg-green-500/20 text-green-500"

          }`}

        >

          <CheckCircle size={14} />

        </div>

        <p className="text-xs text-slate-400 leading-relaxed italic">{status}</p>

      </div>

      <ProcessingProgressDisplay
        progress={processingProgress}
        isProcessing={isProcessing}
      />

    </div>

  );

}

