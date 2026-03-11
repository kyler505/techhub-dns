import { AlertTriangle } from "lucide-react";

import { Button } from "../ui/button";

interface ErrorFallbackProps {
  title: string;
  message: string;
  error?: Error;
  onRetry: () => void;
  onReload?: () => void;
  onNavigateHome?: () => void;
  fullScreen?: boolean;
}

export function ErrorFallback({
  title,
  message,
  error,
  onRetry,
  onReload,
  onNavigateHome,
  fullScreen = false,
}: ErrorFallbackProps) {
  return (
    <div className={fullScreen ? "min-h-screen bg-background flex items-center justify-center px-6" : "rounded-xl border border-border bg-card px-6 py-10 shadow-sm"}>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
        </div>
        {import.meta.env.DEV && error?.message ? (
          <pre className="w-full overflow-x-auto rounded-lg border border-border bg-muted/60 px-4 py-3 text-left text-xs text-muted-foreground">
            {error.message}
          </pre>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={onRetry}>Try again</Button>
          {onNavigateHome ? (
            <Button variant="outline" onClick={onNavigateHome}>
              Go to dashboard
            </Button>
          ) : null}
          {onReload ? (
            <Button variant="ghost" onClick={onReload}>
              Reload app
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
