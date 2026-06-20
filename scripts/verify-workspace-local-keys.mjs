#!/usr/bin/env node
/**
 * Workspace-scoped localStorage key helpers (matches server tenancy).
 *   node scripts/verify-workspace-local-keys.mjs
 */
import assert from "node:assert/strict";
import {
  activeEventStorageKey,
  categoryAssignmentsStorageKey,
  categoryCatalogStorageKey,
  eventsCatalogStorageKey,
  legacyCategoryAssignmentsKey,
  LEGACY_ACTIVE_EVENT_KEY,
  LEGACY_CATEGORY_CATALOG_KEY,
  LEGACY_EVENTS_CATALOG_KEY,
  legacyVaultBlobKeyPrefix,
  legacyVaultLocalStorageKey,
  migrateLegacyLocalStorageValue,
  normalizeWorkspaceId,
  shouldMigrateLegacyLocalStorage,
  vaultBlobKeyPrefix,
  vaultMetaStorageKey,
  workspaceVaultBlobPrefix,
} from "../apps/web/src/shared/lib/workspaceLocalKeys.ts";

assert.equal(normalizeWorkspaceId(), "default");
assert.equal(normalizeWorkspaceId("default"), "default");
assert.equal(normalizeWorkspaceId(" hall/a "), "hall_a");
assert.equal(normalizeWorkspaceId("team-2"), "team-2");

assert.equal(
  eventsCatalogStorageKey("hall-a"),
  "mbox.workspaces.hall-a.events.catalog"
);
assert.equal(activeEventStorageKey("hall-a"), "mbox.workspaces.hall-a.events.active");
assert.equal(
  categoryAssignmentsStorageKey("event-1", "hall-a"),
  "mbox.workspaces.hall-a.categoryAssignments.event-1"
);
assert.equal(categoryCatalogStorageKey("hall-a"), "mbox.workspaces.hall-a.categoryCatalog");

assert.equal(vaultMetaStorageKey("event-1", "hall-a"), "hall-a::event-1");
assert.equal(vaultBlobKeyPrefix("event-1", "hall-a"), "hall-a::event-1:");
assert.equal(workspaceVaultBlobPrefix("hall-a"), "hall-a::");

assert.equal(legacyCategoryAssignmentsKey("event-1"), "mbox.categoryAssignments.event-1");
assert.equal(legacyVaultLocalStorageKey("event-1"), "mbox.events.vault.event-1");
assert.equal(legacyVaultBlobKeyPrefix("event-1"), "event-1:");

assert.equal(shouldMigrateLegacyLocalStorage("default"), true);
assert.equal(shouldMigrateLegacyLocalStorage("hall-a"), false);

const store = new Map();
globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, value);
  },
  removeItem(key) {
    store.delete(key);
  },
};

store.clear();
store.set(LEGACY_EVENTS_CATALOG_KEY, JSON.stringify([{ id: "e1", name: "Legacy" }]));
const migratedCatalog = migrateLegacyLocalStorageValue(
  eventsCatalogStorageKey("default"),
  LEGACY_EVENTS_CATALOG_KEY
);
assert.ok(migratedCatalog?.includes("e1"));
assert.ok(store.has(eventsCatalogStorageKey("default")));

store.clear();
store.set(LEGACY_ACTIVE_EVENT_KEY, "event-legacy");
const migratedActive = migrateLegacyLocalStorageValue(
  activeEventStorageKey("default"),
  LEGACY_ACTIVE_EVENT_KEY
);
assert.equal(migratedActive, "event-legacy");

store.clear();
store.set(LEGACY_CATEGORY_CATALOG_KEY, JSON.stringify(["신랑", "신부"]));
const migratedCategories = migrateLegacyLocalStorageValue(
  categoryCatalogStorageKey("default"),
  LEGACY_CATEGORY_CATALOG_KEY
);
assert.ok(migratedCategories?.includes("신랑"));

store.clear();
const legacyAssignKey = legacyCategoryAssignmentsKey("event-1");
store.set(legacyAssignKey, JSON.stringify({ "1": { userCategory: "신랑" } }));
const scopedAssignKey = categoryAssignmentsStorageKey("event-1", "default");
const migratedAssign = migrateLegacyLocalStorageValue(scopedAssignKey, legacyAssignKey, "default");
assert.ok(migratedAssign?.includes("신랑"));

store.clear();
store.set(LEGACY_EVENTS_CATALOG_KEY, "[]");
assert.equal(
  migrateLegacyLocalStorageValue(
    eventsCatalogStorageKey("team-b"),
    LEGACY_EVENTS_CATALOG_KEY,
    "team-b"
  ),
  null
);

console.log("OK workspace local keys (tenancy + default legacy migration)");
