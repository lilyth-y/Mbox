#!/usr/bin/env node
import {
  API_URL,
  MBOX_API_DEV_PORT,
  MBOX_WEB_DEV_PORT,
  MBOX_WEB_PREVIEW_PORT,
  WEB_URL,
} from "./lib/dev-ports.mjs";

console.log("Mbox local ports");
console.log("────────────────────────────────────────");
console.log(`Web (Vite dev)     ${WEB_URL}  (MBOX_WEB_DEV_PORT=${MBOX_WEB_DEV_PORT})`);
console.log(`Web (Vite preview) http://localhost:${MBOX_WEB_PREVIEW_PORT}  (MBOX_WEB_PREVIEW_PORT)`);
console.log(`API                ${API_URL}  (API_PORT=${MBOX_API_DEV_PORT})`);
console.log("");
console.log("Crystal Showcase");
console.log(`  Cursor shell     ${WEB_URL}/showcase.html`);
console.log(`  RTX Chrome GPU   ${WEB_URL}/showcase.html?localOnly=1&fullGpu=1&companionTarget=1&noPhysics=1`);
console.log(`  npm run open:showcase-gpu`);
