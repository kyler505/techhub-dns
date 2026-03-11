import { useQuery } from "@tanstack/react-query";

import { getDeliveryRunDetailQueryOptions } from "../queries/deliveryRuns";

export function useDeliveryRun(runId: string | undefined) {
  const query = useQuery({
    ...getDeliveryRunDetailQueryOptions(runId ?? ""),
    enabled: Boolean(runId),
  });

  return {
    run: query.data ?? null,
    loading: query.isPending,
    error: !runId ? "Missing delivery run ID" : query.isError ? "Failed to load delivery run details" : null,
    refetch: async () => {
      if (!runId) {
        return;
      }

      await query.refetch();
    },
  };
}
