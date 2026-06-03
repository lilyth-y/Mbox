/**
 * Poll GET /health until the API responds OK or timeout.
 */
export async function waitForApiReady(apiBaseUrl, timeoutMs = 120_000) {
  const started = Date.now();
  let lastError = null;

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${apiBaseUrl}/health`);
      if (res.ok) {
        return await res.text();
      }
      lastError = new Error(`API unhealthy (${res.status})`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw lastError ?? new Error(`API not ready within ${timeoutMs}ms`);
}
