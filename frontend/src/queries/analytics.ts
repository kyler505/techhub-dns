import { queryOptions } from "@tanstack/react-query";

import analyticsApi from "../api/analytics";
import { OrderStatus } from "../types/order";
import { getOrdersListQueryOptions } from "./orders";

export const analyticsQueryKeys = {
  all: ["analytics"] as const,
  statusCounts: () => [...analyticsQueryKeys.all, "order-status-counts"] as const,
  deliveryPerformance: () => [...analyticsQueryKeys.all, "delivery-performance"] as const,
  workflowDailyTrends: (days: 7 | 30) => [...analyticsQueryKeys.all, "workflow-daily-trends", days] as const,
  fulfilledTotals: (period: "month" | "year") => [...analyticsQueryKeys.all, "fulfilled-totals", period] as const,
};

export const getOrderStatusCountsQueryOptions = () =>
  queryOptions({
    queryKey: analyticsQueryKeys.statusCounts(),
    queryFn: () => analyticsApi.getOrderStatusCounts(),
  });

export const getDeliveryPerformanceQueryOptions = () =>
  queryOptions({
    queryKey: analyticsQueryKeys.deliveryPerformance(),
    queryFn: () => analyticsApi.getDeliveryPerformance(),
  });

export const getWorkflowDailyTrendsQueryOptions = (days: 7 | 30) =>
  queryOptions({
    queryKey: analyticsQueryKeys.workflowDailyTrends(days),
    queryFn: () => analyticsApi.getWorkflowDailyTrends(days),
  });

export const getMonthlyFulfilledTotalsQueryOptions = () =>
  queryOptions({
    queryKey: analyticsQueryKeys.fulfilledTotals("month"),
    queryFn: () => analyticsApi.getFulfilledTotals({ period: "month", months: 12 }),
  });

export const getYearlyFulfilledTotalsQueryOptions = () =>
  queryOptions({
    queryKey: analyticsQueryKeys.fulfilledTotals("year"),
    queryFn: () => analyticsApi.getFulfilledTotals({ period: "year", years: 5 }),
  });

export const getDeliveredOrdersQueryOptions = () =>
  getOrdersListQueryOptions({
    status: OrderStatus.DELIVERED,
    search: "",
  });
