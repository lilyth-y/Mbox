import {
  CUBE_FRAME_FINISH_OPTIONS,
  type CubeFrameFinishId,
  type CubeFramePresetId,
} from "@mbox/shared";
import { CUBE_FRAME_PRESETS } from "./cubeFramePresets";
import { frameColorHexFromPreset } from "./frameColorUniforms";
import {
  FRAME_BORDER_WIDTH_OPTIONS,
  type FrameBorderWidthId,
} from "./frameBorderWidth";
import { CollapsibleOptionSelect } from "./CollapsibleOptionSelect";

export interface FrameSettingsValue {
  framePresetId: CubeFramePresetId;
  frameFinishId: CubeFrameFinishId;
  frameBorderWidth: FrameBorderWidthId;
  customFrameColor: string | null;
  gradientColorCycle: boolean;
}

interface FrameSettingsControlsProps {
  value: FrameSettingsValue;
  onChange: (patch: Partial<FrameSettingsValue>) => void;
  disabled?: boolean;
  variant?: "panel" | "wedding";
}

export function FrameSettingsControls({
  value,
  onChange,
  disabled = false,
  variant = "panel",
}: FrameSettingsControlsProps) {
  const weddingActive = "active";
  const weddingInactive = "";

  const finishOptions = CUBE_FRAME_FINISH_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
    description: option.description,
  }));

  const borderOptions = FRAME_BORDER_WIDTH_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
  }));

  const presetOptions = CUBE_FRAME_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    swatchClass: preset.swatchClass,
  }));

  const dropdownProps =
    variant === "wedding"
      ? {
          optionButtonClassName: "option-select-btn",
          activeOptionClassName: weddingActive,
          inactiveOptionClassName: weddingInactive,
        }
      : {};

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <CollapsibleOptionSelect
          label="마감"
          value={value.frameFinishId}
          options={finishOptions}
          onChange={(id) => onChange({ frameFinishId: id })}
          disabled={disabled}
          {...dropdownProps}
        />
        <CollapsibleOptionSelect
          label="굵기"
          value={value.frameBorderWidth}
          options={borderOptions}
          onChange={(id) => onChange({ frameBorderWidth: id })}
          disabled={disabled}
          {...dropdownProps}
        />
        <CollapsibleOptionSelect
          label="프리셋"
          value={value.framePresetId}
          options={presetOptions}
          onChange={(id) => onChange({ framePresetId: id, customFrameColor: null })}
          disabled={disabled}
          {...dropdownProps}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 rounded-lg border border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.5)] px-3 py-2 text-xs text-mbox-muted">
          <span className="font-semibold text-mbox-muted">테두리 색</span>
          <input
            type="color"
            disabled={disabled || value.frameFinishId === "none"}
            value={value.customFrameColor ?? frameColorHexFromPreset(value.framePresetId)}
            onChange={(event) => onChange({ customFrameColor: event.target.value })}
            className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-40"
          />
          {value.customFrameColor ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ customFrameColor: null })}
              className="text-[10px] text-mbox-subtle hover:text-mbox-muted"
            >
              프리셋
            </button>
          ) : null}
        </label>
        <label className="flex items-center gap-2 text-xs text-mbox-muted cursor-pointer">
          <input
            type="checkbox"
            checked={value.gradientColorCycle}
            disabled={disabled || value.frameFinishId === "none"}
            onChange={(event) => onChange({ gradientColorCycle: event.target.checked })}
            className="rounded border-[rgba(223,179,134,0.18)] bg-[rgba(18,14,24,0.75)] text-mbox-gold focus:ring-mbox-gold disabled:opacity-40"
          />
          <span>그라데이션 순환</span>
        </label>
      </div>
    </div>
  );
}
