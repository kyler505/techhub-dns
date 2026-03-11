import { QueryErrorResetBoundary } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { reportFrontendError } from "../../lib/errorReporting";
import { ErrorBoundary } from "./ErrorBoundary";
import { ErrorFallback } from "./ErrorFallback";

interface BoundaryProps {
  children: ReactNode;
}

export function AppShellErrorBoundary({ children }: BoundaryProps) {
  const location = useLocation();

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onError={(error, errorInfo) => {
            void reportFrontendError(error, errorInfo, {
              boundary: "app-shell",
              pathname: location.pathname,
            });
          }}
          onReset={reset}
          resetKeys={[location.pathname]}
          fallback={({ error, reset: resetBoundary }) => (
            <ErrorFallback
              error={error}
              fullScreen
              title="The app hit an unexpected error"
              message="Try reloading the app. If the problem keeps happening, navigate to another page or refresh the browser session."
              onRetry={resetBoundary}
              onReload={() => window.location.reload()}
            />
          )}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

export function RouteContentErrorBoundary({ children }: BoundaryProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onError={(error, errorInfo) => {
            void reportFrontendError(error, errorInfo, {
              boundary: "route-content",
              pathname: location.pathname,
            });
          }}
          onReset={reset}
          resetKeys={[location.pathname]}
          fallback={({ error, reset: resetBoundary }) => (
            <ErrorFallback
              error={error}
              title="This page could not finish rendering"
              message="Try the page again. If the problem persists, head back to the dashboard and retry the workflow from there."
              onRetry={resetBoundary}
              onNavigateHome={() => navigate("/")}
            />
          )}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
