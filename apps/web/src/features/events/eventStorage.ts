import type { HoloEvent } from "../../shared/types";
import { WORKSPACE_ID } from "../../shared/config/runtime";
import {
  activeEventStorageKey,
  eventsCatalogStorageKey,
  LEGACY_ACTIVE_EVENT_KEY,
  LEGACY_EVENTS_CATALOG_KEY,
  migrateLegacyLocalStorageValue,
} from "../../shared/lib/workspaceLocalKeys";

function createEventId(): string {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadEventCatalog(): HoloEvent[] {
  try {
    const raw = migrateLegacyLocalStorageValue(
      eventsCatalogStorageKey(WORKSPACE_ID),
      LEGACY_EVENTS_CATALOG_KEY,
      WORKSPACE_ID
    );
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is HoloEvent =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as HoloEvent).id === "string" &&
        typeof (entry as HoloEvent).name === "string"
    );
  } catch {
    return [];
  }
}

export function saveEventCatalog(events: HoloEvent[]): void {
  try {
    localStorage.setItem(eventsCatalogStorageKey(WORKSPACE_ID), JSON.stringify(events));
  } catch {
    // Ignore quota failures for catalog metadata.
  }
}

export function loadActiveEventId(): string | null {
  try {
    return migrateLegacyLocalStorageValue(
      activeEventStorageKey(WORKSPACE_ID),
      LEGACY_ACTIVE_EVENT_KEY,
      WORKSPACE_ID
    );
  } catch {
    return null;
  }
}

export function saveActiveEventId(eventId: string): void {
  try {
    localStorage.setItem(activeEventStorageKey(WORKSPACE_ID), eventId);
  } catch {
    // Ignore storage failures.
  }
}

export {
  deleteEventVault,
  loadEventVault,
  loadEventVaultReport,
  revokeEventObjectUrls,
  saveEventVault,
} from "./indexedDbVault";

export function createEventRecord(name: string, description?: string): HoloEvent {
  const now = Date.now();
  return {
    id: createEventId(),
    name: name.trim(),
    description: description?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function touchEvent(events: HoloEvent[], eventId: string): HoloEvent[] {
  return events.map((event) =>
    event.id === eventId ? { ...event, updatedAt: Date.now() } : event
  );
}

export function bootstrapEventWorkspace(): { events: HoloEvent[]; activeEventId: string } {
  let events = loadEventCatalog();
  if (events.length === 0) {
    const defaultEvent = createEventRecord("기본 이벤트", "첫 번째 이미지 보관함");
    events = [defaultEvent];
    saveEventCatalog(events);
    saveActiveEventId(defaultEvent.id);
    return { events, activeEventId: defaultEvent.id };
  }

  const storedActiveId = loadActiveEventId();
  const activeEventId =
    storedActiveId && events.some((event) => event.id === storedActiveId)
      ? storedActiveId
      : events[0].id;

  saveActiveEventId(activeEventId);
  return { events, activeEventId };
}
