import type { Scene } from "@babylonjs/core/scene";

export type ShowcaseJewelMeshCounts = {
  colliders: number;
  shells: number;
  jewelMeshes: number;
};

export function countShowcaseJewelMeshes(scene: Scene): ShowcaseJewelMeshCounts {
  let colliders = 0;
  let shells = 0;
  let jewelMeshes = 0;
  for (const mesh of scene.meshes) {
    if (!mesh.name.startsWith("jewel-")) {
      continue;
    }
    jewelMeshes += 1;
    if (mesh.name.startsWith("jewel-collider-")) {
      colliders += 1;
    }
    if (mesh.name.includes("jewel-shell-")) {
      shells += 1;
    }
  }
  return { colliders, shells, jewelMeshes };
}

export type ShowcaseJewelMeshLeakCheck = {
  id: string;
  pass: boolean;
  detail?: string;
};

export type ShowcaseJewelMeshLeakAudit = {
  pass: boolean;
  counts: ShowcaseJewelMeshCounts;
  checks: ShowcaseJewelMeshLeakCheck[];
};

/** E2E: one active jewel rig — no orphaned colliders/shells after shape change. */
export function auditShowcaseJewelMeshLeak(
  scene: Scene | null,
  options?: { maxColliders?: number; maxShells?: number; requireActiveRig?: boolean }
): ShowcaseJewelMeshLeakAudit {
  const maxColliders = options?.maxColliders ?? 1;
  const maxShells = options?.maxShells ?? 2;
  const requireActiveRig = options?.requireActiveRig ?? false;
  const counts = scene
    ? countShowcaseJewelMeshes(scene)
    : { colliders: 0, shells: 0, jewelMeshes: 0 };

  const checks: ShowcaseJewelMeshLeakCheck[] = [
    {
      id: "scene_ready",
      pass: scene !== null,
    },
    {
      id: "rig_active",
      pass: !requireActiveRig || counts.colliders === 1,
      detail: requireActiveRig ? `colliders=${counts.colliders}` : "n/a",
    },
    {
      id: "single_collider",
      pass: counts.colliders <= maxColliders,
      detail: `colliders=${counts.colliders}`,
    },
    {
      id: "shell_budget",
      pass: counts.shells <= maxShells,
      detail: `shells=${counts.shells}`,
    },
  ];

  return {
    pass: checks.every((check) => check.pass),
    counts,
    checks,
  };
}

declare global {
  interface Window {
    __MBOX_SHOWCASE_MESH_AUDIT__?: () => ShowcaseJewelMeshLeakAudit;
  }
}
