import { queryOptions } from "@tanstack/react-query";

import { deliveryRunsApi, type DeliveryRunDetailResponse, type DeliveryRunResponse } from "../api/deliveryRuns";

export type ActiveDeliveryRun = DeliveryRunResponse & { order_ids: string[] };

export const deliveryRunsQueryKeys = {
  all: ["delivery-runs"] as const,
  active: () => [...deliveryRunsQueryKeys.all, "active"] as const,
  details: () => [...deliveryRunsQueryKeys.all, "detail"] as const,
  detail: (runId: string) => [...deliveryRunsQueryKeys.details(), runId] as const,
};

export const getActiveDeliveryRunsQueryOptions = () =>
  queryOptions({
    queryKey: deliveryRunsQueryKeys.active(),
    queryFn: (): Promise<ActiveDeliveryRun[]> => deliveryRunsApi.getActiveRuns(),
  });

export const getDeliveryRunDetailQueryOptions = (runId: string) =>
  queryOptions({
    queryKey: deliveryRunsQueryKeys.detail(runId),
    queryFn: (): Promise<DeliveryRunDetailResponse> => deliveryRunsApi.getRun(runId),
  });
