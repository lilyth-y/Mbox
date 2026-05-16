import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const sharedRoot = path.resolve(webRoot, "../../packages/shared");

export default defineConfig({
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
  },
  preview: {
    port: 4173,
  },
});
