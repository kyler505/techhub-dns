import { describe, expect, it } from "vitest";

import { OrderStatus } from "../types/order";
import {
  buildOrderDetailNavigationState,
  getOrdersPageTransitionKey,
  isOrderDetailRoute,
  resolveOrderDetailNavigationState,
} from "./orderTransitions";

describe("orderTransitions", () => {
  it("uses a stable route key for order detail routes", () => {
    expect(getOrdersPageTransitionKey("/orders")).toBe("/orders");
    expect(getOrdersPageTransitionKey("/orders/550e8400-e29b-41d4-a716-446655440000")).toBe("/orders/:orderId");
    expect(getOrdersPageTransitionKey("/shipping")).toBe("/shipping");
  });

  it("detects order detail routes", () => {
    expect(isOrderDetailRoute("/orders/550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isOrderDetailRoute("/orders")).toBe(false);
  });

  it("does not animate when the detail page is opened without transition state", () => {
    expect(resolveOrderDetailNavigationState(undefined)).toEqual({
      animateFromList: false,
      originPath: "/orders",
      sidebarSearch: "",
      sidebarStatus: null,
      transitionSource: "none",
    });
  });

  it("preserves list-origin transitions and filters", () => {
    const state = buildOrderDetailNavigationState({
      source: "list",
      fromPath: "/orders",
      sidebarStatus: [OrderStatus.PICKED, OrderStatus.QA],
      sidebarSearch: "alpha",
    });

    expect(resolveOrderDetailNavigationState(state)).toEqual({
      animateFromList: true,
      originPath: "/orders",
      sidebarSearch: "alpha",
      sidebarStatus: [OrderStatus.PICKED, OrderStatus.QA],
      transitionSource: "list",
    });
  });

  it("suppresses detail-pane entrance animation during sidebar-to-sidebar navigation", () => {
    const state = buildOrderDetailNavigationState({
      source: "sidebar",
      fromPath: "/orders",
      sidebarStatus: OrderStatus.SHIPPING,
      sidebarSearch: "beta",
    });

    expect(resolveOrderDetailNavigationState(state)).toEqual({
      animateFromList: false,
      originPath: "/orders",
      sidebarSearch: "beta",
      sidebarStatus: OrderStatus.SHIPPING,
      transitionSource: "sidebar",
    });
  });

  it("falls back to /orders when the provided origin path is another detail route", () => {
    const state = buildOrderDetailNavigationState({
      source: "sidebar",
      fromPath: "/orders/550e8400-e29b-41d4-a716-446655440000",
      sidebarStatus: null,
      sidebarSearch: "",
    });

    expect(resolveOrderDetailNavigationState(state)).toEqual({
      animateFromList: false,
      originPath: "/orders",
      sidebarSearch: "",
      sidebarStatus: null,
      transitionSource: "sidebar",
    });
  });
});
