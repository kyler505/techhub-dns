import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useDeliveryRun } from "../hooks/useDeliveryRun";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ArrowLeft, Truck, User, Clock, Package, CheckCircle, AlertCircle } from "lucide-react";
import { deliveryRunsApi } from "../api/deliveryRuns";
import { OrderStatus } from "../types/order";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";

export default function DeliveryRunDetailPage() {
    const { runId } = useParams<{ runId: string }>();
    const navigate = useNavigate();
    const { run, loading, error } = useDeliveryRun(runId);
    const [finishing, setFinishing] = useState(false);
    const [errorDialogOpen, setErrorDialogOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    // Check if all orders are delivered
    const allOrdersDelivered = run?.orders.every(order =>
        order.status.toLowerCase() === 'delivered'
    ) ?? false;

    const formatVehicleName = (vehicle: string) => {
        return vehicle
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-sm text-muted-foreground">Loading delivery run details...</div>
            </div>
        );
    }

    if (error || !run) {
        return (
            <div className="text-center py-12">
                <div className="text-red-600 mb-4">{error || "Delivery run not found"}</div>
                <Button variant="outline" onClick={() => navigate(-1)}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
            </div>
        );
    }

    const formatDateTime = (dateString: string | null | undefined) => {
        if (!dateString) return "Not started";
        return new Date(dateString).toLocaleString();
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case "active":
                return "bg-green-100 text-green-800";
            case "completed":
                return "bg-blue-100 text-blue-800";
            case "cancelled":
                return "bg-red-100 text-red-800";
            default:
                return "bg-gray-100 text-gray-800";
        }
    };

    const getOrderStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case "pre_delivery":
                return "bg-yellow-100 text-yellow-800";
            case "in_delivery":
                return "bg-blue-100 text-blue-800";
            case "delivered":
                return "bg-green-100 text-green-800";
            case "issue":
                return "bg-red-100 text-red-800";
            default:
                return "bg-gray-100 text-gray-800";
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold">{run.name}</h1>
                        <p className="text-muted-foreground">Run ID: {run.id}</p>
                    </div>
                </div>

                {/* Complete Delivery Button */}
                {run && run.status === 'Active' && (
                    <Button
                        onClick={async () => {
                            if (!allOrdersDelivered) return;

                            setFinishing(true);
                            try {
                                await deliveryRunsApi.finishRun(run.id);
                                // Refresh the page to show updated status
                                window.location.reload();
                            } catch (error: any) {
                                console.error('Failed to finish delivery run:', error);
                                const msg = error.response?.data?.error?.message || 'Failed to complete delivery. Please ensure all orders are delivered first.';
                                setErrorMessage(msg);
                                setErrorDialogOpen(true);
                            } finally {
                                setFinishing(false);
                            }
                        }}
                        disabled={!allOrdersDelivered || finishing}
                        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                    >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {finishing ? 'Completing...' : 'Complete Delivery'}
                    </Button>
                )}
            </div>

            {/* Run Summary */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Truck className="w-5 h-5" />
                        Run Summary
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="flex items-center gap-3">
                            <User className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <div className="text-sm text-muted-foreground">Runner</div>
                                <div className="font-medium">{run.runner}</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Truck className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <div className="text-sm text-muted-foreground">Vehicle</div>
                                <div className="font-medium">{formatVehicleName(run.vehicle)}</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full bg-current text-muted-foreground flex items-center justify-center text-xs">
                                ●
                            </div>
                            <div>
                                <div className="text-sm text-muted-foreground">Status</div>
                                <Badge className={getStatusColor(run.status)}>
                                    {run.status.toLowerCase()}
                                </Badge>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Package className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <div className="text-sm text-muted-foreground">Orders</div>
                                <div className="font-medium">{run.orders.length}</div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t">
                        <div className="flex items-center gap-3">
                            <Clock className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <div className="text-sm text-muted-foreground">Started</div>
                                <div className="font-medium">{formatDateTime(run.start_time)}</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Clock className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <div className="text-sm text-muted-foreground">Completed</div>
                                <div className="font-medium">{formatDateTime(run.end_time)}</div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Orders in Run */}
            <Card>
                <CardHeader>
                    <CardTitle>Orders in This Run</CardTitle>
                    <CardDescription>
                        {run.orders.length} order{run.orders.length !== 1 ? 's' : ''} assigned to this delivery run
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {run.orders.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No orders assigned to this run
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {run.orders.map((order) => (
                                <div
                                    key={order.id}
                                    className={`flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors ${order.status.toLowerCase() !== 'delivered' ? 'border-orange-200 bg-orange-50' : ''
                                        }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div>
                                            <div className="font-medium">
                                                Order {order.inflow_order_id || order.id.slice(0, 8)}
                                            </div>
                                            {order.recipient_name && (
                                                <div className="text-sm text-muted-foreground">
                                                    {order.recipient_name}
                                                </div>
                                            )}
                                            {order.delivery_location && (
                                                <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                                                    <span className="font-medium">Location:</span> {order.delivery_location}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <Badge className={getOrderStatusColor(order.status)}>
                                            {order.status.toLowerCase().replace('_', ' ')}
                                        </Badge>

                                        {order.status.toLowerCase() !== 'delivered' && (
                                            <span className="text-xs text-orange-600 font-medium">
                                                Must be signed first
                                            </span>
                                        )}

                                        <Link to={`/orders/${order.id}`}>
                                            <Button variant="outline" size="sm">
                                                View Details
                                            </Button>
                                        </Link>

                                        {order.status === OrderStatus.IN_DELIVERY && (
                                            <Link to={`/document-signing?orderId=${order.id}&returnTo=/delivery/runs/${run.id}`}>
                                                <Button variant="default" size="sm" className="bg-green-600 hover:bg-green-700">
                                                    Sign Document
                                                </Button>
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Error Dialog */}
            <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="w-5 h-5" />
                            Cannot Complete Delivery
                        </DialogTitle>
                        <DialogDescription className="pt-2">
                            {errorMessage}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => setErrorDialogOpen(false)}>OK</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
