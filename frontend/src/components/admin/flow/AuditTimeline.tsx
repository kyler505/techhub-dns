import { Loader2 } from "lucide-react";

import type { SystemAuditItem } from "../../../api/observability";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";

interface AuditTimelineProps {
    timeline: SystemAuditItem[];
    selectedEventId: string | null;
    onSelectEvent: (id: string) => void;
    sinceMillis: number;
    loading: boolean;
    loadingMore: boolean;
    nextCursor: string | null;
    onLoadMore: () => void;
}

const normalize = (value: string | null | undefined) => (value || "").trim().toLowerCase();

export default function AuditTimeline({
    timeline,
    selectedEventId,
    onSelectEvent,
    sinceMillis,
    loading,
    loadingMore,
    nextCursor,
    onLoadMore,
}: AuditTimelineProps) {
    const empty = !loading && timeline.length === 0;

    return (
        <Card className="border-maroon-900/10">
            <CardHeader>
                <CardTitle className="text-base">Timeline</CardTitle>
                <CardDescription>
                    Showing {timeline.length} event{timeline.length === 1 ? "" : "s"} since {new Date(sinceMillis).toLocaleString()}.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading audit stream...
                    </div>
                ) : empty ? (
                    <div className="rounded-lg border border-dashed bg-card p-6 text-center">
                        <p className="text-sm font-medium text-foreground">No activity found</p>
                        <p className="text-xs text-muted-foreground mt-1">Try expanding the time range or clearing filters.</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[520px] overflow-auto pr-2">
                        {timeline.map((row) => {
                            const ts = new Date(row.timestamp).toLocaleString();
                            const isOrder = normalize(row.entity_type) === "order";
                            const isSelected = selectedEventId === row.id;
                            return (
                                <button
                                    key={row.id}
                                    type="button"
                                    onClick={() => onSelectEvent(row.id)}
                                    className={`w-full text-left rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30 hover:border-maroon-900/20 ${
                                        isSelected ? "ring-1 ring-primary/60" : ""
                                    }`}
                                >
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline">{row.entity_type}</Badge>
                                                <span className="text-xs text-muted-foreground">{ts}</span>
                                            </div>
                                            <div className="mt-1 text-sm font-medium text-foreground break-words">
                                                {isOrder
                                                    ? row.order_number
                                                        ? `Order ${row.order_number}`
                                                        : `Order ${row.entity_id}`
                                                    : `${row.entity_type} ${row.entity_id}`}
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground break-words">
                                                {row.description || `${row.entity_type}:${row.action}`}
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                ID <span className="font-mono">{row.entity_id}</span>
                                                {row.user_id ? ` · user ${row.user_id}` : ""}
                                            </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-2 sm:mt-0">{row.action}</div>
                                    </div>
                                </button>
                            );
                        })}
                        <div className="pt-2">
                            <Button type="button" variant="outline" onClick={onLoadMore} disabled={!nextCursor || loadingMore}>
                                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {nextCursor ? "Load more" : "No more results"}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
