import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const sharedRoot = path.resolve(webRoot, "../../packages/shared");

const LOCAL_DEV_DEFINE = {
  "import.meta.env.VITE_API_BASE_URL": JSON.stringify("http://localhost:8787"),
  "import.meta.env.VITE_USE_SERVER_VAULT": JSON.stringify("false"),
  "import.meta.env.VITE_LOCALHOST_DEMO": JSON.stringify("true"),
} as const;

export default defineConfig(({ mode }) => {
  // Dev server always uses local API/IndexedDB (shell VITE_* may point at prod).
  const useLocalDefine = mode === "development";

  return {
  envDir: webRoot,
  define: useLocalDefine ? { ...LOCAL_DEV_DEFINE } : undefined,
  // GCS / subdirectory hosting: absolute "/assets/..." breaks on
  // https://storage.googleapis.com/BUCKET/index.html (resolves to host root).
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@mbox/shared": path.resolve(sharedRoot, "src/index.ts"),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [webRoot, sharedRoot],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    port: 4173,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["@imgly/background-removal"],
  },
};
});
