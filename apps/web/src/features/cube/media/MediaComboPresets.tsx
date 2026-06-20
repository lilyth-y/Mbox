import { useState } from "react";
import { Sparkles } from "lucide-react";
import { MEDIA_COMBO_PRESETS, type MediaComboPreset, type MediaComboPresetPatch } from "@mbox/shared";

interface MediaComboPresetsProps {
  disabled?: boolean;
  compact?: boolean;
  activePresetId?: string | null;
  onApply: (preset: MediaComboPreset, patch: MediaComboPresetPatch) => void;
}

export function MediaComboPresets({
  disabled = false,
  compact = false,
  activePresetId = null,
  onApply,
}: MediaComboPresetsProps) {
  const [followUp, setFollowUp] = useState<string | null>(null);

  return (
    <div className={compact ? "space-y-2" : "space-y-2.5"}>
      <div className="flex items-center gap-2 text-mbox-gold/90">
        <Sparkles size={compact ? 14 : 16} />
        <h3 className={`font-bold text-mbox-text ${compact ? "text-xs" : "text-sm"}`}>추천 조합</h3>
      </div>
      {!compact ? (
        <p className="text-[10px] leading-relaxed text-mbox-subtle">
          배경이 과하지 않도록 검증된 프리셋입니다. 클릭 한 번에 배경·BGM·파티클을 맞춥니다.
        </p>
      ) : null}
      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        {MEDIA_COMBO_PRESETS.map((preset) => {
          const selected = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              title={preset.description}
              onClick={() => {
                onApply(preset, preset.patch);
                setFollowUp(preset.followUpTip ?? null);
              }}
              className={`rounded-xl border px-2.5 py-2.5 text-left transition disabled:opacity-50 ${
                selected
                  ? "border-mbox-gold/50 bg-mbox-gold/15 text-mbox-gold"
                  : "border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.5)] text-mbox-muted hover:border-mbox-gold/30"
              }`}
            >
              <p className="text-[11px] font-bold text-mbox-text">{preset.label}</p>
              <p className="mt-0.5 text-[9px] leading-snug text-mbox-subtle line-clamp-2">{preset.description}</p>
              <p className="mt-1 text-[9px] text-mbox-subtle/80">절제 {preset.restraintScore}/10</p>
            </button>
          );
        })}
      </div>
      {followUp ? (
        <p className="text-[10px] text-mbox-gold/90 leading-relaxed rounded-lg border border-mbox-gold/20 bg-mbox-gold/5 px-2.5 py-2">
          {followUp}
        </p>
      ) : null}
    </div>
  );
}
