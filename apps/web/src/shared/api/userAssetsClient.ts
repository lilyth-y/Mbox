import { DEFAULT_LOCAL_API_URL } from "@mbox/shared";
import { buildApiHeaders } from "./headers";
import { formatApiConnectionError } from "./connectionErrors";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_LOCAL_API_URL;

async function userAssetsFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/user-assets${path}`, {
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
    const body = await response.text();
    let message = body;
    try {
      message = (JSON.parse(body) as { error?: string }).error ?? body;
    } catch {
      /* plain text */
    }
    throw new Error(message || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function syncUserAssetsViaApi(): Promise<void> {
  await userAssetsFetch<{ ok: boolean }>("/sync", { method: "POST" });
}

export async function uploadUserAssetViaApi(
  kind: "bgm" | "image" | "video",
  file: File
): Promise<{ relativePath: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const dataBase64 = btoa(binary);
  return userAssetsFetch<{ ok: boolean; relativePath: string }>("/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, filename: file.name, dataBase64 }),
  });
}

export async function deleteUserAssetViaApi(relativePath: string): Promise<void> {
  const query = new URLSearchParams({ path: relativePath });
  await userAssetsFetch<{ ok: boolean }>(`/?${query}`, { method: "DELETE" });
}
