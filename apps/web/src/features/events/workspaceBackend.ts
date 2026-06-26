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
} from "./categoryStorage";
import { prepareImagesForServerVault } from "./cloudVaultSync";
import {
  auditVoluMaxVaultIntegrity,
  formatVoluMaxVaultAuditMessage,
} from "../../shared/lib/voluMaxVaultIntegrity";
import type { VaultSaveResult } from "./indexedDbVault";
import {
  bootstrapEventWorkspace,
  createEventRecord,
  deleteEventVault,
  loadEventVault,
  loadEventVaultReport,
  saveActiveEventId,
  saveEventCatalog,
  saveEventVault,
  touchEvent,
} from "./eventStorage";

export interface EventWorkspaceState {
  events: HoloEvent[];
  activeEventId: string;
  processedImages: ProcessedImage[];
  voluMaxVaultNotice?: string;
}

export function usesServerVault(): boolean {
  return USE_SERVER_VAULT;
}

function formatVaultSkippedMessage(
  skipped: Array<{ id: number; label: string }>
): string | undefined {
  if (skipped.length === 0) {
    return undefined;
  }
  const preview = skipped
    .slice(0, 3)
    .map((entry) => entry.label)
    .join(", ");
  const suffix = skipped.length > 3 ? ` 외 ${skipped.length - 3}장` : "";
  return `손상된 보관함 항목 ${skipped.length}장을 건너뛰었습니다 (${preview}${suffix}). 해당 사진을 다시 업로드하세요.`;
}

export async function bootstrapLocalWorkspace(): Promise<EventWorkspaceState> {
  const { events, activeEventId } = bootstrapEventWorkspace();
  const vaultReport = await loadEventVaultReport(activeEventId);
  const processedImages = applyStoredCategoryAssignments(vaultReport.images, activeEventId);
  const voluMaxVaultNotice = [
    formatVaultSkippedMessage(vaultReport.skipped),
    formatVoluMaxVaultAuditMessage(auditVoluMaxVaultIntegrity(processedImages)),
  ]
    .filter(Boolean)
    .join(" ");
  return {
    events,
    activeEventId,
    processedImages,
    voluMaxVaultNotice: voluMaxVaultNotice || undefined,
  };
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
  const images = applyStoredCategoryAssignments(await loadEventVault(eventId), eventId);
  return images;
}

export async function persistEventVault(
  eventId: string,
  images: ProcessedImage[],
  events: HoloEvent[]
): Promise<{ saved: boolean; events: HoloEvent[]; vaultSave?: VaultSaveResult }> {
  saveCategoryAssignments(images, eventId);

  if (USE_SERVER_VAULT) {
    const prepared = await prepareImagesForServerVault(eventId, images);
    await putCategoryAssignments(eventId, assignmentsFromImages(prepared));
    const nextEvents = await putEventVault(eventId, prepared);
    return { saved: true, events: nextEvents };
  }

  const vaultSave = await saveEventVault(eventId, images);
  return { saved: vaultSave.saved, events: touchEvent(events, eventId), vaultSave };
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
  await saveEventVault(event.id, []);
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

  await deleteEventVault(eventId);
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
