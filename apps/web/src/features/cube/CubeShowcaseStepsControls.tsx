import type { ReactNode } from "react";
import {
  CUBE_ZOOM_INTENSITY_MAX,
  CUBE_ZOOM_INTENSITY_MIN,
} from "@mbox/shared";
import type { CubeRotationMode } from "./cubeTransitionRotation";
import type { CubeFocusSettings } from "./CubeFocusPanel";
import { patchVoluMaxDepthEnabled } from "./voluMaxDepthSettings";

export type CubeShowcaseStepSettings = Pick<
  CubeFocusSettings,
  | "cubeRotationMode"
  | "fanSpeed"
  | "cubeAngularInertiaEnabled"
  | "cubeShowcaseZoomEnabled"
  | "cubeZoomIntensity"
  | "cubeComplexRotationEnabled"
  | "cubeComplexRotationIntensity"
  | "cubeScaleCoupledSpinEnabled"
  | "cubeAcceleratedSpinIntensity"
  | "cubeSubjectPullEnabled"
  | "cubeSubjectPullIntensity"
  | "cubeHeartbeatEnabled"
  | "cubeHeartbeatIntensity"
  | "voluMaxDepthEnabled"
>;

const CUBE_ROTATION_OPTIONS: { id: CubeRotationMode; label: string }[] = [
  { id: "auto", label: "자동 (일관 축 + 속도 변화)" },
  { id: "mixed", label: "혼합 (예술적 경로 + 속도)" },
  { id: "yaw_cw", label: "좌→우 회전 (고정)" },
  { id: "yaw_ccw", label: "우→좌 회전 (고정)" },
  { id: "pitch_up", label: "위로 기울기" },
  { id: "pitch_down", label: "아래로 기울기" },
  { id: "roll", label: "롤 회전" },
  { id: "corner_swing", label: "코너 스윙" },
];

