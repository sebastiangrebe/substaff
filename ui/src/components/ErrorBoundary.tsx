import { Component, type ErrorInfo, type ReactNode } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Sentry } from "@/lib/sentry";

/* ------------------------------------------------------------------ */
/*  Route-level error element (used as errorElement in router config)  */
/* ------------------------------------------------------------------ */

export function RouteErrorBoundary() {
  const error = useRouteError();
  const [showDetails, setShowDetails] = useState(false);

  let status = 500;
  let title = "Something went wrong";
  let message = "An unexpected error occurred. The team has been notified.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    if (status === 404) {
      title = "Page not found";
      message = "The page you're looking for doesn't exist or has been moved.";
    } else if (status === 403) {
      title = "Access denied";
      message = "You don't have permission to view this page.";
    } else {
      message = error.statusText || message;
    }
  } else if (error instanceof Error) {
    message = error.message;
    stack = error.stack;
  }

  return (
    <div className="flex h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>

        {/* Status code */}
        <p className="mb-1 text-xs font-mono text-muted-foreground tracking-wider">
          ERROR {status}
        </p>

        {/* Title */}
        <h1 className="text-xl font-bold text-foreground">{title}</h1>

        {/* Message */}
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
          {message}
        </p>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (window.location.href = "/")}
          >
            <Home className="mr-1.5 h-3.5 w-3.5" />
            Go home
          </Button>
          <Button
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Reload page
          </Button>
        </div>

        {/* Expandable stack trace (dev only) */}
        {stack && (
          <div className="mt-8">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showDetails ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {showDetails ? "Hide" : "Show"} details
            </button>
            {showDetails && (
              <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-muted/50 border border-border p-3 text-left font-mono text-xs text-muted-foreground leading-relaxed">
                {stack}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Class-based error boundary (wraps children, catches render errors) */
/* ------------------------------------------------------------------ */

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info.componentStack);
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <FallbackUI error={this.state.error} onReset={() => this.setState({ hasError: false, error: null })} />;
    }
    return this.props.children;
  }
}

function FallbackUI({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="flex h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>

        <p className="mb-1 text-xs font-mono text-muted-foreground tracking-wider">
          RENDER ERROR
        </p>

        <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>

        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
          {error?.message || "An unexpected error occurred while rendering."}
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => (window.location.href = "/")}
          >
            <Home className="mr-1.5 h-3.5 w-3.5" />
            Go home
          </Button>
          <Button
            size="sm"
            onClick={onReset}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Try again
          </Button>
        </div>

        {error?.stack && (
          <div className="mt-8">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showDetails ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {showDetails ? "Hide" : "Show"} details
            </button>
            {showDetails && (
              <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-muted/50 border border-border p-3 text-left font-mono text-xs text-muted-foreground leading-relaxed">
                {error.stack}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
