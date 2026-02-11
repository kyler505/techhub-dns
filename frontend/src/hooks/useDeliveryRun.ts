import { useCallback, useEffect, useState } from "react";
import { deliveryRunsApi, type DeliveryRunDetailResponse } from "../api/deliveryRuns";

export function useDeliveryRun(runId: string | undefined) {
  const [run, setRun] = useState<DeliveryRunDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRun = useCallback(async () => {
    if (!runId) {
      setRun(null);
      setError("Missing delivery run ID");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await deliveryRunsApi.getRun(runId);
      setRun(data);
    } catch {
      setError("Failed to load delivery run details");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void fetchRun();
  }, [fetchRun]);

  return { run, loading, error, refetch: fetchRun };
}
