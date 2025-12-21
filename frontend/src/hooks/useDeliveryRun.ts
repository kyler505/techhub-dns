import { useState, useEffect } from "react";
import { deliveryRunsApi, DeliveryRunDetailResponse } from "../api/deliveryRuns";

export function useDeliveryRun(runId: string | undefined) {
  const [run, setRun] = useState<DeliveryRunDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;

    const fetchRun = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await deliveryRunsApi.getRun(runId);
        setRun(data);
      } catch (err) {
        console.error("Failed to fetch delivery run:", err);
        setError("Failed to load delivery run details");
      } finally {
        setLoading(false);
      }
    };

    fetchRun();
  }, [runId]);

  return { run, loading, error, refetch: () => runId && useDeliveryRun(runId) };
}
