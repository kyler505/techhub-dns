import { useMemo } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import type { SystemAuditItem } from "../../../api/observability";
import type { AuditLog } from "../../../types/order";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";

type CanonicalStatus = "PICKED" | "QA" | "PRE_DELIVERY" | "IN_DELIVERY" | "SHIPPING" | "DELIVERED" | "ISSUE";

const CANONICAL_STEPS: CanonicalStatus[] = ["PICKED", "QA", "PRE_DELIVERY", "IN_DELIVERY", "SHIPPING", "DELIVERED", "ISSUE"];

const toCanonicalStatus = (value: string | null | undefined): CanonicalStatus | null => {
    const v = (value || "").trim().toLowerCase();
    if (!v) return null;
    if (v === "picked") return "PICKED";
    if (v === "qa") return "QA";
    if (v === "pre-delivery" || v === "pre_delivery" || v === "pre delivery") return "PRE_DELIVERY";
    if (v === "in-delivery" || v === "in_delivery" || v === "in delivery") return "IN_DELIVERY";
    if (v === "shipping") return "SHIPPING";
    if (v === "delivered") return "DELIVERED";
    if (v === "issue") return "ISSUE";
    return null;
};

const toMillis = (dateLike: string) => {
    const ms = new Date(dateLike).getTime();
    return Number.isFinite(ms) ? ms : 0;
};

const formatDuration = (ms: number) => {
    if (!Number.isFinite(ms) || ms <= 0) return "-";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    if (hours <= 0) return `${minutes}m`;
    if (hours < 24) return `${hours}h ${minutes}m`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
};

const normalize = (value: string | null | undefined) => (value || "").trim().toLowerCase();

