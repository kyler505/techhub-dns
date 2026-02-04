
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deliveryRunsApi, DeliveryRunResponse } from "../api/deliveryRuns";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Clock, Truck, User } from "lucide-react";

export default function PastDeliveryRuns() {
    const [runs, setRuns] = useState<DeliveryRunResponse[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRuns = async () => {
            try {
                setLoading(true);
                // Fetch completed and cancelled runs
                const data = await deliveryRunsApi.getRuns(["Completed", "Cancelled"]);
                setRuns(data);
            } catch (error) {
                console.error("Failed to fetch past runs:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchRuns();
    }, []);

    const formatDateTime = (dateString: string | null) => {
        if (!dateString) return "N/A";
        return new Date(dateString).toLocaleString();
    };

    const getStatusVariant = (status: string) => {
        switch (status.toLowerCase()) {
            case "completed":
                return "success" as const;
            case "cancelled":
                return "destructive" as const;
            default:
                return "secondary" as const;
        }
    };

    const formatVehicleName = (vehicle: string) => {
        return vehicle
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    if (loading) {
        return <div className="text-center py-8 text-muted-foreground">Loading past delivery runs...</div>;
    }

    if (runs.length === 0) {
        return (
            <div className="text-center py-12 border rounded-lg bg-muted/10">
                <p className="text-muted-foreground">No past delivery runs found</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {runs.map((run) => (
                <Card
                    key={run.id}
                    className="p-4 hover:bg-muted/30 hover:shadow-premium-hover"
                >
                    <div className="flex items-center gap-6">
                        <div>
                            <div className="font-medium text-lg">{run.name || `Run ${run.id.slice(0, 8)}`}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                                <Clock className="w-3 h-3" />
                                {formatDateTime(run.end_time || run.start_time)}
                            </div>
                        </div>

                        <div className="flex gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                {run.runner}
                            </div>
                            <div className="flex items-center gap-1">
                                <Truck className="w-4 h-4" />
                                {formatVehicleName(run.vehicle)}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <Badge variant={getStatusVariant(run.status)}>
                            {run.status}
                        </Badge>
                        {/* We can re-use the detail page */}
                        <Link to={`/delivery/runs/${run.id}`}>
                            <Button variant="outline" size="sm">
                                View Details
                            </Button>
                        </Link>
                    </div>
                </Card>
            ))}
        </div>
    );
}
