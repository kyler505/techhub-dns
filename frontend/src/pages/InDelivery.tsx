import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";
import OrderTable from "../components/OrderTable";
import StatusTransition from "../components/StatusTransition";

export default function InDelivery() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [transitioningOrder, setTransitioningOrder] = useState<{
        orderId: string;
        newStatus: OrderStatus;
        requireReason: boolean;
    } | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        loadOrders();
    }, []);

    const loadOrders = async () => {
        setLoading(true);
        try {
            const data = await ordersApi.getOrders({ status: OrderStatus.IN_DELIVERY });
            setOrders(data);
        } catch (error) {
            console.error("Failed to load orders:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = (orderId: string, newStatus: OrderStatus, reason?: string) => {
        const requireReason = newStatus === OrderStatus.ISSUE;
        if (requireReason && reason === undefined) {
            setTransitioningOrder({ orderId, newStatus, requireReason: true });
        } else {
            performStatusChange(orderId, newStatus, reason);
        }
    };

    const performStatusChange = async (
        orderId: string,
        newStatus: OrderStatus,
        reason?: string
    ) => {
        try {
            await ordersApi.updateOrderStatus(orderId, { status: newStatus, reason });
            setTransitioningOrder(null);
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
            <h2 className="text-lg font-semibold">Active Deliveries</h2>
            <OrderTable
                orders={orders}
                onStatusChange={handleStatusChange}
                onViewDetail={handleViewDetail}
            />
        </div>
    );
}
