import { isLocalGpuExportSession } from "../../shared/lib/renderExportProfile";

/** Headless Playwright / CI — avoid Havok + context-loss rebuild loops. */
export function isShowcaseAutomationSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (isLocalGpuExportSession()) {
    return false;
  }
  const w = window as unknown as {
    __MBOX_SHOWCASE_E2E__?: boolean;
    __MBOX_SHOWCASE_AUTOMATION__?: boolean;
  };
  if (w.__MBOX_SHOWCASE_E2E__ === true || w.__MBOX_SHOWCASE_AUTOMATION__ === true) {
    return true;
  }
  try {
    return navigator.webdriver === true;
  } catch {
    return false;
  }
}
