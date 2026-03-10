export function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const candidate = error as {
      response?: {
        data?: {
          error?: unknown;
          message?: unknown;
          detail?: unknown;
        };
      };
      message?: unknown;
    };

    const responseData = candidate.response?.data;
    const dataError = responseData?.error;

    if (typeof dataError === "string" && dataError.trim()) {
      return dataError;
    }

    if (typeof dataError === "object" && dataError !== null && "message" in dataError) {
      const nestedMessage = (dataError as { message?: unknown }).message;
      if (typeof nestedMessage === "string" && nestedMessage.trim()) {
        return nestedMessage;
      }
    }

    const dataMessage = responseData?.message;
    if (typeof dataMessage === "string" && dataMessage.trim()) {
      return dataMessage;
    }

    const dataDetail = responseData?.detail;
    if (typeof dataDetail === "string" && dataDetail.trim()) {
      return dataDetail;
    }

    if (typeof candidate.message === "string" && candidate.message.trim()) {
      return candidate.message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
