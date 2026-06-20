import * as THREE from "three";
import { isDualLayerParallaxMaterial } from "./cubeDualLayerParallaxMaterial";
import { CUBE_FACE_COUNT } from "./cubeSequence";

export type CubeFaceIntegrityIssueCode =
  | "MISSING_RIG"
  | "FG_HIDDEN"
  | "FG_NO_TEXTURE"
  | "BG_HIDDEN"
  | "BG_NO_TEXTURE"
  | "DUAL_LAYER_INCOMPLETE";

export interface CubeFaceIntegrityIssue {
  code: CubeFaceIntegrityIssueCode;
  message: string;
}

export interface CubeFaceIntegrityEntry {
  faceIndex: number;
  mode: "flat" | "volumax_disp" | "volumax_mesh" | "missing";
  imageSlot: number | null;
  fgVisible: boolean;
  bgVisible: boolean;
  fgHasTexture: boolean;
  bgHasTexture: boolean;
  issues: CubeFaceIntegrityIssue[];
  ok: boolean;
}

export interface CubeFaceIntegrityReport {
  ok: boolean;
  faceCount: number;
  expectedFaces: number;
  entries: CubeFaceIntegrityEntry[];
  issueCount: number;
}

export interface CubeFaceRigAuditInput {
  faceIndex: number;
  mode: "flat" | "volumax_disp" | "volumax_mesh";
  fgMesh: THREE.Mesh;
  bgMesh: THREE.Mesh;
  imageSlot: number;
}

function faceMaterial(mesh: THREE.Mesh): THREE.Material {
  const material = mesh.material;
  return Array.isArray(material) ? material[0]! : material;
}

function textureHasPixelData(texture: THREE.Texture | null | undefined): boolean {
  if (!texture) {
    return false;
  }
  if (texture instanceof THREE.DataTexture) {
    const image = texture.image as { width?: number; height?: number } | undefined;
    return (image?.width ?? 0) > 0 && (image?.height ?? 0) > 0;
  }
  const image = texture.image as
    | { width?: number; height?: number; data?: ArrayLike<number> }
    | undefined;
  if (!image) {
    return false;
  }
  if (image.data && image.data.length > 0) {
    return true;
  }
  return (image.width ?? 0) > 0 && (image.height ?? 0) > 0;
}

function textureFromShaderOrBasic(material: THREE.Material): THREE.Texture | null {
  if (material instanceof THREE.MeshBasicMaterial) {
    return material.map;
  }
  if (material instanceof THREE.ShaderMaterial && material.uniforms?.uTexture) {
    return material.uniforms.uTexture.value as THREE.Texture;
  }
  return null;
}

function textureFromMaterial(material: THREE.Material): THREE.Texture | null {
  if (isDualLayerParallaxMaterial(material)) {
    return material.uniforms.uFgTexture.value as THREE.Texture;
  }
  return textureFromShaderOrBasic(material);
}

function backgroundTextureFromMaterial(material: THREE.Material): THREE.Texture | null {
  if (isDualLayerParallaxMaterial(material)) {
    return material.uniforms.uBgTexture.value as THREE.Texture;
  }
  return textureFromShaderOrBasic(material);
}

/** Structural audit: every mounted cube face must show fg (+ bg plate when split/flat backstop). */
export function auditCubeFaceRig(rig: CubeFaceRigAuditInput): CubeFaceIntegrityEntry {
  const issues: CubeFaceIntegrityIssue[] = [];
  const fgMaterial = faceMaterial(rig.fgMesh);
  const bgMaterial = faceMaterial(rig.bgMesh);
  const fgTexture = textureFromMaterial(fgMaterial);
  const bgTexture =
    rig.mode === "volumax_disp"
      ? backgroundTextureFromMaterial(fgMaterial)
      : backgroundTextureFromMaterial(bgMaterial);

  const fgVisible = rig.fgMesh.visible;
  const bgVisible = rig.bgMesh.visible;
  const fgHasTexture = textureHasPixelData(fgTexture);
  const bgHasTexture = textureHasPixelData(bgTexture);

  if (!fgVisible) {
    issues.push({ code: "FG_HIDDEN", message: "Foreground mesh is not visible." });
  }
  if (!fgHasTexture) {
    issues.push({ code: "FG_NO_TEXTURE", message: "Foreground has no loaded texture." });
  }

  if (rig.mode === "volumax_disp") {
    if (!isDualLayerParallaxMaterial(fgMaterial)) {
      issues.push({
        code: "DUAL_LAYER_INCOMPLETE",
        message: "VoluMax disp mode requires dual-layer shader material.",
      });
    } else if (!textureHasPixelData(backgroundTextureFromMaterial(fgMaterial))) {
      issues.push({
        code: "BG_NO_TEXTURE",
        message: "Dual-layer shader is missing background plate texture.",
      });
    }
  } else {
    if (!bgVisible) {
      issues.push({
        code: "BG_HIDDEN",
        message: "Background plate mesh must be visible (no empty face).",
      });
    }
    if (!bgHasTexture) {
      issues.push({
        code: "BG_NO_TEXTURE",
        message: "Background plate has no loaded texture.",
      });
    }
  }

  return {
    faceIndex: rig.faceIndex,
    mode: rig.mode,
    imageSlot: rig.imageSlot,
    fgVisible,
    bgVisible,
    fgHasTexture,
    bgHasTexture,
    issues,
    ok: issues.length === 0,
  };
}

export function auditAllCubeFaceRigs(
  rigs: Array<CubeFaceRigAuditInput | null>,
  expectedFaces: number = CUBE_FACE_COUNT
): CubeFaceIntegrityReport {
  const entries: CubeFaceIntegrityEntry[] = [];
  for (let faceIndex = 0; faceIndex < expectedFaces; faceIndex += 1) {
    const rig = rigs[faceIndex] ?? null;
    if (!rig) {
      entries.push({
        faceIndex,
        mode: "missing",
        imageSlot: null,
        fgVisible: false,
        bgVisible: false,
        fgHasTexture: false,
        bgHasTexture: false,
        issues: [
          {
            code: "MISSING_RIG",
            message: `No face rig mounted for cube face ${faceIndex}.`,
          },
        ],
        ok: false,
      });
      continue;
    }
    entries.push(auditCubeFaceRig(rig));
  }
  const issueCount = entries.reduce((sum, entry) => sum + entry.issues.length, 0);
  return {
    ok: issueCount === 0,
    faceCount: entries.filter((entry) => entry.mode !== "missing").length,
    expectedFaces,
    entries,
    issueCount,
  };
}
