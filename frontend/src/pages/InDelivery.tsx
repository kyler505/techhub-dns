import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";
import OrderTable from "../components/OrderTable";

export default function InDelivery() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
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
            <OrderTable
                orders={orders}
                onViewDetail={handleViewDetail}
            />
        </div>
    );
}
