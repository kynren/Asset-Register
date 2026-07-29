import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="row" style={{ minHeight: "100vh", justifyContent: "center", alignItems: "center", padding: 24 }}>
          <div className="card" style={{ maxWidth: 480 }}>
            <h3 className="mt-0">Something went wrong</h3>
            <p className="muted">
              This page hit an unexpected error. Try reloading — if it keeps happening, please report what you were
              doing when it occurred.
            </p>
            <p style={{ fontFamily: "monospace", fontSize: 12, color: "var(--color-danger)", wordBreak: "break-word" }}>
              {this.state.error.message}
            </p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
