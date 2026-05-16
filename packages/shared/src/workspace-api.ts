import type { CategoryAssignmentMap, HoloEvent, WorkspaceMeta } from "./holo-event.js";

/** Opaque processed gallery entries (full shape owned by apps/web). */
export type VaultImageRecord = Record<string, unknown>;

export interface WorkspaceBootstrapResponse extends WorkspaceMeta {
  vault: VaultImageRecord[];
  categoryAssignments: CategoryAssignmentMap;
}

export interface PutVaultRequest {
  images: VaultImageRecord[];
}

export interface PutCategoryAssignmentsRequest {
  assignments: CategoryAssignmentMap;
}

export interface PutWorkspaceMetaRequest {
  events: HoloEvent[];
  activeEventId: string;
}