function IntensitySlider(props: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const min = props.min ?? 0;
  const max = props.max ?? 1;
  const step = props.step ?? 0.05;
  return (
    <div className="mt-2 space-y-1 pl-6">
      <div className="flex items-center justify-between text-[10px] text-mbox-subtle">
        <span>{props.label}</span>
        <span className="font-mono text-mbox-gold">{props.value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="w-full accent-mbox-gold"
      />
    </div>
  );
}

function StepCard(props: {
  step: number | string;
  title: string;
  description: string;
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  toggleDisabled?: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const showToggle = props.onToggle != null;
  return (
    <div
      className={`rounded-xl border px-3 py-3 ${
        props.disabled ? "opacity-50" : ""
      } border-[rgba(223,179,134,0.14)] bg-[rgba(18,14,24,0.45)]`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mbox-gold/15 text-[11px] font-bold text-mbox-gold">
          {props.step}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-mbox-text">{props.title}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-mbox-subtle">
                {props.description}
              </p>
            </div>
            {showToggle ? (
              <label className="relative inline-flex shrink-0 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={props.enabled ?? false}
                  disabled={props.toggleDisabled || props.disabled}
                  onChange={(event) => props.onToggle?.(event.target.checked)}
                />
                <div className="h-6 w-11 rounded-full bg-[rgba(18,14,24,0.85)] after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-mbox-muted after:transition-all peer-checked:bg-mbox-gold peer-checked:after:translate-x-full peer-checked:after:border-white peer-disabled:cursor-not-allowed after:bg-white" />
              </label>
            ) : null}
          </div>
          {props.children}
        </div>
      </div>
    </div>
  );
}

export interface CubeShowcaseStepsControlsProps {
  settings: CubeShowcaseStepSettings;
  onPatch: (partial: Partial<CubeShowcaseStepSettings>) => void;
  disabled?: boolean;
  rotationControlsEnabled?: boolean;
}

export function CubeShowcaseStepsControls({
  settings,
  onPatch,
  disabled = false,
  rotationControlsEnabled = true,
}: CubeShowcaseStepsControlsProps) {
  const rotationDisabled = disabled || !rotationControlsEnabled;

  return (
    <div className="space-y-3">
      <StepCard
        step={1}
        title="단일 큐브 회전"
        description="기본 제자리 회전 — 난방향으로 돌다가 면이 정면을 향합니다. 방향·속도를 조절하세요."
        disabled={rotationDisabled}
      >
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CUBE_ROTATION_OPTIONS.map((option) => {
            const selected = settings.cubeRotationMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={rotationDisabled}
                onClick={() => onPatch({ cubeRotationMode: option.id })}
                className={`rounded-lg border px-2 py-2 text-center text-[11px] font-semibold transition ${
                  selected
                    ? "border-mbox-gold/50 bg-mbox-gold/15 text-mbox-gold"
                    : "border-[rgba(223,179,134,0.12)] bg-[rgba(18,14,24,0.45)] text-mbox-muted hover:border-mbox-gold/30"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <IntensitySlider
          label="회전 속도"
          value={settings.fanSpeed}
          min={0.35}
          max={2.5}
          step={0.05}
          disabled={rotationDisabled}
          onChange={(fanSpeed) => onPatch({ fanSpeed })}
        />
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-[rgba(223,179,134,0.1)] bg-[rgba(18,14,24,0.35)] px-2.5 py-2">
          <input
            type="checkbox"
            className="mt-0.5 accent-mbox-gold"
            checked={settings.cubeAngularInertiaEnabled}
            disabled={rotationDisabled}
            onChange={(event) => onPatch({ cubeAngularInertiaEnabled: event.target.checked })}
          />
          <span className="text-[10px] leading-relaxed text-mbox-subtle">
            <span className="font-semibold text-mbox-text">관성 (각속도 적분)</span> — 퇴장·스핀
            끝에서 관성으로 이어집니다. 쇼케이스 홀드에서는 정면을 유지합니다.
          </span>
        </label>
      </StepCard>

      <StepCard
        step={2}
        title="줌인 회전"
        description="작아졌다 커지며 당겨오는 달리 줌. 끄면 1단계 제자리 회전만 적용됩니다."
        enabled={settings.cubeShowcaseZoomEnabled}
        onToggle={(cubeShowcaseZoomEnabled) => {
          onPatch({
            cubeShowcaseZoomEnabled,
            ...(cubeShowcaseZoomEnabled ? {} : { cubeScaleCoupledSpinEnabled: false }),
          });
        }}
        toggleDisabled={rotationDisabled}
        disabled={rotationDisabled}
      >
        <IntensitySlider
          label="줌 강도"
          value={settings.cubeZoomIntensity}
          min={CUBE_ZOOM_INTENSITY_MIN}
          max={CUBE_ZOOM_INTENSITY_MAX}
          step={0.05}
          disabled={rotationDisabled || !settings.cubeShowcaseZoomEnabled}
          onChange={(cubeZoomIntensity) => onPatch({ cubeZoomIntensity })}
        />
      </StepCard>

      <StepCard
        step={3}
        title="복합 회전"
        description="피치·롤·요가 겹치는 3축 텀블. 줌과 독립적으로 켤 수 있습니다."
        enabled={settings.cubeComplexRotationEnabled}
        onToggle={(cubeComplexRotationEnabled) => onPatch({ cubeComplexRotationEnabled })}
        toggleDisabled={rotationDisabled}
        disabled={rotationDisabled}
      >
        <IntensitySlider
          label="복합 회전 강도"
          value={settings.cubeComplexRotationIntensity}
          disabled={rotationDisabled || !settings.cubeComplexRotationEnabled}
          onChange={(cubeComplexRotationIntensity) => onPatch({ cubeComplexRotationIntensity })}
        />
      </StepCard>

      <StepCard
        step={4}
        title="가속 회전"
        description="작을 때 빠르게, 최대 크기에서 느리게 — 줌 스케일에 맞춰 요·텀블이 가속합니다."
        enabled={settings.cubeScaleCoupledSpinEnabled}
        onToggle={(cubeScaleCoupledSpinEnabled) => onPatch({ cubeScaleCoupledSpinEnabled })}
        toggleDisabled={rotationDisabled || !settings.cubeShowcaseZoomEnabled}
        disabled={rotationDisabled || !settings.cubeShowcaseZoomEnabled}
      >
        <IntensitySlider
          label="가속 강도"
          value={settings.cubeAcceleratedSpinIntensity}
          disabled={
            rotationDisabled ||
            !settings.cubeShowcaseZoomEnabled ||
            !settings.cubeScaleCoupledSpinEnabled
          }
          onChange={(cubeAcceleratedSpinIntensity) => onPatch({ cubeAcceleratedSpinIntensity })}
        />
      </StepCard>

      <StepCard
        step={5}
        title="VoluMax 입체감"
        description="인물·배경 분리와 showcase 시차. 끄면 일반 합성 사진으로 표시됩니다."
        enabled={settings.voluMaxDepthEnabled}
        onToggle={(voluMaxDepthEnabled) => onPatch(patchVoluMaxDepthEnabled(voluMaxDepthEnabled))}
        toggleDisabled={disabled}
        disabled={disabled}
      />

      <StepCard
        step={6}
        title="인물 당겨오기"
        description="VoluMax 인물만 앞으로 당깁니다. 배경 플레이트는 고정됩니다."
        enabled={settings.cubeSubjectPullEnabled}
        onToggle={(cubeSubjectPullEnabled) => onPatch({ cubeSubjectPullEnabled })}
        toggleDisabled={rotationDisabled || !settings.voluMaxDepthEnabled}
        disabled={rotationDisabled || !settings.voluMaxDepthEnabled}
      >
        <IntensitySlider
          label="당김 강도"
          value={settings.cubeSubjectPullIntensity}
          disabled={rotationDisabled || !settings.cubeSubjectPullEnabled}
          onChange={(cubeSubjectPullIntensity) => onPatch({ cubeSubjectPullIntensity })}
        />
      </StepCard>

      <StepCard
        step={7}
        title="심장 박동"
        description="쇼케이스 홀드 구간 lub-dub 맥박 — 크기·카메라·포커스에 미세 펄스."
        enabled={settings.cubeHeartbeatEnabled}
        onToggle={(cubeHeartbeatEnabled) => onPatch({ cubeHeartbeatEnabled })}
        toggleDisabled={rotationDisabled}
        disabled={rotationDisabled}
      >
        <IntensitySlider
          label="맥박 강도"
          value={settings.cubeHeartbeatIntensity}
          disabled={rotationDisabled || !settings.cubeHeartbeatEnabled}
          onChange={(cubeHeartbeatIntensity) => onPatch({ cubeHeartbeatIntensity })}
        />
      </StepCard>
    </div>
  );
}
