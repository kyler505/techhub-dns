import { describe, expect, it, vi, beforeEach } from "vitest";

const { patchMock, normalizeExpectedUpdatedAtMock } = vi.hoisted(() => ({
  patchMock: vi.fn(),
  normalizeExpectedUpdatedAtMock: vi.fn((value: unknown) => value),
}));

vi.mock("./client", () => ({
  default: {
    patch: patchMock,
  },
}));

vi.mock("./expectedUpdatedAt", () => ({
  normalizeExpectedUpdatedAt: normalizeExpectedUpdatedAtMock,
}));

import { ordersApi } from "./orders";

describe("ordersApi.rollbackOrderStatus", () => {
  beforeEach(() => {
    patchMock.mockReset();
  });

  it("calls the rollback endpoint with normalized payload and changed_by query param", async () => {
    patchMock.mockResolvedValue({ data: { id: "order-1" } });

    const result = await ordersApi.rollbackOrderStatus(
      "order-1",
      {
        status: "qa",
        reason: "re-open for review",
        expected_updated_at: "2026-04-29T20:00:00Z",
      },
      "ops@example.com",
    );

    expect(patchMock).toHaveBeenCalledWith(
      "/orders/order-1/rollback",
      {
        status: "qa",
        reason: "re-open for review",
        expected_updated_at: "2026-04-29T20:00:00Z",
      },
      {
        params: {
          changed_by: "ops@example.com",
        },
      },
    );
    expect(result).toEqual({ id: "order-1" });
  });

  it("omits changed_by params when not provided", async () => {
    patchMock.mockResolvedValue({ data: { id: "order-2" } });

    await ordersApi.rollbackOrderStatus("order-2", {
      status: "picked",
    });

    expect(patchMock).toHaveBeenCalledWith(
      "/orders/order-2/rollback",
      {
        status: "picked",
      },
      {
        params: undefined,
      },
    );
  });
});
