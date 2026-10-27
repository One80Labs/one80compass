import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Catches render failures so a single page bug does not blank the whole portal. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Portal render failed", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="gate">
          <h1>One80Compass</h1>
          <p>Something went wrong loading this page.</p>
          <button type="button" onClick={() => window.location.assign("/")}>
            Return home
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
