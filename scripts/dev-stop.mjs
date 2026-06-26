#!/usr/bin/env node
/**
 * Stop stray Mbox dev/preview listeners (5173–5176, 4173, 8787).
 * Usage: npm run dev:stop
 */
import { spawnSync } from "node:child_process";

const ports = [
  ...new Set([
    Number(process.env.MBOX_WEB_DEV_PORT ?? 5173),
    5174,
    5175,
    5176,
    Number(process.env.MBOX_WEB_PREVIEW_PORT ?? 4173),
    Number(process.env.API_PORT ?? process.env.MBOX_API_DEV_PORT ?? 8787),
  ]),
].sort((a, b) => a - b);

function killPortWindows(port) {
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue ` +
        `| Select-Object -ExpandProperty OwningProcess -Unique ` +
        `| ForEach-Object { if ($_ -and $_ -ne 0) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }`,
    ],
    { stdio: "inherit" }
  );
}

function killPortUnix(port) {
  spawnSync("sh", ["-c", `lsof -ti:${port} 2>/dev/null | xargs -r kill -9`], {
    stdio: "inherit",
  });
}

const killPort = process.platform === "win32" ? killPortWindows : killPortUnix;

console.log("mbox dev:stop — freeing ports:", ports.join(", "));
for (const port of ports) {
  killPort(port);
}
console.log("Done. Start one stack: npm run preview:container  OR  npm run dev");
