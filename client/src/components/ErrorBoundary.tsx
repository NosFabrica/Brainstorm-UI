import { Component, type ErrorInfo, type ReactNode } from "react";
import { SorryPage } from "@/components/sorry/SorryPage";

/**
 * A render crash used to white-screen the app. This is the sorry page's third
 * scope — "Something went wrong" — with a reload as the way out; moving to
 * another page (`resetKey` = the location) clears it, since the crash was
 * that page's. It catches render errors only: a failed request is the
 * server-status store's business (lib/serverStatus), not this.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError(): { crashed: boolean } {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[app] a page crashed while rendering", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }): void {
    if (this.state.crashed && prev.resetKey !== this.props.resetKey) this.setState({ crashed: false });
  }

  render(): ReactNode {
    if (this.state.crashed) {
      return <SorryPage scope="app" variant="page" onRetry={() => window.location.reload()} />;
    }
    return this.props.children;
  }
}