const StatusPathViz = ({ auditLogs }: { auditLogs: AuditLog[] }) => {
    const transitions = useMemo(() => {
        const sorted = [...auditLogs].sort((a, b) => toMillis(a.timestamp) - toMillis(b.timestamp));
        return sorted
            .map((log) => {
                const from = toCanonicalStatus(log.from_status);
                const to = toCanonicalStatus(log.to_status);
                if (!to) return null;
                return {
                    from,
                    to,
                    atMs: toMillis(log.timestamp),
                };
            })
            .filter(Boolean) as Array<{ from: CanonicalStatus | null; to: CanonicalStatus; atMs: number }>;
    }, [auditLogs]);

    const reached = useMemo(() => {
        const set = new Set<CanonicalStatus>();
        for (const t of transitions) {
            if (t.from) set.add(t.from);
            set.add(t.to);
        }
        return set;
    }, [transitions]);

    const durationsByToStatus = useMemo(() => {
        const map = new Map<CanonicalStatus, number>();
        for (let i = 1; i < transitions.length; i++) {
            const prev = transitions[i - 1];
            const curr = transitions[i];
            map.set(curr.to, Math.max(0, curr.atMs - prev.atMs));
        }
        return map;
    }, [transitions]);

    const nodeCount = CANONICAL_STEPS.length;
    const w = 660;
    const h = 90;
    const padX = 24;
    const y = 34;
    const stepX = (w - padX * 2) / (nodeCount - 1);

    return (
        <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-xs font-medium text-muted-foreground">Status path</div>
            <svg className="mt-2 w-full" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Order status path">
                {CANONICAL_STEPS.map((step, idx) => {
                    const x = padX + idx * stepX;
                    const active = reached.has(step);
                    const isIssue = step === "ISSUE";
                    const fill = active ? (isIssue ? "hsl(var(--destructive))" : "hsl(var(--primary))") : "hsl(var(--muted))";
                    const stroke = active ? (isIssue ? "hsl(var(--destructive))" : "hsl(var(--primary))") : "hsl(var(--border))";

                    const duration = durationsByToStatus.get(step);
                    return (
                        <g key={step}>
                            {idx > 0 ? (
                                <line
                                    x1={padX + (idx - 1) * stepX}
                                    y1={y}
                                    x2={x}
                                    y2={y}
                                    stroke={active ? "hsl(var(--primary))" : "hsl(var(--border))"}
                                    strokeWidth={3}
                                    strokeLinecap="round"
                                    opacity={active ? 0.95 : 0.6}
                                />
                            ) : null}
                            <circle cx={x} cy={y} r={10} fill={fill} stroke={stroke} strokeWidth={2} />
                            <text x={x} y={68} textAnchor="middle" fontSize={11} fill="currentColor" className="text-foreground">
                                {step.replace("_", " ")}
                            </text>
                            {duration != null ? (
                                <text x={x} y={84} textAnchor="middle" fontSize={10} fill="currentColor" className="text-muted-foreground">
                                    {formatDuration(duration)}
                                </text>
                            ) : null}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

interface AuditInspectorProps {
    selectedEvent: SystemAuditItem | null;
    setEntityTypeFilter: (value: string) => void;
    setActionFilter: (value: string) => void;
    setEntityIdFilter: (value: string) => void;
    inspectorOrderId: string;
    setInspectorOrderId: (value: string) => void;
    loadOrderAudit: (orderIdentifier: string, hintOrderNumber?: string | null) => void;
    auditLoading: boolean;
    inspectorResolved: { id: string; orderNumber?: string | null } | null;
    auditError: string | null;
    auditLogs: AuditLog[];
}

export default function AuditInspector({
    selectedEvent,
    setEntityTypeFilter,
    setActionFilter,
    setEntityIdFilter,
    inspectorOrderId,
    setInspectorOrderId,
    loadOrderAudit,
    auditLoading,
    inspectorResolved,
    auditError,
    auditLogs,
}: AuditInspectorProps) {
    const selectedEventIsOrder = normalize(selectedEvent?.entity_type) === "order";

    return (
        <Card className="border-maroon-900/10">
            <CardHeader>
                <CardTitle className="text-base">Event inspector</CardTitle>
                <CardDescription>Inspect one event in detail and optionally drill into order status history.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {selectedEvent ? (
                    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <Badge variant="secondary">{selectedEvent.action}</Badge>
                            <span className="text-xs text-muted-foreground">{new Date(selectedEvent.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="text-sm font-medium text-foreground">
                            {selectedEvent.entity_type} <span className="font-mono">{selectedEvent.entity_id}</span>
                        </div>
                        {selectedEvent.description ? <div className="text-xs text-muted-foreground break-words">{selectedEvent.description}</div> : null}
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => setEntityTypeFilter(selectedEvent.entity_type)}>
                                Filter entity
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setActionFilter(selectedEvent.action)}>
                                Filter action
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setEntityIdFilter(selectedEvent.entity_id)}>
                                Trace entity
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed bg-card p-4 text-center">
                        <p className="text-sm font-medium text-foreground">No event selected</p>
                        <p className="text-xs text-muted-foreground mt-1">Pick an event from the timeline.</p>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <Input
                        value={inspectorOrderId}
                        onChange={(e) => setInspectorOrderId(e.target.value)}
                        placeholder="Order number or id"
                        className="font-mono"
                    />
                    <Button type="button" size="sm" onClick={() => loadOrderAudit(inspectorOrderId)} disabled={auditLoading} className="btn-lift">
                        {auditLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Load order audit
                    </Button>
                </div>

                {selectedEventIsOrder ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => loadOrderAudit(selectedEvent?.order_number || selectedEvent?.entity_id || "", selectedEvent?.order_number)}
                        disabled={auditLoading}
                    >
                        {auditLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Drill into selected order
                    </Button>
                ) : null}

                {inspectorResolved ? (
            <div className="rounded-lg border border-maroon-900/10 bg-muted/20 p-3">
                        <div className="text-sm font-medium text-foreground">
                            {inspectorResolved.orderNumber ? `Order ${inspectorResolved.orderNumber}` : "Order"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            ID <span className="font-mono">{inspectorResolved.id}</span>
                        </div>
                    </div>
                ) : null}

                {auditError ? (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
                        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                        <div className="text-sm text-destructive">{auditError}</div>
                    </div>
                ) : null}

                {auditLogs.length > 0 ? (
                    <StatusPathViz auditLogs={auditLogs} />
                ) : (
                    <div className="rounded-lg border border-dashed bg-card p-4 text-center">
                        <p className="text-sm font-medium text-foreground">No audit loaded</p>
                        <p className="text-xs text-muted-foreground mt-1">Pick an order to see status transitions.</p>
                    </div>
                )}

                {auditLogs.length > 0 ? (
                    <div className="space-y-2 max-h-[340px] overflow-auto pr-2">
                        {auditLogs
                            .slice()
                            .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp))
                            .map((log) => (
                                <div key={log.id} className="rounded-lg border border-maroon-900/10 bg-card p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</div>
                                        <Badge variant={toCanonicalStatus(log.to_status) === "ISSUE" ? "destructive" : "secondary"}>{log.to_status}</Badge>
                                    </div>
                                    <div className="mt-1 text-sm text-foreground">
                                        {log.from_status ? (
                                            <span className="font-mono">
                                                {log.from_status} -&gt; {log.to_status}
                                            </span>
                                        ) : (
                                            <span className="font-mono">to {log.to_status}</span>
                                        )}
                                    </div>
                                    {log.reason ? <div className="mt-1 text-xs text-muted-foreground break-words">{log.reason}</div> : null}
                                    {log.changed_by ? <div className="mt-1 text-xs text-muted-foreground">by {log.changed_by}</div> : null}
                                </div>
                            ))}
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}
