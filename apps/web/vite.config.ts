import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** imgly WASM needs COEP on the main app; wedding-simple CDN scripts need COEP relaxed. */
function conditionalCrossOriginIsolation(): Plugin {
  const applyHeaders = (
    req: { url?: string },
    res: { setHeader: (name: string, value: string) => void },
    next: () => void,
  ) => {
    const pathname = (req.url ?? "").split("?")[0];
    const isWeddingSimple =
      pathname === "/wedding-simple" || pathname.startsWith("/wedding-simple/");

    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader(
      "Cross-Origin-Embedder-Policy",
      isWeddingSimple ? "unsafe-none" : "require-corp",
    );
    next();
  };

  return {
    name: "conditional-cross-origin-isolation",
    configureServer(server) {
      server.middlewares.use(applyHeaders);
    },
    configurePreviewServer(server) {
      server.middlewares.use(applyHeaders);
    },
  };
}

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
  plugins: [react(), tailwindcss(), conditionalCrossOriginIsolation()],
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
  },
  preview: {
    port: 4173,
  },
  optimizeDeps: {
    exclude: ["@imgly/background-removal"],
  },
};
});
