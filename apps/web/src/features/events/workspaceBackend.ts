import type { HoloEvent } from "@mbox/shared";
import type { ProcessedImage } from "../../shared/types";
import { USE_SERVER_VAULT } from "../../shared/config/runtime";
import {
  applyServerCategoryAssignments,
  assignmentsFromImages,
  createWorkspaceEvent,
  deleteWorkspaceEvent,
  fetchCategoryAssignments,
  fetchEventVault,
  fetchWorkspaceBootstrap,
  putCategoryAssignments,
  putEventVault,
  putWorkspaceMeta,
} from "../../shared/api/workspaceClient";
import {
  applyStoredCategoryAssignments,
  saveCategoryAssignments,
} from "../gallery/categoryStorage";
import {
  bootstrapEventWorkspace,
  createEventRecord,
  deleteEventVault,
  loadEventVault,
  saveActiveEventId,
  saveEventCatalog,
  saveEventVault,
  touchEvent,
} from "./eventStorage";

export interface EventWorkspaceState {
  events: HoloEvent[];
  activeEventId: string;
  processedImages: ProcessedImage[];
}

export function usesServerVault(): boolean {
  return USE_SERVER_VAULT;
}

export function bootstrapLocalWorkspace(): EventWorkspaceState {
  const { events, activeEventId } = bootstrapEventWorkspace();
  const processedImages = applyStoredCategoryAssignments(
    loadEventVault(activeEventId),
    activeEventId
  );
  return { events, activeEventId, processedImages };
}

export async function bootstrapRemoteWorkspace(): Promise<EventWorkspaceState> {
  const payload = await fetchWorkspaceBootstrap();
  const processedImages = applyServerCategoryAssignments(
    payload.vault as unknown as ProcessedImage[],
    payload.categoryAssignments
  );
  return {
    events: payload.events,
    activeEventId: payload.activeEventId,
    processedImages,
  };
}

export async function loadEventGallery(
  eventId: string
): Promise<ProcessedImage[]> {
  if (USE_SERVER_VAULT) {
    const [vault, assignments] = await Promise.all([
      fetchEventVault(eventId),
      fetchCategoryAssignments(eventId),
    ]);
    return applyServerCategoryAssignments(vault, assignments);
  }
  return applyStoredCategoryAssignments(loadEventVault(eventId), eventId);
}

export async function persistEventVault(
  eventId: string,
  images: ProcessedImage[],
  events: HoloEvent[]
): Promise<{ saved: boolean; events: HoloEvent[] }> {
  saveCategoryAssignments(images, eventId);

  if (USE_SERVER_VAULT) {
    await putCategoryAssignments(eventId, assignmentsFromImages(images));
    const nextEvents = await putEventVault(eventId, images);
    return { saved: true, events: nextEvents };
  }

  const saved = saveEventVault(eventId, images);
  return { saved, events: touchEvent(events, eventId) };
}

export async function switchToEvent(
  fromEventId: string,
  toEventId: string,
  currentImages: ProcessedImage[],
  events: HoloEvent[]
): Promise<EventWorkspaceState> {
  await persistEventVault(fromEventId, currentImages, events);

  if (USE_SERVER_VAULT) {
    await putWorkspaceMeta(events, toEventId);
    const processedImages = await loadEventGallery(toEventId);
    return { events, activeEventId: toEventId, processedImages };
  }

  saveActiveEventId(toEventId);
  const processedImages = await loadEventGallery(toEventId);
  return { events, activeEventId: toEventId, processedImages };
}

export async function createEventWorkspace(
  name: string,
  description: string | undefined,
  fromEventId: string,
  currentImages: ProcessedImage[],
  events: HoloEvent[]
): Promise<EventWorkspaceState> {
  await persistEventVault(fromEventId, currentImages, events);

  if (USE_SERVER_VAULT) {
    const event = await createWorkspaceEvent(name, description);
    const nextEvents = [...events, event];
    return { events: nextEvents, activeEventId: event.id, processedImages: [] };
  }

  const event = createEventRecord(name, description);
  const nextEvents = [...events, event];
  saveEventCatalog(nextEvents);
  saveActiveEventId(event.id);
  saveEventVault(event.id, []);
  return { events: nextEvents, activeEventId: event.id, processedImages: [] };
}

export async function deleteEventWorkspace(
  eventId: string,
  events: HoloEvent[]
): Promise<EventWorkspaceState> {
  if (USE_SERVER_VAULT) {
    const meta = await deleteWorkspaceEvent(eventId);
    const processedImages = await loadEventGallery(meta.activeEventId);
    return {
      events: meta.events,
      activeEventId: meta.activeEventId,
      processedImages,
    };
  }

  deleteEventVault(eventId);
  const nextEvents = events.filter((event) => event.id !== eventId);
  const nextActive = nextEvents[0];
  if (!nextActive) {
    throw new Error("At least one event must remain.");
  }
  saveEventCatalog(nextEvents);
  saveActiveEventId(nextActive.id);
  const processedImages = await loadEventGallery(nextActive.id);
  return {
    events: nextEvents,
    activeEventId: nextActive.id,
    processedImages,
  };
}
