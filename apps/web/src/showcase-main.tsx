import { createRoot } from "react-dom/client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { MboxPageShell } from "./components/MboxPageShell";
import { shouldUseConservativeShowcaseWebGl } from "./features/showcase/babylon/babylonCanvasGuard";
import { ShowcaseDashboard } from "./features/showcase/ShowcaseDashboard";
import "./styles/index.css";

class ShowcaseRootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[showcase] root render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <MboxPageShell wide>
          <div className="mbox-card p-8 max-w-lg mx-auto mt-12 space-y-4 text-center">
            <p className="text-mbox-text font-semibold">크리스탈 쇼케이스를 표시하지 못했습니다.</p>
            <p className="text-sm text-mbox-muted leading-relaxed">
              {this.state.error.message || "알 수 없는 오류"}
            </p>
            <button
              type="button"
              className="primary-btn"
              onClick={() => window.location.reload()}
            >
              새로고침
            </button>
          </div>
        </MboxPageShell>
      );
    }
    return this.props.children;
  }
}

function shouldPrefetchHavokOnShowcaseLoad(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const w = window as { __MBOX_LOCAL_GPU_EXPORT__?: boolean };
  if (w.__MBOX_LOCAL_GPU_EXPORT__ === true) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("noPhysics") === "1" || params.get("kinematic") === "1") {
    return false;
  }
  return !shouldUseConservativeShowcaseWebGl();
}

void import("./features/premium/babylon/physicsWorld").then((m) => {
  if (!shouldPrefetchHavokOnShowcaseLoad()) {
    return;
  }
  m.prefetchHavokWasm();
  return m.preloadHavokPhysics();
});

/** WebGL/Babylon — StrictMode 이중 마운트 시 context lost 방지 */
createRoot(document.getElementById("root")!).render(
  <ShowcaseRootErrorBoundary>
    <MboxPageShell wide>
      <ShowcaseDashboard />
    </MboxPageShell>
  </ShowcaseRootErrorBoundary>
);