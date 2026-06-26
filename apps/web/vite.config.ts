import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { mboxGpuDevServer } from "../../scripts/mbox-gpu-dev-server.mjs";

/** Showcase + imgly cutout: relaxed COEP. */
function conditionalCrossOriginIsolation(): Plugin {
  const isRelaxedCoepPath = (pathname: string) =>
    pathname === "/showcase" ||
    pathname.startsWith("/showcase/") ||
    pathname === "/showcase.html" ||
    pathname === "/" ||
    pathname === "/index.html";

  const applyHeaders = (
    req: { url?: string },
    res: { setHeader: (name: string, value: string) => void },
    next: () => void,
  ) => {
    const pathname = (req.url ?? "").split("?")[0];
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader(
      "Cross-Origin-Embedder-Policy",
      isRelaxedCoepPath(pathname) ? "unsafe-none" : "require-corp",
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
const repoRoot = path.resolve(webRoot, "../..");
const sharedRoot = path.resolve(webRoot, "../../packages/shared");
const backgroundsRoot = path.join(repoRoot, "data/background");
const userAssetsRoot = path.join(repoRoot, "data/user-assets");

const BACKGROUND_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".json": "application/json",
};

const USER_ASSET_MIME: Record<string, string> = {
  ...BACKGROUND_MIME,
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
};

function makeDataDirPlugin(opts: {
  name: string;
  rootDir: string;
  urlPrefix: string;
  distSubdir: string;
  mime: Record<string, string>;
}): Plugin {
  const { name, rootDir, urlPrefix, distSubdir, mime } = opts;
  const marker = `/${urlPrefix}/`;

  const serveFile = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const pathname = (req.url ?? "").split("?")[0];
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) {
      next();
      return;
    }
    const rel = decodeURIComponent(pathname.slice(markerIndex + marker.length));
    const filePath = path.resolve(rootDir, rel);
    if (!filePath.startsWith(rootDir)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      next();
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", mime[ext] ?? "application/octet-stream");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    fs.createReadStream(filePath).pipe(res);
  };

  return {
    name,
    configureServer(server) {
      server.middlewares.use(serveFile);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveFile);
    },
    closeBundle() {
      const outDir = path.join(webRoot, "dist", distSubdir);
      if (fs.existsSync(rootDir)) {
        fs.cpSync(rootDir, outDir, { recursive: true });
      }
    },
  };
}

/** Serve repo data/background at /backgrounds/; luxury/* falls back to MBOX_LUXURY_SOURCE. */
function serveDataBackgrounds(luxuryExternalRoot: string | null): Plugin {
  const marker = "/backgrounds/";

  const streamFile = (
    filePath: string,
    res: ServerResponse,
  ) => {
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", BACKGROUND_MIME[ext] ?? "application/octet-stream");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    fs.createReadStream(filePath).pipe(res);
  };

  const resolveBackgroundFile = (rel: string): string | null => {
    const filePath = path.resolve(backgroundsRoot, rel);
    if (!filePath.startsWith(backgroundsRoot)) {
      return null;
    }
    if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
      return filePath;
    }
    if (!luxuryExternalRoot || !rel.startsWith("luxury/")) {
      return null;
    }
    const luxuryName = rel.slice("luxury/".length);
    const externalRoot = path.resolve(luxuryExternalRoot);
    const externalPath = path.resolve(externalRoot, luxuryName);
    if (
      !externalPath.startsWith(externalRoot) ||
      !fs.existsSync(externalPath) ||
      fs.statSync(externalPath).isDirectory()
    ) {
      return null;
    }
    return externalPath;
  };

  const serveFile = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const pathname = (req.url ?? "").split("?")[0];
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) {
      next();
      return;
    }
    const rel = decodeURIComponent(pathname.slice(markerIndex + marker.length));
    const filePath = resolveBackgroundFile(rel);
    if (!filePath) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`Background not found: ${rel}`);
      return;
    }
    streamFile(filePath, res);
  };

  return {
    name: "serve-data-backgrounds",
    configureServer(server) {
      server.middlewares.use(serveFile);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveFile);
    },
    closeBundle() {
      const outDir = path.join(webRoot, "dist", "backgrounds");
      if (fs.existsSync(backgroundsRoot)) {
        fs.cpSync(backgroundsRoot, outDir, { recursive: true });
      }
    },
  };
}

function serveUserAssets(): Plugin {
  return makeDataDirPlugin({
    name: "serve-user-assets",
    rootDir: userAssetsRoot,
    urlPrefix: "user-assets",
    distSubdir: "user-assets",
    mime: USER_ASSET_MIME,
  });
}

