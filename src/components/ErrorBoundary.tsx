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
        <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="font-semibold text-[var(--color-warn)]">Something went wrong</p>
          <p className="max-w-md text-sm text-[var(--color-ink-soft)]">{this.state.error}</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              location.reload();
            }}
            className="rounded-lg bg-[var(--color-canopy)] px-4 py-2 text-sm font-medium text-white"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
