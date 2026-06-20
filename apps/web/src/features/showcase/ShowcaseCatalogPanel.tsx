import { useRef, type ChangeEvent, type ReactNode } from "react";

import { PHOTO_CRYSTAL_SHAPES } from "./babylon/photoCrystalShapeCatalog";

import {

  SHOWCASE_BACKGROUND_OPTIONS,

  SHOWCASE_PHOTO_LAYOUT_OPTIONS,

  type ShowcaseCatalogOptions,

} from "./showcaseCatalogOptions";

import {
  applyShowcaseCommercialLook,
  detectShowcaseCommercialLookId,
  SHOWCASE_COMMERCIAL_LOOK_PRESETS,
} from "./showcaseCommercialPresets";

import { SHOWCASE_PHOTO_FRAME_OPTIONS, getShowcasePhotoFrameHex } from "./babylon/showcasePhotoFrameColor";

import {

  persistShowcaseCustomBackdrop,

  SHOWCASE_FEATURED_BACKDROPS,

} from "./showcaseBackgroundMedia";



type ShowcaseCatalogPanelProps = {

  value: ShowcaseCatalogOptions;

  onChange: (next: ShowcaseCatalogOptions) => void;

  disabled?: boolean;

};



function OptionGroup({

  legend,

  children,

}: {

  legend: string;

  children: ReactNode;

}) {

  return (

    <fieldset className="showcase-catalog-group">

      <legend className="showcase-catalog-legend">{legend}</legend>

      <div className="showcase-catalog-options">{children}</div>

    </fieldset>

  );

}



function CatalogOption({

  selected,

  disabled,

  label,

  onClick,

}: {

  selected: boolean;

  disabled?: boolean;

  label: string;

  onClick: () => void;

}) {

  return (

    <button

      type="button"

      className={`showcase-catalog-option${selected ? " is-selected" : ""}`}

      onClick={onClick}

      disabled={disabled}

      aria-pressed={selected}

    >

      {label}

    </button>

  );

}



