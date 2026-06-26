import { isLocalGpuExportSession } from "../../shared/lib/renderExportProfile";

/** Headless Playwright / CI — explicit flags only (not navigator.webdriver — RTX Chrome preview uses Playwright too). */
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
  return w.__MBOX_SHOWCASE_E2E__ === true || w.__MBOX_SHOWCASE_AUTOMATION__ === true;
}
