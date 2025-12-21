import { useEffect, useMemo, useState } from "react";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";
import { formatDeliveryLocation } from "../utils/location";

type DockStatus = "WORK_AREA" | "DOCK";

type ShippingLocalState = {
  dockStatus: DockStatus;
  shippedToFedexAt?: string; // ISO timestamp
};

const storageKey = (orderId: string) => `order-shipping-v1:${orderId}`;

function readLocal(orderId: string): ShippingLocalState {
  const raw = localStorage.getItem(storageKey(orderId));
  if (!raw) return { dockStatus: "WORK_AREA" };
  try {
    const parsed = JSON.parse(raw) as ShippingLocalState;
    return {
      dockStatus: parsed.dockStatus === "DOCK" ? "DOCK" : "WORK_AREA",
      shippedToFedexAt: parsed.shippedToFedexAt,
    };
  } catch {
    return { dockStatus: "WORK_AREA" };
  }
}

function writeLocal(orderId: string, state: ShippingLocalState) {
  localStorage.setItem(storageKey(orderId), JSON.stringify(state));
}

export default function Shipping() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [search, setSearch] = useState("");

  // This is only for forcing UI refresh when localStorage changes
  const [localTick, setLocalTick] = useState(0);

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const data = await ordersApi.getOrders({
        status: OrderStatus.SHIPPING,
        search: search.trim() ? search.trim() : undefined,
      });
      setOrders(data);
    } catch (error) {
      console.error("Failed to load orders:", error);
      alert("Failed to load orders");
    } finally {
      setLoadingOrders(false);
    }
  };

  const localMap = useMemo(() => {
    const map = new Map<string, ShippingLocalState>();
    for (const o of orders) map.set(o.id, readLocal(o.id));
    return map;
  }, [orders, localTick]);

  const setDockStatus = (orderId: string, dockStatus: DockStatus) => {
    const prev = readLocal(orderId);
    writeLocal(orderId, { ...prev, dockStatus });
    setLocalTick((t) => t + 1);
  };

  const markShippedToFedex = (orderId: string) => {
    const prev = readLocal(orderId);
    if (prev.shippedToFedexAt) {
      const ok = confirm("This order is already marked as shipped to FedEx. Mark again (overwrite timestamp)?");
      if (!ok) return;
    }
    writeLocal(orderId, { ...prev, shippedToFedexAt: new Date().toISOString() });
    setLocalTick((t) => t + 1);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Shipping Operations</h2>
        <p className="text-sm text-muted-foreground">
          Manage orders being prepared for shipping and carrier pickup
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Orders</h2>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <label className="flex flex-col text-sm font-medium text-gray-700">
              Search
              <input
                className="mt-1 rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#800000]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Order ID / recipient / location..."
              />
            </label>
          </div>
        </div>

        {loadingOrders ? (
          <div className="p-4">Loading...</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-4 py-2 text-left">Order</th>
                  <th className="border border-gray-200 px-4 py-2 text-left">Location / City</th>
                  <th className="border border-gray-200 px-4 py-2 text-left">Dock Status</th>
                  <th className="border border-gray-200 px-4 py-2 text-left">FedEx</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const local = localMap.get(o.id) ?? { dockStatus: "WORK_AREA" };
                  const isDock = local.dockStatus === "DOCK";
                  const shippedAt = local.shippedToFedexAt ? new Date(local.shippedToFedexAt) : null;

                  return (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="border border-gray-200 px-4 py-2 font-medium text-gray-900">
                        {o.inflow_order_id || o.id}
                      </td>

                      <td className="border border-gray-200 px-4 py-2 text-gray-800">
                        {formatDeliveryLocation(o)}
                      </td>

                      <td className="border border-gray-200 px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                              isDock ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {isDock ? "At Dock for shipping" : "Still in work area"}
                          </span>

                          <button
                            type="button"
                            onClick={() => setDockStatus(o.id, isDock ? "WORK_AREA" : "DOCK")}
                            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Toggle
                          </button>
                        </div>
                      </td>

                      <td className="border border-gray-200 px-4 py-2">
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => markShippedToFedex(o.id)}
                            className="w-fit rounded-md bg-[#800000] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#660000]"
                          >
                            Shipped to FedEx
                          </button>

                          {shippedAt ? (
                            <span className="text-xs text-gray-600">
                              Marked: {shippedAt.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Not marked</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!orders.length && (
                  <tr>
                    <td className="border border-gray-200 px-4 py-6 text-center text-gray-600" colSpan={4}>
                      No orders found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
