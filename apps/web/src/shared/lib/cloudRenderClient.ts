import type {
  CreateRenderJobRequest,
  GetRenderJobResponse,
  RenderJobRecord,
} from "@mbox/shared";
import { isTerminalRenderJobStatus } from "@mbox/shared";
import { API_PUBLIC_URL } from "../config/runtime";
import { buildApiHeaders } from "../api/headers";
import { formatWorkspaceApiError } from "../api/connectionErrors";

export type SubmitRenderJobOptions = {
  pollIntervalMs?: number;
  timeoutMs?: number;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function createRenderJob(
  request: CreateRenderJobRequest
): Promise<RenderJobRecord> {
  const response = await fetch(`${API_PUBLIC_URL}/render/jobs`, {
    method: "POST",
    headers: buildApiHeaders(),
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const bodyText = await response.text();
    if (response.status === 401) {
      throw new Error(formatWorkspaceApiError(response.status, bodyText, API_PUBLIC_URL));
    }
    let body: { error?: string } = {};
    try {
      body = JSON.parse(bodyText || "{}") as { error?: string };
    } catch {
      // non-JSON error body
    }
    throw new Error(body.error ?? `Render job create failed (${response.status}).`);
  }
  const data = (await response.json()) as { job: RenderJobRecord };
  return data.job;
}

export async function getRenderJob(jobId: string): Promise<RenderJobRecord> {
  const response = await fetch(`${API_PUBLIC_URL}/render/jobs/${encodeURIComponent(jobId)}`, {
    headers: buildApiHeaders(),
  });
  if (!response.ok) {
    const bodyText = await response.text();
    if (response.status === 401) {
      throw new Error(formatWorkspaceApiError(response.status, bodyText, API_PUBLIC_URL));
    }
    let body: { error?: string } = {};
    try {
      body = JSON.parse(bodyText || "{}") as { error?: string };
    } catch {
      // non-JSON error body
    }
    throw new Error(body.error ?? `Render job fetch failed (${response.status}).`);
  }
  const data = (await response.json()) as GetRenderJobResponse;
  return data.job;
}

export async function submitAndAwaitRenderJob(
  request: CreateRenderJobRequest,
  options: SubmitRenderJobOptions = {}
): Promise<RenderJobRecord> {
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const timeoutMs = options.timeoutMs ?? 600_000;
  const job = await createRenderJob(request);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const current = await getRenderJob(job.id);
    if (current.status === "done") {
      return current;
    }
    if (isTerminalRenderJobStatus(current.status) && current.status === "failed") {
      throw new Error(current.error ?? "Cloud render job failed.");
    }
    await delay(pollIntervalMs);
  }

  throw new Error("Cloud render job timed out.");
}

export async function downloadRenderJobOutput(job: RenderJobRecord, filename: string): Promise<void> {
  if (!job.outputUrl) {
    throw new Error("Render job has no output URL.");
  }
  const response = await fetch(job.outputUrl);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}).`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
