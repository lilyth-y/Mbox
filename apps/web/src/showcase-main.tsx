import { createRoot } from "react-dom/client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { MboxPageShell } from "./components/MboxPageShell";
import { ensureLocalGpuSearchParams } from "./shared/lib/gpuSession";
import { ShowcaseDashboard } from "./features/showcase/ShowcaseDashboard";
import "./styles/index.css";

ensureLocalGpuSearchParams();

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

/** Showcase is rotation-only — skip Havok WASM on page load. */
createRoot(document.getElementById("root")!).render(
  <ShowcaseRootErrorBoundary>
    <MboxPageShell wide>
      <ShowcaseDashboard />
    </MboxPageShell>
  </ShowcaseRootErrorBoundary>
);
