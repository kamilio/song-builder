import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches unhandled React rendering errors and shows a recovery UI.
 * In production builds, no stack trace is shown. In dev, condensed error info is displayed.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (!import.meta.env.PROD) {
      console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground max-w-md">
          An unexpected error occurred. Refresh the page to continue.
        </p>
        {!import.meta.env.PROD && this.state.error && (
          <pre className="text-xs text-left bg-muted rounded p-4 max-w-xl overflow-auto max-h-48">
            {this.state.error.message}
          </pre>
        )}
        <button
          className="mt-2 px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          onClick={() => window.location.reload()}
        >
          Refresh
        </button>
      </div>
    );
  }
}
