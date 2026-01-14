import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { OrderDetail, OrderStatus, AuditLog, TeamsNotification } from "../types/order";
import { ordersApi } from "../api/orders";
import OrderDetailComponent from "../components/OrderDetail";
import StatusTransition from "../components/StatusTransition";

export default function OrderDetailPage() {
    const { orderId } = useParams<{ orderId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [notifications, setNotifications] = useState<TeamsNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [transitioningStatus, setTransitioningStatus] = useState<{
        newStatus: OrderStatus;
        requireReason: boolean;
    } | null>(null);

    useEffect(() => {
        if (orderId) {
            loadOrder();
        }
    }, [orderId]);

    const loadOrder = async () => {
        if (!orderId) return;
        setLoading(true);
        try {
            const [orderData, auditData] = await Promise.all([
                ordersApi.getOrder(orderId),
                ordersApi.getOrderAudit(orderId),
            ]);
            setOrder(orderData);
            setAuditLogs(auditData);
            // Notifications come from order detail response
            setNotifications((orderData as any).teams_notifications || []);
        } catch (error) {
            console.error("Failed to load order:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = (newStatus: OrderStatus, reason?: string) => {
        if (!order) return;
        const requireReason = newStatus === OrderStatus.ISSUE;
        if (requireReason && reason === undefined) {
            setTransitioningStatus({ newStatus, requireReason: true });
        } else {
            performStatusChange(newStatus, reason);
        }
    };

    const performStatusChange = async (newStatus: OrderStatus, reason?: string) => {
        if (!order) return;
        try {
            await ordersApi.updateOrderStatus(order.id, { status: newStatus, reason });
            setTransitioningStatus(null);
            loadOrder();
        } catch (error) {
            console.error("Failed to update status:", error);
            alert("Failed to update order status");
        }
    };

    const handleRetryNotification = async () => {
        if (!order) return;
        try {
            await ordersApi.retryNotification(order.id);
            loadOrder();
        } catch (error) {
            console.error("Failed to retry notification:", error);
            alert("Failed to retry notification");
        }
    };

    const getUserName = () => user?.display_name || user?.email || "Unknown User";

    const handleTagOrder = async (tagIds: string[]) => {
        if (!order) return;
        try {
            await ordersApi.tagOrder(order.id, {
                tag_ids: tagIds,
                technician: getUserName()
            });
            loadOrder();
        } catch (error) {
            console.error("Failed to tag order:", error);
            alert("Failed to tag order");
        }
    };

    const handleGeneratePicklist = async () => {
        if (!order) return;
        try {
            await ordersApi.generatePicklist(order.id, {
                generated_by: getUserName()
            });
            loadOrder();
        } catch (error: any) {
            console.error("Failed to generate picklist:", error);
            const message = error.response?.data?.error || "Failed to generate picklist";
            alert(message);
        }
    };


    if (loading) {
        return <div className="p-4">Loading...</div>;
    }

    if (!order) {
        return <div className="p-4">Order not found</div>;
    }

    return (
        <div className="p-4">
            <button
                onClick={() => navigate("/")}
                className="mb-4 px-4 py-2 border rounded hover:bg-gray-100"
            >
                ← Back to Orders
            </button>
            <OrderDetailComponent
                order={order}
                auditLogs={auditLogs}
                notifications={notifications}
                onStatusChange={handleStatusChange}
                onRetryNotification={handleRetryNotification}
                onTagOrder={handleTagOrder}
                onGeneratePicklist={handleGeneratePicklist}
            />
            {transitioningStatus && (
                <StatusTransition
                    currentStatus={order.status}
                    newStatus={transitioningStatus.newStatus}
                    requireReason={transitioningStatus.requireReason}
                    onConfirm={(reason) =>
                        performStatusChange(transitioningStatus.newStatus, reason)
                    }
                    onCancel={() => setTransitioningStatus(null)}
                />
            )}
        </div>
    );
}
