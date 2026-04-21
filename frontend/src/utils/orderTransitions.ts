import { OrderStatus } from "../types/order";

type StatusFilter = OrderStatus | OrderStatus[] | null;
type NavigationSource = "list" | "sidebar";
type TransitionSource = NavigationSource | "none";

type OrderDetailNavigationStateInput = {
  source: NavigationSource;
  fromPath: string;
  sidebarStatus: StatusFilter;
  sidebarSearch: string;
};

type RawOrderDetailNavigationState = {
  transitionSource?: unknown;
  fromPath?: unknown;
  sidebarStatus?: unknown;
  sidebarSearch?: unknown;
};

export type OrderDetailNavigationState = {
  transitionSource: NavigationSource;
  fromPath: string;
  sidebarStatus: StatusFilter;
  sidebarSearch: string;
};

export type ResolvedOrderDetailNavigationState = {
  animateFromList: boolean;
  originPath: string;
  sidebarStatus: StatusFilter;
  sidebarSearch: string;
  transitionSource: TransitionSource;
};

const ORDER_DETAIL_ROUTE_PATTERN = /^\/orders\/[^/]+$/;
const ORDER_STATUS_VALUES: readonly OrderStatus[] = [
  OrderStatus.PICKED,
  OrderStatus.QA,
  OrderStatus.PRE_DELIVERY,
  OrderStatus.IN_DELIVERY,
  OrderStatus.SHIPPING,
  OrderStatus.DELIVERED,
  OrderStatus.ISSUE,
];

export function isOrderDetailRoute(pathname: string): boolean {
  return ORDER_DETAIL_ROUTE_PATTERN.test(pathname);
}

export function getOrdersPageTransitionKey(pathname: string): string {
  if (pathname === "/orders") return "/orders";
  if (isOrderDetailRoute(pathname)) return "/orders/:orderId";
  return pathname;
}

export function buildOrderDetailNavigationState(
  input: OrderDetailNavigationStateInput,
): OrderDetailNavigationState {
  return {
    transitionSource: input.source,
    fromPath: input.fromPath,
    sidebarStatus: input.sidebarStatus,
    sidebarSearch: input.sidebarSearch,
  };
}

export function resolveOrderDetailNavigationState(
  state: unknown,
): ResolvedOrderDetailNavigationState {
  const rawState = (state as RawOrderDetailNavigationState | null) ?? null;
  const transitionSource = parseTransitionSource(rawState?.transitionSource);
  const rawOriginPath = typeof rawState?.fromPath === "string" ? rawState.fromPath : "/orders";
  const originPath = isOrderDetailRoute(rawOriginPath) ? "/orders" : rawOriginPath;

  return {
    animateFromList: transitionSource === "list",
    originPath,
    sidebarStatus: parseSidebarStatus(rawState?.sidebarStatus),
    sidebarSearch: typeof rawState?.sidebarSearch === "string" ? rawState.sidebarSearch : "",
    transitionSource,
  };
}

function parseTransitionSource(value: unknown): TransitionSource {
  if (value === "list" || value === "sidebar") return value;
  return "none";
}

function parseSidebarStatus(value: unknown): StatusFilter {
  if (value === null) return null;
  if (Array.isArray(value) && value.every(isOrderStatus)) return value;
  if (isOrderStatus(value)) return value;
  return null;
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && ORDER_STATUS_VALUES.includes(value as OrderStatus);
}
