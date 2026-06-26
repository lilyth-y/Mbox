/** Dev server spawns RTX Chrome; production falls back to a new tab. */
export async function openSystemGpuBrowser(pageUrl?: string): Promise<void> {
  const url = pageUrl ?? window.location.href;
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(
        `/__mbox/dev/open-gpu-browser?url=${encodeURIComponent(url)}`,
        { method: "POST" }
      );
      if (res.ok) {
        return;
      }
    } catch {
      // fall through to window.open
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
