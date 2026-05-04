import { describe, expect, it } from "vitest";
import { getPartialOrderInfo } from "./orderPartial";

describe("getPartialOrderInfo", () => {
  it("marks a child partial leg as a partial leg even when it is fully picked itself", () => {
    const info = getPartialOrderInfo({
      inflow_data: {
        lines: [{ productId: "1", quantity: { standardQuantity: 2 } }],
        pickLines: [{ productId: "1", quantity: { standardQuantity: 2 } }],
      },
      parent_order_id: "parent-uuid",
    } as any);

    expect(info.isPartialLeg).toBe(true);
    expect(info.isPartial).toBe(false);
    expect(info.hasRemainder).toBe(false);
  });

  it("marks a parent order with missing items as having a remainder", () => {
    const info = getPartialOrderInfo({
      inflow_data: {
        lines: [{ productId: "1", quantity: { standardQuantity: 4 } }],
        pickLines: [{ productId: "1", quantity: { standardQuantity: 2 } }],
      },
      has_remainder: "Y",
      remainder_order_id: "remainder-uuid",
    } as any);

    expect(info.isPartial).toBe(true);
    expect(info.hasRemainder).toBe(true);
    expect(info.isPartialLeg).toBe(false);
    expect(info.totalOrdered).toBe(4);
    expect(info.totalPicked).toBe(2);
  });
});
