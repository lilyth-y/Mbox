import { WORKSPACE_ID } from "../config/runtime";

export function buildApiHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Workspace-Id": WORKSPACE_ID,
  };

  const apiKey = import.meta.env.VITE_API_KEY?.trim();
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  if (extra instanceof Headers) {
    extra.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(extra)) {
    for (const [key, value] of extra) {
      headers[key] = value;
    }
  } else if (extra) {
    Object.assign(headers, extra);
  }

  return headers;
}
