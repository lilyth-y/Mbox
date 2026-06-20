import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** imgly WASM needs COEP on the main app; wedding-simple / premium CDN+WASM need COEP relaxed. */
function conditionalCrossOriginIsolation(): Plugin {
  const isRelaxedCoepPath = (pathname: string) =>
    pathname === "/wedding-simple" ||
    pathname.startsWith("/wedding-simple/") ||
    pathname === "/wedding-simple.html" ||
    pathname === "/premium" ||
    pathname.startsWith("/premium/") ||
    pathname === "/premium.html" ||
    pathname === "/showcase" ||
    pathname.startsWith("/showcase/") ||
    pathname === "/showcase.html";

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
const cubeCoreRoot = path.resolve(webRoot, "../../packages/cube-core");
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

/** Serve repo data/background at /backgrounds/ (dev + preview); copy into dist on build. */
function serveDataBackgrounds(): Plugin {
  return makeDataDirPlugin({
    name: "serve-data-backgrounds",
    rootDir: backgroundsRoot,
    urlPrefix: "backgrounds",
    distSubdir: "backgrounds",
    mime: BACKGROUND_MIME,
  });
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

/** Route /wedding-simple/ to the React MPA entry (replaces legacy static index.html). */
function weddingSimpleReactEntry(): Plugin {
  const entry = "/wedding-simple.html";
  const rewrite = (req: IncomingMessage, _res: ServerResponse, next: () => void) => {
    const pathname = (req.url ?? "").split("?")[0];
    if (
      pathname === "/wedding-simple" ||
      pathname === "/wedding-simple/" ||
      pathname === "/wedding-simple/index.html"
    ) {
      const qs = (req.url ?? "").includes("?") ? `?${(req.url ?? "").split("?")[1]}` : "";
      req.url = entry + qs;
    }
    next();
  };
  return {
    name: "wedding-simple-react-entry",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
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

/** Route /premium/ to the Babylon.js premium MPA entry. */
function premiumReactEntry(): Plugin {
  const entry = "/premium.html";
  const rewrite = (req: IncomingMessage, _res: ServerResponse, next: () => void) => {
    const pathname = (req.url ?? "").split("?")[0];
    if (
      pathname === "/premium" ||
      pathname === "/premium/" ||
      pathname === "/premium/index.html"
    ) {
      const qs = (req.url ?? "").includes("?") ? `?${(req.url ?? "").split("?")[1]}` : "";
      req.url = entry + qs;
    }
    next();
  };
  return {
    name: "premium-react-entry",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

const CLOUD_API_BASE_URL =
  "https://mbox-api-118689443638.asia-northeast3.run.app";

const webDevPort = Number(process.env.MBOX_WEB_DEV_PORT ?? 5173);
const webPreviewPort = Number(process.env.MBOX_WEB_PREVIEW_PORT ?? 4173);

const LOCAL_DEV_DEFINE = {
  "import.meta.env.VITE_API_BASE_URL": JSON.stringify(CLOUD_API_BASE_URL),
  "import.meta.env.VITE_USE_SERVER_VAULT": JSON.stringify("true"),
  "import.meta.env.VITE_LOCALHOST_DEMO": JSON.stringify("false"),
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
  plugins: [
    react(),
    tailwindcss(),
    conditionalCrossOriginIsolation(),
    weddingSimpleReactEntry(),
    premiumReactEntry(),
    showcaseReactEntry(),
    serveDataBackgrounds(),
    serveUserAssets(),
  ],
  resolve: {
    alias: {
      "@mbox/shared": path.resolve(sharedRoot, "src/index.ts"),
      "@mbox/cube-core": path.resolve(cubeCoreRoot, "src/index.ts"),
    },
  },
  server: {
    port: webDevPort,
    fs: {
      allow: [webRoot, sharedRoot, cubeCoreRoot, repoRoot],
    },
  },
  preview: {
    port: webPreviewPort,
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
        weddingSimple: path.join(webRoot, "wedding-simple.html"),
        premium: path.join(webRoot, "premium.html"),
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
