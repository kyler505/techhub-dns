import { useDeliveryRuns } from "../hooks/useDeliveryRuns";
import { Link } from "react-router-dom";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";

function getRunStatusVariant(status: string) {
    const normalized = status.toLowerCase().replace(/\s+/g, "_");

    if (/(cancel|canceled|cancelled|fail|failed|error)/.test(normalized)) return "destructive" as const;
    if (/(complete|completed|done|delivered)/.test(normalized)) return "secondary" as const;
    if (/(pending|queued|waiting|paused)/.test(normalized)) return "warning" as const;
    if (/(active|live|in_progress|inprogress|en_route|on_route|running)/.test(normalized)) return "success" as const;

    return "outline" as const;
}

export default function LiveDeliveryDashboard() {
    const { runs, loading, error } = useDeliveryRuns();

    return (
        <div className="p-4">
            {error && (
                <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="text-sm text-muted-foreground">Loading delivery runs...</div>
            ) : runs.length === 0 ? (
                <div className="text-sm text-muted-foreground">No active delivery runs</div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {runs.map((r) => (
                        <Link
                            key={r.id}
                            to={`/delivery/runs/${r.id}`}
                            className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            <Card className="cursor-pointer p-4 transition-colors hover:bg-muted/30">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="text-sm text-muted-foreground">Run</div>
                                        <div className="font-medium">{r.name}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm text-muted-foreground">Vehicle</div>
                                        <div className="font-medium capitalize">{r.vehicle.replace('_', ' ')}</div>
                                    </div>
                                </div>

                                <div className="mt-3 grid grid-cols-3 gap-2 text-sm text-foreground">
                                    <div>
                                        <div className="text-xs text-muted-foreground">Runner</div>
                                        <div>{r.runner}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Status</div>
                                        <div className="mt-1">
                                            <Badge variant={getRunStatusVariant(r.status)}>{r.status}</Badge>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Orders</div>
                                        <div>{r.order_ids.length}</div>
                                    </div>
                                </div>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
