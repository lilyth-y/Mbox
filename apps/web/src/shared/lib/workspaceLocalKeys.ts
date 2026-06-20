const LEGACY_DEFAULT_WORKSPACE = "default";

/** Matches server-side workspace id sanitization (`workspaceStore.ts`). */
export function normalizeWorkspaceId(workspaceId?: string): string {
  const id = (workspaceId ?? LEGACY_DEFAULT_WORKSPACE).trim() || LEGACY_DEFAULT_WORKSPACE;
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function eventsCatalogStorageKey(workspaceId?: string): string {
  return `mbox.workspaces.${normalizeWorkspaceId(workspaceId)}.events.catalog`;
}

export function activeEventStorageKey(workspaceId?: string): string {
  return `mbox.workspaces.${normalizeWorkspaceId(workspaceId)}.events.active`;
}

export function categoryCatalogStorageKey(workspaceId?: string): string {
  return `mbox.workspaces.${normalizeWorkspaceId(workspaceId)}.categoryCatalog`;
}

export function categoryAssignmentsStorageKey(eventId: string, workspaceId?: string): string {
  return `mbox.workspaces.${normalizeWorkspaceId(workspaceId)}.categoryAssignments.${eventId}`;
}

export function vaultMetaStorageKey(eventId: string, workspaceId?: string): string {
  return `${normalizeWorkspaceId(workspaceId)}::${eventId}`;
}

export function vaultBlobKeyPrefix(eventId: string, workspaceId?: string): string {
  return `${normalizeWorkspaceId(workspaceId)}::${eventId}:`;
}

export function workspaceVaultBlobPrefix(workspaceId?: string): string {
  return `${normalizeWorkspaceId(workspaceId)}::`;
}

export const LEGACY_EVENTS_CATALOG_KEY = "mbox.events.catalog";
export const LEGACY_ACTIVE_EVENT_KEY = "mbox.events.active";
export const LEGACY_CATEGORY_CATALOG_KEY = "mbox.categoryCatalog";

export function legacyCategoryAssignmentsKey(eventId: string): string {
  return `mbox.categoryAssignments.${eventId}`;
}

export function legacyVaultLocalStorageKey(eventId: string): string {
  return `mbox.events.vault.${eventId}`;
}

export function legacyVaultBlobKeyPrefix(eventId: string): string {
  return `${eventId}:`;
}

/** Legacy local keys were implicit `default` workspace only. */
export function shouldMigrateLegacyLocalStorage(workspaceId?: string): boolean {
  return normalizeWorkspaceId(workspaceId) === LEGACY_DEFAULT_WORKSPACE;
}

export function migrateLegacyLocalStorageValue(
  scopedKey: string,
  legacyKey: string,
  workspaceId?: string
): string | null {
  try {
    const scoped = localStorage.getItem(scopedKey);
    if (scoped !== null) {
      return scoped;
    }
    if (!shouldMigrateLegacyLocalStorage(workspaceId)) {
      return null;
    }
    const legacy = localStorage.getItem(legacyKey);
    if (legacy === null) {
      return null;
    }
    localStorage.setItem(scopedKey, legacy);
    return legacy;
  } catch {
    return null;
  }
}
