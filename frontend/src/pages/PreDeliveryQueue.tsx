import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";
import { deliveryRunsApi } from "../api/deliveryRuns";
import { Button } from "../components/ui/button";
import { formatDeliveryLocation } from "../utils/location";

export default function PreDeliveryQueue() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await ordersApi.getOrders({ status: OrderStatus.PRE_DELIVERY });
      setOrders(data);
    } catch (error) {
      console.error("Failed to load orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrder = (orderId: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const handleBulkStartDelivery = async () => {
    if (selectedOrders.size === 0) {
      alert("Please select at least one order");
      return;
    }

    // Prompt for delivery details
    const runner = prompt("Enter deliverer name:");
    if (!runner?.trim()) return;

    const vehicle = prompt("Enter vehicle (Truck/Golf Cart/On Foot):");
    if (!vehicle?.trim()) return;

    const validVehicles = ["Truck", "Golf Cart", "On Foot"];
    if (!validVehicles.includes(vehicle)) {
      alert("Invalid vehicle. Please choose: Truck, Golf Cart, or On Foot");
      return;
    }

    try {
      await deliveryRunsApi.createRun({
        runner: runner.trim(),
        order_ids: Array.from(selectedOrders),
        vehicle: vehicle as "Truck" | "Golf Cart" | "On Foot",
      });
      setSelectedOrders(new Set());
      loadOrders();
      alert("Delivery started successfully!");
    } catch (error) {
      console.error("Failed to start delivery:", error);
      alert("Failed to start delivery");
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus, reason?: string) => {
    const requireReason = newStatus === OrderStatus.ISSUE;
    if (requireReason && reason === undefined) {
      const userReason = prompt("Please provide a reason for marking this order as an issue:");
      if (!userReason) return; // User cancelled
      reason = userReason;
    }
    await performStatusChange(orderId, newStatus, reason);
  };

  const performStatusChange = async (
    orderId: string,
    newStatus: OrderStatus,
    reason?: string
  ) => {
    try {
      await ordersApi.updateOrderStatus(orderId, { status: newStatus, reason });
      loadOrders();
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update order status");
    }
  };

  const handleViewDetail = (orderId: string) => {
    navigate(`/orders/${orderId}`);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8">
      <div className="text-sm text-muted-foreground">Loading...</div>
    </div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pre-Delivery Queue</h2>
          <p className="text-sm text-muted-foreground">
            {orders.length} order{orders.length !== 1 ? 's' : ''} ready for delivery
          </p>
        </div>
        <Button
          onClick={handleBulkStartDelivery}
          disabled={selectedOrders.size === 0}
          className="bg-orange-500 hover:bg-orange-600"
        >
          Start Delivery ({selectedOrders.size} selected)
        </Button>
      </div>
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="h-12 px-4 text-left align-middle">
                <input
                  type="checkbox"
                  checked={selectedOrders.size === orders.length && orders.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedOrders(new Set(orders.map((o) => o.id)));
                    } else {
                      setSelectedOrders(new Set());
                    }
                  }}
                />
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium">Order ID</th>
              <th className="h-12 px-4 text-left align-middle font-medium">Recipient</th>
              <th className="h-12 px-4 text-left align-middle font-medium">Location</th>
              <th className="h-12 px-4 text-left align-middle font-medium">Deliverer</th>
              <th className="h-12 px-4 text-left align-middle font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b hover:bg-muted/50">
                <td className="p-4 align-middle">
                  <input
                    type="checkbox"
                    checked={selectedOrders.has(order.id)}
                    onChange={() => handleSelectOrder(order.id)}
                  />
                </td>
                <td className="p-4 align-middle">
                  <Button
                    variant="link"
                    onClick={() => handleViewDetail(order.id)}
                    className="p-0 h-auto font-normal"
                  >
                    {order.inflow_order_id}
                  </Button>
                </td>
                <td className="p-4 align-middle">{order.recipient_name || "N/A"}</td>
                <td className="p-4 align-middle">{formatDeliveryLocation(order)}</td>
                <td className="p-4 align-middle">{order.assigned_deliverer || "Unassigned"}</td>
                <td className="p-4 align-middle">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleStatusChange(order.id, OrderStatus.ISSUE, "")}
                  >
                    Flag Issue
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* StatusTransition will be handled by parent DeliveryDashboard */}
    </div>
  );
}
