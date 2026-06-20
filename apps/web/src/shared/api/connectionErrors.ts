import { DEFAULT_LOCAL_API_URL, DEFAULT_LOCAL_WEB_URL, MBOX_API_DEV_PORT } from "@mbox/shared";

const LOCAL_API_HINT = DEFAULT_LOCAL_API_URL.replace("127.0.0.1", "localhost");

export function isLocalApiBaseUrl(apiBaseUrl: string): boolean {
  try {
    const url = new URL(apiBaseUrl);
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (url.port === String(MBOX_API_DEV_PORT) || url.port === "")
    );
  } catch {
    return apiBaseUrl.includes("localhost") || apiBaseUrl.includes("127.0.0.1");
  }
}

export function formatApiConnectionError(apiBaseUrl: string): string {
  if (isLocalApiBaseUrl(apiBaseUrl)) {
    return (
      `API에 연결할 수 없습니다 (${apiBaseUrl}). ` +
      "터미널에서 `npm run dev` 로 API·웹을 함께 띄운 뒤, " +
      `웹은 \`npm run dev:urls\` 로 확인 (보통 ${DEFAULT_LOCAL_WEB_URL})으로 여세요.`
    );
  }

  const hasApiKey = Boolean(import.meta.env.VITE_API_KEY?.trim());
  const keyHint = hasApiKey
    ? "API 키는 빌드에 포함되어 있습니다. 네트워크·방화벽·광고 차단을 확인하세요."
    : "클라우드 API는 VITE_API_KEY가 필요합니다. 로컬 개발은 apps/web/.env 에 " +
      `VITE_API_BASE_URL=${LOCAL_API_HINT} 와 VITE_USE_SERVER_VAULT=false 를 사용하세요.`;

  return (
    `API에 연결할 수 없습니다 (${apiBaseUrl}). ` +
    `${keyHint} ` +
    "호스팅 웹은 https://mbox-web-newmedia-496107.storage.googleapis.com/index.html 에서 여세요."
  );
}

export function formatWorkspaceApiError(status: number, body: string, apiBaseUrl: string): string {
  if (status === 401) {
    return (
      `API 인증 실패 (401). ${isLocalApiBaseUrl(apiBaseUrl) ? "로컬 API에 API_KEY가 설정돼 있으면 apps/web/.env 에 VITE_API_KEY를 맞추세요." : "배포 웹은 Cloud Build 시 VITE_API_KEY(Secret Manager)가 주입돼야 합니다."} ` +
      `또는 로컬만 쓸 때: VITE_USE_SERVER_VAULT=false`
    );
  }
  return `Workspace API failed (${status}): ${body}`;
}
