import { describe, expect, it } from "vitest";
import { getOrderProductTableView, getPartialOrderInfo } from "./orderPartial";

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

describe("getOrderProductTableView", () => {
  it("shows remaining items on the parent leg", () => {
    const view = getOrderProductTableView({
      inflow_data: {
        lines: [{ productId: "A", product: { name: "Widget" }, quantity: { standardQuantity: 5 } }],
        pickLines: [{ productId: "A", product: { name: "Widget" }, quantity: { standardQuantity: 2 } }],
      },
      has_remainder: true,
    } as any);

    expect(view.title).toBe("Items left to pick");
    expect(view.rows).toEqual([
      {
        productId: "A",
        productName: "Widget",
        quantity: 3,
        serials: [],
      },
    ]);
  });

  it("shows only child leg items for a partial child leg", () => {
    const view = getOrderProductTableView({
      inflow_data: {
        lines: [
          { productId: "B", product: { name: "Bolt" }, quantity: { standardQuantity: 1, serialNumbers: ["S1"] } },
          { productId: "C", description: "Nut", quantity: 2 },
        ],
        pickLines: [{ productId: "B", product: { name: "Bolt" }, quantity: { standardQuantity: 1 } }],
      },
      parent_order_id: "parent-uuid",
    } as any);

    expect(view.title).toBe("Child leg items");
    expect(view.rows).toEqual([
      {
        productId: "B",
        productName: "Bolt",
        quantity: 1,
        serials: [],
      },
    ]);
  });
});
