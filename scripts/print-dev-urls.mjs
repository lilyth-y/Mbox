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
console.log("Entry points");
console.log(`  Main app         ${WEB_URL}/`);
console.log(`  Wedding simple   ${WEB_URL}/wedding-simple/`);
console.log(`  Showcase         ${WEB_URL}/showcase/`);
console.log(`  Premium          ${WEB_URL}/premium/`);
