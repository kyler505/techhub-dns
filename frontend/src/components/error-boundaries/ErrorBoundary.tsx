import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryFallbackProps {
  error: Error;
  reset: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (props: ErrorBoundaryFallbackProps) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
  resetKeys?: unknown[];
}

interface ErrorBoundaryState {
  error: Error | null;
}

const haveResetKeysChanged = (previous: unknown[] = [], next: unknown[] = []): boolean => {
  if (previous.length !== next.length) {
    return true;
  }

  return previous.some((key, index) => !Object.is(key, next[index]));
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Unhandled React error boundary crash", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  public componentDidUpdate(previousProps: ErrorBoundaryProps): void {
    const { error } = this.state;
    if (!error) {
      return;
    }

    if (haveResetKeysChanged(previousProps.resetKeys, this.props.resetKeys)) {
      this.resetBoundary();
    }
  }

  private resetBoundary = (): void => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  public render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return this.props.fallback({
        error,
        reset: this.resetBoundary,
      });
    }

    return this.props.children;
  }
}

export type { ErrorBoundaryFallbackProps };
