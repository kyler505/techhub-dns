import type { ErrorInfo } from "react";

import { apiClient } from "../api/client";

interface FrontendErrorReport {
  type: "react_error_boundary";
  name: string;
  message: string;
  stack?: string;
  component_stack?: string;
  context: Record<string, unknown>;
  url: string;
  user_agent?: string;
}

const FRONTEND_ERROR_PATH = (() => {
  const baseUrl = apiClient.defaults.baseURL;
  if (typeof baseUrl !== "string" || baseUrl.length === 0) {
    return "/api/observability/frontend-error";
  }

  return `${baseUrl.replace(/\/$/, "")}/observability/frontend-error`;
})();

const toReportBody = (
  error: Error,
  errorInfo: ErrorInfo | null,
  context: Record<string, unknown>,
): FrontendErrorReport => ({
  type: "react_error_boundary",
  name: error.name || "Error",
  message: error.message || "Unknown error",
  stack: error.stack ?? undefined,
  component_stack: errorInfo?.componentStack ?? undefined,
  context,
  url: window.location.href,
  user_agent: window.navigator.userAgent,
});

const postWithFetch = async (body: FrontendErrorReport): Promise<void> => {
  await fetch(FRONTEND_ERROR_PATH, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    keepalive: true,
  });
};

export async function reportFrontendError(
  error: Error,
  errorInfo: ErrorInfo | null,
  context: Record<string, unknown>,
): Promise<void> {
  const body = toReportBody(error, errorInfo, context);

  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
      const delivered = navigator.sendBeacon(FRONTEND_ERROR_PATH, blob);
      if (delivered) {
        return;
      }
    }

    await postWithFetch(body);
  } catch (reportingError) {
    console.error("Failed to report frontend error", reportingError);
  }
}
