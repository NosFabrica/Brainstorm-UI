import { Component, type ErrorInfo, type ReactNode } from "react";
import { SorryPage } from "@/components/sorry/SorryPage";

interface State {
  crashed: boolean;
  error?: Error;
}

/**
 * A render crash used to white-screen the app. This is the sorry page's third
 * scope — "Something went wrong" — with a reload as the way out; moving to
 * another page (`resetKey` = the location) clears it, since the crash was
 * that page's. It catches render errors only: a failed request is the
 * server-status store's business (lib/serverStatus), not this.
 *
 * A dev build says what crashed under the sorry page: on a phone there is no
 * console to read it in (the team, 2026-10-28).
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(error: Error): State {
    return { crashed: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[app] a page crashed while rendering", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }): void {
    if (this.state.crashed && prev.resetKey !== this.props.resetKey)
      this.setState({ crashed: false, error: undefined });
  }

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children;
    const { error } = this.state;
    return (
      <>
        <SorryPage scope="app" variant="page" onRetry={() => window.location.reload()} />
        {import.meta.env.DEV && error && (
          // The stack opens with the message where the engine writes one (V8, SpiderMonkey).
          <pre
            className="mx-auto max-w-2xl whitespace-pre-wrap break-words px-4 pb-8 text-[11px] leading-relaxed text-red-700 dark:text-red-300"
            data-testid="crash-details"
          >
            {error.stack?.includes(error.message) ? error.stack : `${String(error)}\n${error.stack ?? ""}`}
          </pre>
        )}
      </>
    );
  }
}
