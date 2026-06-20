/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_LOCALHOST_DEMO?: string;
  readonly VITE_USE_SERVER_VAULT?: string;
  readonly VITE_API_KEY?: string;
  readonly VITE_WORKSPACE_ID?: string;
  readonly VITE_ENABLE_DEV_ASSET_BATCH?: string;
  readonly VITE_API_MAX_RETRIES?: string;
  readonly VITE_SHOWCASE_LOCAL_ONLY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
