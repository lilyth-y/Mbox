import { useMemo, useState } from "react";
import { Check, Clapperboard, Copy, Link2 } from "lucide-react";
import {
  buildWorkflowCompositeCommand,
  describeWorkflowMediaSummary,
  resolveCompositeCubeScale,
  saveWorkflowCompositeSettings,
  type CompositeBlendMode,
  type WorkflowCompositeSettings,
} from "../../shared/lib/workflowCompositeCommand";
import { migrateLegacyRoseCompositeSettings } from "../../shared/lib/workflowMediaSettings";
import { useWorkflowSnapshots } from "./useWorkflowSnapshots";

migrateLegacyRoseCompositeSettings();

interface WorkflowVideoCompositePanelProps {
  compact?: boolean;
}

export function WorkflowVideoCompositePanel({ compact = false }: WorkflowVideoCompositePanelProps) {
  const { media, composite: initialComposite } = useWorkflowSnapshots();
  const [settings, setSettings] = useState<WorkflowCompositeSettings>(initialComposite);
  const [copied, setCopied] = useState(false);

  const patch = (partial: Partial<WorkflowCompositeSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveWorkflowCompositeSettings(next);
      return next;
    });
  };

  const command = useMemo(
    () => buildWorkflowCompositeCommand(settings, media),
    [settings, media]
  );
  const cubeScale = resolveCompositeCubeScale(settings, media);

  const copyCommand = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section
      className={
        compact
          ? "space-y-2"
          : "mbox-panel space-y-4 border border-[rgba(223,179,134,0.15)] bg-[rgba(12,10,16,0.55)] p-4"
      }
    >
      <div className="flex items-center gap-2 text-amber-300/90">
        <Clapperboard size={compact ? 14 : 16} />
        <h3 className={`font-bold text-mbox-text ${compact ? "text-xs" : "text-sm"}`}>
          동영상 합성 (FFmpeg · 워크플로)
        </h3>
      </div>

      {!compact ? (
        <p className="text-[10px] leading-relaxed text-mbox-subtle">
          큐브 MP4 전경과 배경 영상을 합성합니다. 배경·BGM·큐브 크기는 3D 큐브 탭 설정을 따르며,
          프로세싱·후처리 탭에서도 아래 명령을 복사해 사용할 수 있습니다. 전경 MP4는 큐브 탭에서
         보낸 뒤 경로를 확인하세요.
        </p>
      ) : null}

      <div className="flex items-start gap-2 rounded-lg border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.6)] px-3 py-2">
        <Link2 size={14} className="mt-0.5 shrink-0 text-mbox-gold" />
        <div className="min-w-0 text-[10px] leading-relaxed text-mbox-muted">
          <span className="font-semibold text-mbox-text">워크플로 연동</span>
          <p className="mt-0.5">{describeWorkflowMediaSummary(media)}</p>
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.syncWorkflowMedia}
              onChange={(e) => patch({ syncWorkflowMedia: e.target.checked })}
              className="accent-mbox-gold"
            />
            3D 큐브 탭 배경·BGM·크기를 명령에 자동 반영
          </label>
        </div>
      </div>

      <label className="block text-[10px] text-mbox-muted">
        전경 MP4 (큐브보내기)
        <input
          type="text"
          value={settings.foregroundPath}
          onChange={(e) => patch({ foregroundPath: e.target.value })}
          className="mt-1 w-full rounded-lg border border-[rgba(223,179,134,0.15)] bg-[rgba(8,6,12,0.8)] px-2 py-1.5 text-[11px] text-mbox-text"
          spellCheck={false}
        />
      </label>

      <label className="block text-[10px] text-mbox-muted">
        출력 파일
        <input
          type="text"
          value={settings.outputPath}
          onChange={(e) => patch({ outputPath: e.target.value })}
          className="mt-1 w-full rounded-lg border border-[rgba(223,179,134,0.15)] bg-[rgba(8,6,12,0.8)] px-2 py-1.5 text-[11px] text-mbox-text"
          spellCheck={false}
        />
      </label>

      <label className="block text-[10px] text-mbox-muted">
        FFmpeg 합성 큐브 배율 {cubeScale.toFixed(2)}×
        {settings.syncWorkflowMedia ? (
          <span className="text-mbox-subtle"> (3D 큐브 탭 「큐브 크기」)</span>
        ) : null}
        <input
          type="range"
          min={0.55}
          max={1.85}
          step={0.05}
          disabled={settings.syncWorkflowMedia}
          value={settings.syncWorkflowMedia ? media.cubeSizeScale : settings.cubeScale}
          onChange={(e) => patch({ cubeScale: Number(e.target.value) })}
          className="mt-1 w-full disabled:opacity-40"
        />
      </label>

      <label className="block text-[10px] text-mbox-muted">
        분할 길이 {settings.segmentSeconds === 0 ? "없음 (단일 파일)" : `${settings.segmentSeconds}초`}
        <input
          type="range"
          min={0}
          max={180}
          step={15}
          value={settings.segmentSeconds}
          onChange={(e) => patch({ segmentSeconds: Number(e.target.value) })}
          className="mt-1 w-full"
        />
      </label>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["ColorKey", "ColorKey"],
            ["Screen", "Screen"],
            ["Hybrid", "Hybrid (0–60s+Screen)"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => patch({ blendMode: id as CompositeBlendMode })}
            className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${
              settings.blendMode === id
                ? "border-amber-400/50 bg-amber-500/10 text-amber-100"
                : "border-[rgba(223,179,134,0.12)] text-mbox-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.7)] p-2.5">
        <code className="block text-[10px] text-mbox-muted break-all leading-relaxed">{command}</code>
        <button
          type="button"
          onClick={() => void copyCommand()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[rgba(223,179,134,0.18)] px-2.5 py-1 text-[10px] font-semibold text-mbox-muted hover:border-mbox-gold/30"
        >
          {copied ? <Check size={12} className="text-mbox-gold" /> : <Copy size={12} />}
          {copied ? "복사됨" : "명령 복사"}
        </button>
      </div>
    </section>
  );
}

export { buildWorkflowCompositeCommand as buildCompositeCommand };
