import { beforeEach, describe, expect, it, vi } from "vitest";

import apiClient from "./client";
import { normalizeExpectedUpdatedAt } from "./expectedUpdatedAt";
import { ordersApi } from "./orders";

vi.mock("./client", () => ({
  default: {
    post: vi.fn(),
  },
}));

describe("ordersApi.generatePicklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the generated_by and expected_updated_at payload to the picklist endpoint", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { id: "order-1" },
    } as never);

    const payload = {
      generated_by: "Taylor Tech",
      expected_updated_at: "2026-04-29T15:53:00",
    };

    await ordersApi.generatePicklist("order-1", payload);

    expect(apiClient.post).toHaveBeenCalledWith(
      "/orders/order-1/picklist",
      normalizeExpectedUpdatedAt(payload),
    );
  });
});
