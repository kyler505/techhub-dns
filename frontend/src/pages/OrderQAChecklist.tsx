import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Order, OrderStatus } from "../types/order";
import { ordersApi } from "../api/orders";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "../components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../components/ui/table";

type SavedQAChecklist = {
    orderId: string; // internal id
    inflowOrderId: string; // display id
    submittedAt: string; // ISO
    // Form data structure used only for timestamp retrieval in list view
    form: {
        technician: string;
        qaSignature: string;
        method: string;
    };
};

const storageKey = (orderId: string) => `order-qa-checklist-v2:${orderId}`;

export default function OrderQAChecklist() {
    const navigate = useNavigate();

    const [orders, setOrders] = useState<Order[]>([]);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        loadOrders();
    }, [search]);

    const loadOrders = async () => {
        setLoadingOrders(true);
        try {
            const data = await ordersApi.getOrders({
                status: OrderStatus.QA,
                search: search.trim() ? search.trim() : undefined,
            });
            setOrders(data);
        } catch (error) {
            console.error("Failed to load orders:", error);
            toast.error("Failed to load orders");
        } finally {
            setLoadingOrders(false);
        }
    };

    const completedMap = useMemo(() => {
        const map = new Map<string, string>(); // orderId -> submittedAt
        for (const o of orders) {
            if (o.qa_completed_at) {
                map.set(o.id, o.qa_completed_at);
            } else {
                const raw = localStorage.getItem(storageKey(o.id));
                if (!raw) continue;
                try {
                    const parsed = JSON.parse(raw) as SavedQAChecklist;
                    map.set(o.id, parsed.submittedAt);
                } catch {
                    // ignore
                }
            }
        }
        return map;
    }, [orders]);

    const pendingOrders = orders
        .filter((o) => !completedMap.has(o.id))
        .filter(
            (o) =>
                ![
                    OrderStatus.DELIVERED,
                    OrderStatus.IN_DELIVERY,
                    OrderStatus.SHIPPING,
                ].includes(o.status)
        );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    QA Checklist Dashboard
                </h1>
            </div>

            <Card>
                <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between sm:space-y-0">
                    <div>
                        <CardTitle className="text-lg">Orders Needing QA</CardTitle>
                    </div>

                    <div className="w-full sm:w-72">
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search orders"
                            aria-label="Search"
                        />
                    </div>
                </CardHeader>

                <CardContent className="pt-6">
                    {loadingOrders ? (
                        <div className="py-10 text-sm text-muted-foreground">
                            Loading...
                        </div>
                    ) : (
                        <div className="rounded-lg border border-border overflow-hidden">
                            <Table className="min-w-[720px]">
                                <TableHeader className="bg-muted/30">
                                    <TableRow>
                                        <TableHead>Order</TableHead>
                                        <TableHead>Recipient</TableHead>
                                        <TableHead className="hidden lg:table-cell">
                                            Location
                                        </TableHead>
                                        <TableHead>QA</TableHead>
                                    </TableRow>
                                </TableHeader>

                                <TableBody>
                                    {pendingOrders.map((o) => {
                                        const submittedAt = completedMap.get(o.id) || null;
                                        const qaButtonLabel = submittedAt
                                            ? "Edit QA"
                                            : "Perform QA";

                                        return (
                                            <TableRow key={o.id}>
                                                <TableCell className="font-medium">
                                                    <Button
                                                        variant="link"
                                                        className="h-auto p-0 text-foreground hover:text-accent"
                                                        onClick={() =>
                                                            navigate(`/orders/${o.id}`)
                                                        }
                                                    >
                                                        {o.inflow_order_id}
                                                    </Button>
                                                </TableCell>
                                                <TableCell>
                                                    {o.recipient_name || "N/A"}
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell">
                                                    {o.delivery_location || "N/A"}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={() =>
                                                            navigate(`/orders/${o.id}/qa`)
                                                        }
                                                        className="bg-accent text-accent-foreground hover:bg-accent/90 btn-lift inline-flex items-center gap-2"
                                                    >
                                                        {qaButtonLabel}
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            strokeWidth={1.5}
                                                            stroke="currentColor"
                                                            className="h-4 w-4"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                                                            />
                                                        </svg>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}

                                    {pendingOrders.length === 0 && (
                                        <TableRow>
                                            <TableCell
                                                className="py-10 text-center text-sm text-muted-foreground"
                                                colSpan={4}
                                            >
                                                {orders.length === 0
                                                    ? "No orders need QA at this time."
                                                    : "All eligible orders have completed QA."}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}


/* file saving information for back end
type SavedQAChecklist = {
  orderId: string;
  inflowOrderId: string;
  submittedAt: string; // ISO timestamp
  form: {
    orderNumber: string;
    technician: string;
    verifyAssetTagSerialMatch: boolean;
    verifyOrderDetailsTemplateSent: boolean;
    verifyPackagedProperly: boolean;
    verifyPackingSlipSerialsMatch: boolean;
    verifyElectronicPackingSlipSaved: boolean;
    verifyBoxesLabeledCorrectly: boolean;
    qaSignature: string;
    method: "Delivery" | "Shipping";
  };
};
*/