/** Route /showcase/ to the crystal mesh showcase MPA entry. */
function showcaseReactEntry(): Plugin {
  const entry = "/showcase.html";
  const rewrite = (req: IncomingMessage, _res: ServerResponse, next: () => void) => {
    const pathname = (req.url ?? "").split("?")[0];
    if (
      pathname === "/showcase" ||
      pathname === "/showcase/" ||
      pathname === "/showcase/index.html"
    ) {
      const qs = (req.url ?? "").includes("?") ? `?${(req.url ?? "").split("?")[1]}` : "";
      req.url = entry + qs;
    }
    next();
  };
  return {
    name: "showcase-react-entry",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

const webDevPort = Number(process.env.MBOX_WEB_DEV_PORT ?? 5173);
const webPreviewPort = Number(process.env.MBOX_WEB_PREVIEW_PORT ?? 4173);

export default defineConfig(({ mode }) => {
  // Dev server uses apps/web/.env.development (local API + IndexedDB vault).
  const env = loadEnv(mode, webRoot, "");
  const bakeEnv = (key: string, fallback: string) =>
    JSON.stringify(env[key]?.trim() || process.env[key]?.trim() || fallback);

  const useLocalDefine = mode === "development";
  const localDevDefine = useLocalDefine
    ? {
        "import.meta.env.VITE_API_BASE_URL": bakeEnv("VITE_API_BASE_URL", "http://localhost:8787"),
        "import.meta.env.VITE_API_KEY": bakeEnv("VITE_API_KEY", ""),
        "import.meta.env.VITE_USE_SERVER_VAULT": JSON.stringify(
          env.VITE_USE_SERVER_VAULT ?? "false",
        ),
        "import.meta.env.VITE_RENDER_BACKEND": bakeEnv("VITE_RENDER_BACKEND", "local"),
        "import.meta.env.VITE_SHOWCASE_LOCAL_ONLY": JSON.stringify(
          env.VITE_SHOWCASE_LOCAL_ONLY ?? "true",
        ),
        "import.meta.env.VITE_LOCALHOST_DEMO": JSON.stringify(
          env.VITE_LOCALHOST_DEMO ?? "true",
        ),
      }
    : undefined;

  const productionDefine =
    mode === "production"
      ? {
          "import.meta.env.VITE_API_BASE_URL": bakeEnv("VITE_API_BASE_URL", "http://localhost:8787"),
          "import.meta.env.VITE_API_KEY": bakeEnv("VITE_API_KEY", ""),
          "import.meta.env.VITE_WORKSPACE_ID": bakeEnv("VITE_WORKSPACE_ID", "default"),
          "import.meta.env.VITE_USE_SERVER_VAULT": JSON.stringify(
            env.VITE_USE_SERVER_VAULT ?? "false",
          ),
          "import.meta.env.VITE_RENDER_BACKEND": bakeEnv("VITE_RENDER_BACKEND", ""),
          "import.meta.env.VITE_LOCALHOST_DEMO": JSON.stringify(
            env.VITE_LOCALHOST_DEMO ?? "false",
          ),
          "import.meta.env.VITE_ENABLE_DEV_ASSET_BATCH": JSON.stringify(
            env.VITE_ENABLE_DEV_ASSET_BATCH ?? "false",
          ),
          "import.meta.env.VITE_SHOWCASE_LOCAL_ONLY": JSON.stringify(
            env.VITE_SHOWCASE_LOCAL_ONLY ?? "false",
          ),
        }
      : undefined;

  const luxurySource =
    env.MBOX_LUXURY_SOURCE?.trim() ||
    process.env.MBOX_LUXURY_SOURCE?.trim() ||
    "E:\\MBOX\\럭셔리원본11";
  const luxuryExternalRoot = fs.existsSync(luxurySource) ? path.resolve(luxurySource) : null;

  return {
  envDir: webRoot,
  define: { ...productionDefine, ...localDevDefine },
  // GCS / subdirectory hosting: absolute "/assets/..." breaks on
  // https://storage.googleapis.com/BUCKET/index.html (resolves to host root).
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    conditionalCrossOriginIsolation(),
    showcaseReactEntry(),
    serveDataBackgrounds(luxuryExternalRoot),
    serveUserAssets(),
    mboxGpuDevServer(),
  ],
  resolve: {
    alias: {
      "@mbox/shared": path.resolve(sharedRoot, "src/index.ts"),
    },
  },
  server: {
    port: webDevPort,
    strictPort: true,
    fs: {
      allow: [
        webRoot,
        sharedRoot,
        repoRoot,
        ...(luxuryExternalRoot ? [luxuryExternalRoot] : []),
      ],
    },
  },
  preview: {
    port: webPreviewPort,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ["@imgly/background-removal", "@babylonjs/havok"],
  },
  build: {
    // three (~520 kB) and onnxruntime-web (~800 kB) exceed Rollup's default 500 kB hint.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: path.join(webRoot, "index.html"),
        showcase: path.join(webRoot, "showcase.html"),
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@babylonjs")) return "babylon";
          if (id.includes("/three/") || id.includes("\\three\\")) return "three";
          if (id.includes("onnxruntime-web")) return "onnx";
          if (id.includes("@imgly/background-removal")) return "imgly-bg-removal";
          if (id.includes("react-dom") || id.includes("/react/")) return "react-vendor";
        },
      },
    },
  },
};
});
