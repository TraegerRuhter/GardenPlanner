import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 p-6 text-center">
          <span className="text-2xl font-bold tracking-wide text-[var(--color-canopy)]">PLOT</span>
          <div className="rounded-xl border border-[var(--color-warn)]/30 bg-[var(--color-warn)]/5 p-5">
            <p className="font-semibold text-[var(--color-warn)]">Something went wrong</p>
            <p className="mt-2 max-w-md text-sm text-[var(--color-ink-soft)]">{this.state.error}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
              }}
              className="rounded-lg bg-[var(--color-paper-deep)] px-4 py-2 text-sm font-medium hover:opacity-80"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null });
                location.reload();
              }}
              className="rounded-lg bg-[var(--color-canopy)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
