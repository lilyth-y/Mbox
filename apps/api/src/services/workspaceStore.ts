import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CategoryAssignmentMap,
  CreateEventRequest,
  HoloEvent,
  VaultImageRecord,
  WorkspaceBootstrapResponse,
  WorkspaceMeta,
} from "@mbox/shared";

const DATA_DIR = process.env.WORKSPACE_DATA_DIR ?? path.join(process.cwd(), "data", "workspaces");

function workspaceRoot(workspaceId: string): string {
  const safe = workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DATA_DIR, safe);
}

function catalogPath(workspaceId: string): string {
  return path.join(workspaceRoot(workspaceId), "catalog.json");
}

function activeEventPath(workspaceId: string): string {
  return path.join(workspaceRoot(workspaceId), "active-event.txt");
}

function vaultPath(workspaceId: string, eventId: string): string {
  const safeEvent = eventId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(workspaceRoot(workspaceId), "vaults", `${safeEvent}.json`);
}

function assignmentsPath(workspaceId: string, eventId: string): string {
  const safeEvent = eventId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(workspaceRoot(workspaceId), "assignments", `${safeEvent}.json`);
}

async function ensureWorkspaceDir(workspaceId: string): Promise<void> {
  await mkdir(path.join(workspaceRoot(workspaceId), "vaults"), { recursive: true });
  await mkdir(path.join(workspaceRoot(workspaceId), "assignments"), { recursive: true });
}

function createEventId(): string {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultEvent(): HoloEvent {
  const now = Date.now();
  return {
    id: createEventId(),
    name: "기본 이벤트",
    description: "서버 보관함",
    createdAt: now,
    updatedAt: now,
  };
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value), "utf8");
}

export function resolveWorkspaceId(headerValue: string | undefined): string {
  const trimmed = headerValue?.trim();
  if (!trimmed) {
    return "default";
  }
  return trimmed.slice(0, 64);
}

export async function loadWorkspaceMeta(workspaceId: string): Promise<WorkspaceMeta> {
  await ensureWorkspaceDir(workspaceId);
  let events = await readJsonFile<HoloEvent[]>(catalogPath(workspaceId), []);
  let activeEventId = "";

  try {
    activeEventId = (await readFile(activeEventPath(workspaceId), "utf8")).trim();
  } catch {
    activeEventId = "";
  }

  if (events.length === 0) {
    const event = defaultEvent();
    events = [event];
    activeEventId = event.id;
    await saveWorkspaceMeta(workspaceId, { events, activeEventId });
  } else if (!activeEventId || !events.some((event) => event.id === activeEventId)) {
    activeEventId = events[0].id;
    await writeFile(activeEventPath(workspaceId), activeEventId, "utf8");
  }

  return { events, activeEventId };
}

export async function saveWorkspaceMeta(workspaceId: string, meta: WorkspaceMeta): Promise<void> {
  await ensureWorkspaceDir(workspaceId);
  await writeJsonFile(catalogPath(workspaceId), meta.events);
  await writeFile(activeEventPath(workspaceId), meta.activeEventId, "utf8");
}

export async function loadEventVault(
  workspaceId: string,
  eventId: string
): Promise<VaultImageRecord[]> {
  return readJsonFile<VaultImageRecord[]>(vaultPath(workspaceId, eventId), []);
}

export async function saveEventVault(
  workspaceId: string,
  eventId: string,
  images: VaultImageRecord[]
): Promise<void> {
  await ensureWorkspaceDir(workspaceId);
  await writeJsonFile(vaultPath(workspaceId, eventId), images);
}

export async function loadCategoryAssignments(
  workspaceId: string,
  eventId: string
): Promise<CategoryAssignmentMap> {
  return readJsonFile<CategoryAssignmentMap>(assignmentsPath(workspaceId, eventId), {});
}

export async function saveCategoryAssignments(
  workspaceId: string,
  eventId: string,
  assignments: CategoryAssignmentMap
): Promise<void> {
  await ensureWorkspaceDir(workspaceId);
  await writeJsonFile(assignmentsPath(workspaceId, eventId), assignments);
}

export async function bootstrapWorkspace(
  workspaceId: string
): Promise<WorkspaceBootstrapResponse> {
  const meta = await loadWorkspaceMeta(workspaceId);
  const [vault, categoryAssignments] = await Promise.all([
    loadEventVault(workspaceId, meta.activeEventId),
    loadCategoryAssignments(workspaceId, meta.activeEventId),
  ]);
  return { ...meta, vault, categoryAssignments };
}

export async function createEvent(
  workspaceId: string,
  body: CreateEventRequest
): Promise<HoloEvent> {
  const meta = await loadWorkspaceMeta(workspaceId);
  const now = Date.now();
  const event: HoloEvent = {
    id: createEventId(),
    name: body.name.trim(),
    description: body.description?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  const events = [...meta.events, event];
  await saveWorkspaceMeta(workspaceId, { events, activeEventId: event.id });
  await saveEventVault(workspaceId, event.id, []);
  await saveCategoryAssignments(workspaceId, event.id, {});
  return event;
}

export async function deleteEvent(workspaceId: string, eventId: string): Promise<WorkspaceMeta> {
  const meta = await loadWorkspaceMeta(workspaceId);
  if (meta.events.length <= 1) {
    throw new Error("At least one event must remain.");
  }

  const events = meta.events.filter((event) => event.id !== eventId);
  const activeEventId =
    meta.activeEventId === eventId ? (events[0]?.id ?? meta.activeEventId) : meta.activeEventId;

  await Promise.all([
    rm(vaultPath(workspaceId, eventId), { force: true }),
    rm(assignmentsPath(workspaceId, eventId), { force: true }),
  ]);

  const nextMeta = { events, activeEventId };
  await saveWorkspaceMeta(workspaceId, nextMeta);
  return nextMeta;
}

export async function touchEvent(workspaceId: string, eventId: string): Promise<HoloEvent[]> {
  const meta = await loadWorkspaceMeta(workspaceId);
  const events = meta.events.map((event) =>
    event.id === eventId ? { ...event, updatedAt: Date.now() } : event
  );
  await saveWorkspaceMeta(workspaceId, { ...meta, events });
  return events;
}