export function ShowcaseCatalogPanel({ value, onChange, disabled }: ShowcaseCatalogPanelProps) {

  const uploadRef = useRef<HTMLInputElement>(null);

  const mediaActive = value.backgroundMediaSource !== "none";

  const activeLookId = detectShowcaseCommercialLookId(value);



  const selectPresetBackground = (preset: ShowcaseCatalogOptions["backgroundPreset"]) => {

    onChange({

      ...value,

      backgroundPreset: preset,

      backgroundMediaSource: "none",

      backgroundMediaPath: null,

    });

  };



  const selectBuiltinMedia = (path: string) => {

    onChange({

      ...value,

      backgroundMediaSource: "builtin",

      backgroundMediaPath: path,

    });

  };



  const handleMediaUpload = async (event: ChangeEvent<HTMLInputElement>) => {

    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {

      return;

    }

    const isMedia =

      file.type.startsWith("image/") ||

      file.type.startsWith("video/") ||

      /\.(mp4|webm|mov|m4v|jpe?g|png|webp)$/i.test(file.name);

    if (!isMedia) {

      return;

    }

    const dataUrl = await new Promise<string>((resolve, reject) => {

      const reader = new FileReader();

      reader.onload = () => resolve(String(reader.result));

      reader.onerror = () => reject(reader.error ?? new Error("read failed"));

      reader.readAsDataURL(file);

    });

    persistShowcaseCustomBackdrop(dataUrl);

    onChange({

      ...value,

      backgroundMediaSource: "custom",

      backgroundMediaPath: dataUrl,

    });

  };



  return (

    <section className="mbox-card showcase-catalog-panel" aria-label="크리스탈 카탈로그 선택">

      <h3 className="showcase-catalog-title">크리스탈 카탈로그</h3>

      <p className="showcase-catalog-hint text-mbox-muted text-xs">

        형태·배경·바닥을 바꾸면 미리보기가 새로 로드됩니다. 외부 크리스탈 셸이 배경 빛을

        반사·조화합니다(내부 사진 레이어는 별도).

      </p>

      {activeLookId ? (
        <p className="showcase-catalog-hint text-mbox-muted text-xs">
          판매 룩 적용 중 — 슬라이더 없이 바로 시연·export 가능합니다.
        </p>
      ) : (
        <p className="showcase-catalog-hint text-mbox-muted text-xs">
          세부 슬라이더를 조정하면 판매 룩이 해제됩니다. 부스 시연은 아래 룩 프리셋을 권장합니다.
        </p>
      )}



      <div className="showcase-catalog-grid">

        <OptionGroup legend="판매 룩 (베타)">
          {SHOWCASE_COMMERCIAL_LOOK_PRESETS.map((look) => (
            <CatalogOption
              key={look.id}
              label={look.labelKo}
              selected={activeLookId === look.id}
              disabled={disabled}
              onClick={() => onChange(applyShowcaseCommercialLook(look.id))}
            />
          ))}
        </OptionGroup>



        <OptionGroup legend="형태">

          {PHOTO_CRYSTAL_SHAPES.map((shape) => (

            <CatalogOption

              key={shape.id}

              label={shape.labelKo}

              selected={value.shapeId === shape.id}

              disabled={disabled}

              onClick={() => onChange({ ...value, shapeId: shape.id })}

            />

          ))}

        </OptionGroup>



        <OptionGroup legend="사진 배치">

          {SHOWCASE_PHOTO_LAYOUT_OPTIONS.map((layout) => (

            <CatalogOption

              key={layout.id}

              label={layout.labelKo}

              selected={value.photoLayout === layout.id}

              disabled={disabled}

              onClick={() => onChange({ ...value, photoLayout: layout.id })}

            />

          ))}

        </OptionGroup>



        <OptionGroup legend="사진 프레임">

          {SHOWCASE_PHOTO_FRAME_OPTIONS.map((frame) => (

            <CatalogOption

              key={frame.id}

              label={frame.labelKo}

              selected={value.framePresetId === frame.id}

              disabled={disabled}

              onClick={() =>
                onChange({
                  ...value,
                  framePresetId: frame.id,
                  photoFrameColorHex:
                    frame.id === "none" ? value.photoFrameColorHex : getShowcasePhotoFrameHex(frame.id),
                })
              }

            />

          ))}

        </OptionGroup>



        <div className="showcase-catalog-color-row">

          <label className="showcase-catalog-color-field">

            <span>사진 프레임 색</span>

            <input

              type="color"

              value={value.photoFrameColorHex}

              disabled={disabled || value.framePresetId === "none"}

              onChange={(event) =>

                onChange({ ...value, photoFrameColorHex: event.target.value })

              }

            />

          </label>

          <label className="showcase-catalog-color-field">

            <span>크리스탈 표면 색</span>

            <input

              type="color"

              value={value.crystalShellColorHex}

              disabled={disabled}

              onChange={(event) =>

                onChange({ ...value, crystalShellColorHex: event.target.value })

              }

            />

          </label>

        </div>



        <OptionGroup legend="크리스탈 · 사진">
        <label className="showcase-catalog-slider">
          <span>
            크리스탈 유리 투명도 {((1 - value.crystalShellTransparency) * 100).toFixed(0)}%
          </span>
          <span className="text-mbox-muted text-xs">
            0% = 얇은 유리 · 100% = 두꺼운 보석 유리 (멋진 페이퍼웨이트)
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={1 - value.crystalShellTransparency}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                crystalShellTransparency: 1 - Number(event.target.value),
              })
            }
          />
        </label>

        <label className="showcase-catalog-slider">
          <span>내부 사진 선명도 {(value.crystalPhotoClarity * 100).toFixed(0)}%</span>
          <span className="text-mbox-muted text-xs">
            100% = 부스용 최대 가독성 · 유리 두께와 별도 조절
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={value.crystalPhotoClarity}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, crystalPhotoClarity: Number(event.target.value) })
            }
          />
        </label>

        <label className="showcase-catalog-slider">
          <span>크리스탈 광택 {(value.crystalGloss * 100).toFixed(0)}%</span>
          <span className="text-mbox-muted text-xs">
            표면 하이라이트·반짝임 (무광 0% · 강광택 100%)
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={value.crystalGloss}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, crystalGloss: Number(event.target.value) })
            }
          />
        </label>

        <label className="showcase-catalog-slider">
          <span>배경 빛 → 크리스탈 {(value.crystalBackdropBlend * 100).toFixed(0)}%</span>
          <span className="text-mbox-muted text-xs">
            배경 영상·색의 빛이 크리스탈 표면 env에 반사되는 강도
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={value.crystalBackdropBlend}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, crystalBackdropBlend: Number(event.target.value) })
            }
          />
        </label>

        <label className="showcase-catalog-slider">
          <span>배경 조명 반사 {(value.backgroundLightInfluence * 100).toFixed(0)}%</span>
          <span className="text-mbox-muted text-xs">
            배경 밝기·색조가 크리스탈 조명·틴트에 스며드는 정도
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={value.backgroundLightInfluence}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, backgroundLightInfluence: Number(event.target.value) })
            }
          />
        </label>
        </OptionGroup>

        <label className="showcase-catalog-slider">
          <span>크리스탈 크기 {(value.crystalSizeScale * 100).toFixed(0)}%</span>
          <span className="text-mbox-muted text-xs">
            전체 크리스탈의 표시 크기 (55% ~ 145%)
          </span>
          <input
            type="range"
            min={0.55}
            max={1.45}
            step={0.01}
            value={value.crystalSizeScale}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, crystalSizeScale: Number(event.target.value) })
            }
          />
        </label>

        <OptionGroup legend="배경 프리셋">

          {SHOWCASE_BACKGROUND_OPTIONS.map((bg) => (

            <CatalogOption

              key={bg.id}

              label={bg.labelKo}

              selected={!mediaActive && value.backgroundPreset === bg.id}

              disabled={disabled}

              onClick={() => selectPresetBackground(bg.id)}

            />

          ))}

        </OptionGroup>



        <OptionGroup legend="배경 미디어">

          <CatalogOption

            label="내 사진·동영상"

            selected={value.backgroundMediaSource === "custom"}

            disabled={disabled}

            onClick={() => uploadRef.current?.click()}

          />

          {SHOWCASE_FEATURED_BACKDROPS.map((item) => (

            <CatalogOption

              key={item.path}

              label={item.labelKo}

              selected={

                value.backgroundMediaSource === "builtin" &&

                value.backgroundMediaPath === item.path

              }

              disabled={disabled}

              onClick={() => selectBuiltinMedia(item.path)}

            />

          ))}

          <input

            ref={uploadRef}

            type="file"

            accept="image/*,video/mp4,video/webm,video/quicktime"

            className="sr-only"

            onChange={(e) => void handleMediaUpload(e)}

          />

        </OptionGroup>



        {mediaActive ? (

          <div className="showcase-catalog-sliders">

            <label className="showcase-catalog-slider">

              <span>배경 밝기 {(value.backgroundMediaOpacity * 100).toFixed(0)}%</span>

              <input

                type="range"

                min={0.25}

                max={1}

                step={0.05}

                value={value.backgroundMediaOpacity}

                disabled={disabled}

                onChange={(e) =>

                  onChange({ ...value, backgroundMediaOpacity: Number(e.target.value) })

                }

              />

            </label>

          </div>

        ) : null}



        <OptionGroup legend="바닥">

          <CatalogOption

            label="바닥 ON"

            selected={value.groundEnabled}

            disabled={disabled}

            onClick={() => onChange({ ...value, groundEnabled: true })}

          />

          <CatalogOption

            label="바닥 OFF"

            selected={!value.groundEnabled}

            disabled={disabled}

            onClick={() => onChange({ ...value, groundEnabled: false })}

          />

        </OptionGroup>

      </div>

    </section>

  );

}


