import React, { Component, ErrorInfo, ReactNode } from "react";
import { TriangleAlert as AlertTriangle, RefreshCw, Hop as Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    this.setState({ error, errorInfo });

    // Log to analytics if available
    if (typeof window !== "undefined" && (window as any).posthog) {
      (window as any).posthog.capture("error_boundary_triggered", {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-2xl w-full space-y-6">
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
              </div>
              <h1 className="text-3xl font-bold text-foreground">Something went wrong</h1>
              <p className="text-muted-foreground text-lg max-w-md mx-auto">
                We encountered an unexpected error. Don't worry, our team has been notified.
              </p>
            </div>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-2">
                <div className="text-sm font-mono text-red-500 break-all">
                  {this.state.error.message}
                </div>
                {this.state.error.stack && (
                  <details className="text-xs font-mono text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">
                      Stack trace
                    </summary>
                    <pre className="mt-2 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <Button
                onClick={this.handleReset}
                variant="default"
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try again
              </Button>
              <Button
                onClick={() => (window.location.href = "/")}
                variant="outline"
                className="gap-2"
              >
                <Home className="w-4 h-4" />
                Go home
              </Button>
            </div>

            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                If this problem persists, please{" "}
                <a
                  href="/contact"
                  className="text-foreground underline hover:no-underline"
                >
                  contact support
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}


export default ErrorBoundary