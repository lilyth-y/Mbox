import type { JewelCubePhysicsRig } from "./babylon/jewelCubeFactory";
import {
  isStandardJewelPhotoMaterial,
  type JewelPhotoDisplayMaterial,
} from "./babylon/jewelPhotoMaterialBridge";

export type ShowcasePhotoAttachmentCheck = {
  id: string;
  pass: boolean;
  detail?: string;
};

export type ShowcasePhotoAttachmentAudit = {
  pass: boolean;
  checks: ShowcasePhotoAttachmentCheck[];
};

function materialHasPhotoTexture(material: JewelPhotoDisplayMaterial): boolean {
  if (isStandardJewelPhotoMaterial(material)) {
    return Boolean(material.emissiveTexture);
  }
  const active = material.getActiveTextures?.();
  return (active?.length ?? 0) > 0;
}

/** E2E: uploaded holo texture is bound to the inner photo layer (not disabled). */
export function auditShowcasePhotoAttachment(
  rig: JewelCubePhysicsRig | null
): ShowcasePhotoAttachmentAudit {
  const checks: ShowcasePhotoAttachmentCheck[] = [];

  checks.push({
    id: "rig_spawned",
    pass: rig !== null,
    detail: rig ? rig.shapeId : "null",
  });
  if (!rig) {
    return { pass: false, checks };
  }

  const layerEnabled = rig.bgLayerA.root.isEnabled();
  checks.push({
    id: "inner_layer_enabled",
    pass: layerEnabled,
  });

  const hasTexture = materialHasPhotoTexture(rig.bgMatA);
  checks.push({
    id: "photo_texture_bound",
    pass: hasTexture,
  });

  const faceCount = rig.bgLayerA.faces.length;
  const facesVisible = rig.bgLayerA.faces.some((face) => face.isVisible && face.isEnabled());
  const solidInnerBox = rig.bgLayerA.faces.some((face) => face.name.includes("inner-cube"));
  checks.push({
    id: "inner_faces_visible",
    pass: faceCount > 0 && facesVisible,
    detail: `faces=${faceCount}`,
  });
  checks.push({
    id: "no_solid_inner_box",
    pass: rig.photoLayout !== "cube" || (!solidInnerBox && faceCount === 6),
    detail:
      rig.photoLayout === "cube"
        ? solidInnerBox
          ? "welded-box"
          : `face-planes=${faceCount}`
        : "n/a",
  });

  const heartFrontPlate =
    rig.shapeId === "heart" &&
    rig.bgLayerA.faces.some((face) => face.name.includes("-front"));
  checks.push({
    id: "no_heart_front_plate",
    pass: rig.shapeId !== "heart" || !heartFrontPlate,
    detail: rig.shapeId === "heart" ? (heartFrontPlate ? "dual-front" : "single-table") : "n/a",
  });

  const morphTwinOff = rig.bgLayerB === rig.bgLayerA || !rig.bgLayerB.root.isEnabled();
  checks.push({
    id: "single_inner_layer",
    pass: morphTwinOff,
    detail: rig.bgLayerB === rig.bgLayerA ? "aliased" : "twin-off",
  });

  return {
    pass: checks.every((check) => check.pass),
    checks,
  };
}

declare global {
  interface Window {
    __MBOX_SHOWCASE_UPLOAD_AUDIT__?: () => ShowcasePhotoAttachmentAudit;
  }
}
