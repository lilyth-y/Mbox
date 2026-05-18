import type {
  CategoryAssignmentMap,
  CreateEventRequest,
  HoloEvent,
  PresignVaultAssetRequest,
  PresignVaultAssetResponse,
  WorkspaceBootstrapResponse,
} from "@mbox/shared";
import type { ProcessedImage } from "../types";
import { buildApiHeaders } from "./headers";
import { formatApiConnectionError, formatWorkspaceApiError } from "./connectionErrors";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

async function workspaceFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/workspace${path}`, {
      ...options,
      headers: buildApiHeaders(options.headers),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(formatApiConnectionError(API_BASE_URL));
    }
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(formatWorkspaceApiError(response.status, errorBody, API_BASE_URL));
  }

  return (await response.json()) as T;
}

export async function fetchWorkspaceBootstrap(): Promise<WorkspaceBootstrapResponse> {
  return workspaceFetch<WorkspaceBootstrapResponse>("/bootstrap", { method: "GET" });
}

export async function putWorkspaceMeta(events: HoloEvent[], activeEventId: string): Promise<void> {
  await workspaceFetch("/meta", {
    method: "PUT",
    body: JSON.stringify({ events, activeEventId }),
  });
}

export async function presignVaultAssets(
  eventId: string,
  assets: PresignVaultAssetRequest["assets"]
): Promise<PresignVaultAssetResponse> {
  return workspaceFetch<PresignVaultAssetResponse>(
    `/events/${encodeURIComponent(eventId)}/vault/presign`,
    {
      method: "POST",
      body: JSON.stringify({ assets }),
    }
  );
}

export async function putEventVault(eventId: string, images: ProcessedImage[]): Promise<HoloEvent[]> {
  const result = await workspaceFetch<{ ok: boolean; events: HoloEvent[] }>(
    `/events/${encodeURIComponent(eventId)}/vault`,
    {
      method: "PUT",
      body: JSON.stringify({ images }),
    }
  );
  return result.events;
}

export async function putCategoryAssignments(
  eventId: string,
  assignments: CategoryAssignmentMap
): Promise<void> {
  await workspaceFetch(`/events/${encodeURIComponent(eventId)}/category-assignments`, {
    method: "PUT",
    body: JSON.stringify({ assignments }),
  });
}

export async function fetchEventVault(eventId: string): Promise<ProcessedImage[]> {
  const result = await workspaceFetch<{ images: ProcessedImage[] }>(
    `/events/${encodeURIComponent(eventId)}/vault`,
    { method: "GET" }
  );
  return result.images;
}

export async function fetchCategoryAssignments(eventId: string): Promise<CategoryAssignmentMap> {
  const result = await workspaceFetch<{ assignments: CategoryAssignmentMap }>(
    `/events/${encodeURIComponent(eventId)}/category-assignments`,
    { method: "GET" }
  );
  return result.assignments;
}

export async function createWorkspaceEvent(
  name: string,
  description?: string
): Promise<HoloEvent> {
  const body: CreateEventRequest = { name, description };
  const result = await workspaceFetch<{ event: HoloEvent }>("/events", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return result.event;
}

export async function deleteWorkspaceEvent(eventId: string): Promise<{
  events: HoloEvent[];
  activeEventId: string;
}> {
  return workspaceFetch(`/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
}

export function assignmentsFromImages(images: ProcessedImage[]): CategoryAssignmentMap {
  const assignments: CategoryAssignmentMap = {};
  for (const image of images) {
    if (image.userCategory) {
      assignments[String(image.id)] = { userCategory: image.userCategory };
    }
  }
  return assignments;
}

export function applyServerCategoryAssignments(
  images: ProcessedImage[],
  assignments: CategoryAssignmentMap
): ProcessedImage[] {
  return images.map((image) => {
    const stored = assignments[String(image.id)];
    if (!stored?.userCategory) {
      return image;
    }
    return { ...image, userCategory: stored.userCategory };
  });
}
