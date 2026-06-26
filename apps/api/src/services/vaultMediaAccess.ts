import crypto from "node:crypto";

const READ_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const UPLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;

function signingSecret(): string {
  return process.env.API_KEY?.trim() || "dev-insecure";
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function timingSafeEqualStr(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function assertSafeVaultObjectPath(objectPath: string): void {
  const allowed =
    (objectPath.startsWith("workspaces/") || objectPath.startsWith("renders/")) &&
    !objectPath.includes("..");
  if (!allowed) {
    throw new Error("Invalid vault object path.");
  }
}

export function issueVaultReadToken(objectPath: string): { exp: number; token: string } {
  assertSafeVaultObjectPath(objectPath);
  const exp = Date.now() + READ_TOKEN_TTL_MS;
  return { exp, token: signPayload(`read:${objectPath}:${exp}`) };
}

export function issueVaultUploadToken(
  objectPath: string,
  contentType: string
): { exp: number; token: string } {
  assertSafeVaultObjectPath(objectPath);
  const exp = Date.now() + UPLOAD_TOKEN_TTL_MS;
  return {
    exp,
    token: signPayload(`write:${objectPath}:${contentType}:${exp}`),
  };
}

export function verifyVaultReadToken(objectPath: string, exp: number, token: string): boolean {
  if (!token || !Number.isFinite(exp) || Date.now() > exp) {
    return false;
  }
  try {
    assertSafeVaultObjectPath(objectPath);
  } catch {
    return false;
  }
  const expected = signPayload(`read:${objectPath}:${exp}`);
  return timingSafeEqualStr(token, expected);
}

export function verifyVaultUploadToken(
  objectPath: string,
  contentType: string,
  exp: number,
  token: string
): boolean {
  if (!token || !Number.isFinite(exp) || Date.now() > exp) {
    return false;
  }
  try {
    assertSafeVaultObjectPath(objectPath);
  } catch {
    return false;
  }
  const expected = signPayload(`write:${objectPath}:${contentType}:${exp}`);
  return timingSafeEqualStr(token, expected);
}

export function resolveApiPublicBaseUrl(): string | null {
  const base = process.env.API_PUBLIC_BASE_URL?.trim();
  return base ? base.replace(/\/$/, "") : null;
}

export function encodeVaultMediaPath(objectPath: string): string {
  return objectPath.split("/").map(encodeURIComponent).join("/");
}

export function buildVaultMediaReadUrl(objectPath: string): string {
  const base = resolveApiPublicBaseUrl();
  if (!base) {
    throw new Error("API_PUBLIC_BASE_URL is not configured.");
  }
  const { exp, token } = issueVaultReadToken(objectPath);
  return `${base}/workspace/vault-media/${encodeVaultMediaPath(objectPath)}?exp=${exp}&token=${token}`;
}

export function buildVaultMediaUploadUrl(objectPath: string, contentType: string): string {
  const base = resolveApiPublicBaseUrl();
  if (!base) {
    throw new Error("API_PUBLIC_BASE_URL is not configured.");
  }
  const { exp, token } = issueVaultUploadToken(objectPath, contentType);
  return `${base}/workspace/vault-media/${encodeVaultMediaPath(objectPath)}?exp=${exp}&token=${token}`;
}

export function extractVaultMediaObjectPath(requestPath: string): string | null {
  const markers = ["/workspace/vault-media/", "/vault-media/"];
  for (const marker of markers) {
    const index = requestPath.indexOf(marker);
    if (index < 0) {
      continue;
    }
    const encoded = requestPath.slice(index + marker.length).split("?")[0] ?? "";
    if (!encoded) {
      continue;
    }
    return decodeURIComponent(encoded);
  }
  return null;
}
