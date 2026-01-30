import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";
import { deliveryRunsApi } from "../api/deliveryRuns";
import { Button } from "../components/ui/button";
import { formatDeliveryLocation } from "../utils/location";
import CreateDeliveryDialog from "../components/CreateDeliveryDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AlertTriangle } from "lucide-react";

import { useOrdersWebSocket } from "../hooks/useOrdersWebSocket";

export default function PreDeliveryQueue() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
    const [iscreateDeliveryOpen, setIsCreateDeliveryOpen] = useState(false);

    // Listen for real-time updates
    const { orders: websocketOrders } = useOrdersWebSocket();

    // Dialog States
    const [infoDialogOpen, setInfoDialogOpen] = useState(false);
    const [infoDialogTitle, setInfoDialogTitle] = useState("");
    const [infoDialogMessage, setInfoDialogMessage] = useState("");

    const [issueDialogOpen, setIssueDialogOpen] = useState(false);
    const [issueReason, setIssueReason] = useState("");
    const [selectedOrderIdForIssue, setSelectedOrderIdForIssue] = useState<string | null>(null);

    // Partial pick confirmation dialog
    const [partialPickDialogOpen, setPartialPickDialogOpen] = useState(false);
    const [partialPickOrders, setPartialPickOrders] = useState<Order[]>([]);

    const navigate = useNavigate();

    useEffect(() => {
        loadOrders();
    }, [websocketOrders]); // Refetch when websocket notifies of update

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

    const handleBulkStartDelivery = () => {
        if (selectedOrders.size === 0) {
            setInfoDialogTitle("Selection Required");
            setInfoDialogMessage("Please select at least one order to start a delivery.");
            setInfoDialogOpen(true);
            return;
        }

        // Check for partial pick orders
        const selectedOrdersList = orders.filter(o => selectedOrders.has(o.id));
        const partialPicks = selectedOrdersList.filter(
            o => o.pick_status && !o.pick_status.is_fully_picked
        );

        if (partialPicks.length > 0) {
            setPartialPickOrders(partialPicks);
            setPartialPickDialogOpen(true);
            return;
        }

        setIsCreateDeliveryOpen(true);
    };

    const handlePartialPickConfirm = () => {
        setPartialPickDialogOpen(false);
        setIsCreateDeliveryOpen(true);
    };

    const handleCreateDelivery = async (runner: string, vehicle: string) => {
        try {
            await deliveryRunsApi.createRun({
                runner: runner,
                order_ids: Array.from(selectedOrders),
                vehicle: vehicle as "van" | "golf_cart", // Cast to match expected enum
            });
            setSelectedOrders(new Set());
            loadOrders();
            setIsCreateDeliveryOpen(false);

            setInfoDialogTitle("Success");
            setInfoDialogMessage("Delivery started successfully!");
            setInfoDialogOpen(true);
        } catch (error) {
            console.error("Failed to start delivery:", error);
            throw error; // Re-throw to be caught by the dialog
        }
    };

    const openIssueDialog = (orderId: string) => {
        setSelectedOrderIdForIssue(orderId);
        setIssueReason("");
        setIssueDialogOpen(true);
    };

    const handleConfirmIssue = async () => {
        if (!selectedOrderIdForIssue) return;

        // Force reason if empty? The prompt logic implies user could cancel, but here we likely want a reason.
        // Assuming reason is optional or handled by backend, but "prompt" usually implies input needed.
        // Let's pass whatever is in issueReason.

        await performStatusChange(selectedOrderIdForIssue, OrderStatus.ISSUE, issueReason);
        setIssueDialogOpen(false);
        setSelectedOrderIdForIssue(null);
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
            setInfoDialogTitle("Error");
            setInfoDialogMessage("Failed to update order status.");
            setInfoDialogOpen(true);
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold">Pre-Delivery Queue</h2>
                <Button
                    onClick={handleBulkStartDelivery}
                    disabled={selectedOrders.size === 0}
                    className="bg-orange-500 hover:bg-orange-600"
                >
                    Start Delivery ({selectedOrders.size} selected)
                </Button>
            </div>
            {orders.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                    No orders in pre-delivery queue
                </div>
            ) : (
                <div className="rounded-md border overflow-x-auto ios-scroll">
                    <table className="min-w-[900px] w-full">
                        <thead>
                            <tr className="border-b">
                                <th className="h-12 px-3 text-left align-middle">
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
                                <th className="h-12 px-3 text-left align-middle font-medium">Order ID</th>
                                <th className="h-12 px-3 text-left align-middle font-medium">Recipient</th>
                                <th className="h-12 px-3 text-left align-middle font-medium hidden lg:table-cell">Location</th>
                                <th className="h-12 px-3 text-left align-middle font-medium hidden lg:table-cell">Deliverer</th>
                                <th className="h-12 px-3 text-left align-middle font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((order) => (
                                <tr key={order.id} className="border-b hover:bg-muted/50">
                                    <td className="p-3 align-middle">
                                        <input
                                            type="checkbox"
                                            checked={selectedOrders.has(order.id)}
                                            onChange={() => handleSelectOrder(order.id)}
                                        />
                                    </td>
                                    <td className="p-3 align-middle">
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="link"
                                                onClick={() => handleViewDetail(order.id)}
                                                className="p-0 h-auto font-normal"
                                            >
                                                {order.inflow_order_id}
                                            </Button>
                                            {order.pick_status && !order.pick_status.is_fully_picked && (
                                                <span
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
                                                    title={`Partial pick: ${order.pick_status.total_picked}/${order.pick_status.total_ordered} items picked`}
                                                >
                                                    <AlertTriangle className="h-3 w-3" />
                                                    Partial
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-3 align-middle">{order.recipient_name || "N/A"}</td>
                                    <td className="p-3 align-middle hidden lg:table-cell">{formatDeliveryLocation(order)}</td>
                                    <td className="p-3 align-middle hidden lg:table-cell">{order.assigned_deliverer || "Unassigned"}</td>
                                    <td className="p-3 align-middle">
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => openIssueDialog(order.id)}
                                        >
                                            Flag Issue
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* StatusTransition will be handled by parent DeliveryDashboard */}

            <CreateDeliveryDialog
                isOpen={iscreateDeliveryOpen}
                onClose={() => setIsCreateDeliveryOpen(false)}
                onCreateDelivery={handleCreateDelivery}
                selectedOrdersCount={selectedOrders.size}
            />

            {/* Generic Info/Error Dialog */}
            <Dialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{infoDialogTitle}</DialogTitle>
                        <DialogDescription>
                            {infoDialogMessage}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => setInfoDialogOpen(false)}>OK</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Flag Issue Dialog (replaces prompt) */}
            <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Flag Order as Issue</DialogTitle>
                        <DialogDescription>
                            Please provide a reason for flagging this order.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <label htmlFor="issue-reason" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Reason</label>
                        <textarea
                            id="issue-reason"
                            value={issueReason}
                            onChange={(e) => setIssueReason(e.target.value)}
                            placeholder="e.g., Wrong address, Recipient unavailable..."
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIssueDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleConfirmIssue}>Submit</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Partial Pick Confirmation Dialog */}
            <Dialog open={partialPickDialogOpen} onOpenChange={setPartialPickDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Partial Pick Warning
                        </DialogTitle>
                        <DialogDescription>
                            {partialPickOrders.length} order{partialPickOrders.length > 1 ? 's are' : ' is'} only partially picked.
                            Only the picked items will be delivered. Remainder orders will be created for unpicked items.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-48 overflow-y-auto py-2">
                        <ul className="space-y-1 text-sm">
                            {partialPickOrders.map(order => (
                                <li key={order.id} className="flex justify-between items-center px-2 py-1 bg-muted rounded">
                                    <span className="font-medium">{order.inflow_order_id}</span>
                                    <span className="text-muted-foreground">
                                        {order.pick_status?.total_picked}/{order.pick_status?.total_ordered} items
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPartialPickDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handlePartialPickConfirm} className="bg-amber-500 hover:bg-amber-600">
                            Continue Anyway
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
