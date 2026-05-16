import type { HoloEvent, ProcessedImage } from "../../shared/types";

const EVENTS_CATALOG_KEY = "mbox.events.catalog";
const ACTIVE_EVENT_KEY = "mbox.events.active";
const vaultKey = (eventId: string) => `mbox.events.vault.${eventId}`;

function createEventId(): string {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadEventCatalog(): HoloEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_CATALOG_KEY);
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
    localStorage.setItem(EVENTS_CATALOG_KEY, JSON.stringify(events));
  } catch {
    // Ignore quota failures for catalog metadata.
  }
}

export function loadActiveEventId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_EVENT_KEY);
  } catch {
    return null;
  }
}

export function saveActiveEventId(eventId: string): void {
  try {
    localStorage.setItem(ACTIVE_EVENT_KEY, eventId);
  } catch {
    // Ignore storage failures.
  }
}

export function loadEventVault(eventId: string): ProcessedImage[] {
  try {
    const raw = localStorage.getItem(vaultKey(eventId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ProcessedImage[]) : [];
  } catch {
    return [];
  }
}

export function saveEventVault(eventId: string, images: ProcessedImage[]): boolean {
  try {
    localStorage.setItem(vaultKey(eventId), JSON.stringify(images));
    return true;
  } catch {
    return false;
  }
}

export function deleteEventVault(eventId: string): void {
  try {
    localStorage.removeItem(vaultKey(eventId));
  } catch {
    // Ignore storage failures.
  }
}

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
