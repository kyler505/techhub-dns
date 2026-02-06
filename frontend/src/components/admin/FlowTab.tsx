import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RefreshCw, Search } from "lucide-react";

import analyticsApi, { ActivityItem } from "../../api/analytics";
import observabilityApi, { SystemAuditItem } from "../../api/observability";
import { ordersApi } from "../../api/orders";
import { AuditLog } from "../../types/order";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";

type TimeRange = "1h" | "24h" | "7d";

type CanonicalStatus = "PICKED" | "QA" | "PRE_DELIVERY" | "IN_DELIVERY" | "SHIPPING" | "DELIVERED" | "ISSUE";

const CANONICAL_STEPS: CanonicalStatus[] = [
    "PICKED",
    "QA",
    "PRE_DELIVERY",
    "IN_DELIVERY",
    "SHIPPING",
    "DELIVERED",
    "ISSUE",
];

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: string) => UUID_RE.test(value.trim());

const isInitialPickedFromInflow = (item: {
    type?: string;
    from_status?: string | null;
    to_status?: string | null;
    changed_by?: string | null;
    reason?: string | null;
}) => {
    const eventType = (item.type || "").trim().toLowerCase();
    if (eventType !== "status_change") return false;

    const from = (item.from_status || "").trim();
    const to = (item.to_status || "").trim().toLowerCase();
    const changedBy = (item.changed_by || "").trim().toLowerCase();
    const reason = (item.reason || "").trim().toLowerCase();

    return !from && to === "picked" && changedBy === "system" && reason.includes("order ingested from inflow");
};

const getSinceMillis = (range: TimeRange) => {
    const now = Date.now();
    if (range === "1h") return now - 60 * 60 * 1000;
    if (range === "24h") return now - 24 * 60 * 60 * 1000;
    return now - 7 * 24 * 60 * 60 * 1000;
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

type TimelineRow =
    | {
          kind: "activity";
          timestamp: string;
          orderId: string;
          orderNumber?: string | null;
          description: string;
          changedBy?: string;
          type?: string;
          fromStatus?: string | null;
          toStatus?: string | null;
          reason?: string | null;
      }
    | {
          kind: "system";
          timestamp: string;
          entityType: string;
          entityId: string;
          orderNumber?: string | null;
          action: string;
          description?: string | null;
          userId?: string | null;
      };

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

export default function FlowTab() {
    const [range, setRange] = useState<TimeRange>("24h");
    const [search, setSearch] = useState("");
    const [includeSystemAudit, setIncludeSystemAudit] = useState(true);

    const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
    const [systemAudit, setSystemAudit] = useState<SystemAuditItem[]>([]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [inspectorOrderId, setInspectorOrderId] = useState("");
    const [inspectorResolved, setInspectorResolved] = useState<{ id: string; orderNumber?: string | null } | null>(null);
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditError, setAuditError] = useState<string | null>(null);

    const sinceMillis = useMemo(() => getSinceMillis(range), [range]);
    const sinceIso = useMemo(() => new Date(sinceMillis).toISOString(), [sinceMillis]);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [activityRes, systemRes] = await Promise.all([
                analyticsApi.getRecentActivity({ limit: 100 }),
                includeSystemAudit ? observabilityApi.getSystemAudit({ limit: 200, since: sinceIso }) : Promise.resolve({ items: [] }),
            ]);

            setRecentActivity(activityRes.items || []);
            setSystemAudit(systemRes.items || []);
        } catch (e: any) {
            setError(e?.response?.data?.error || e?.message || "Failed to load flow data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [range, includeSystemAudit]);

    const timeline = useMemo(() => {
        const rows: TimelineRow[] = [];

        const importedFromInflowByOrderId = new Map<string, number[]>();
        if (includeSystemAudit) {
            for (const item of systemAudit) {
                const entityType = (item.entity_type || "").trim().toLowerCase();
                const action = (item.action || "").trim().toLowerCase();
                if (entityType !== "order" || action !== "imported_from_inflow") continue;
                if (!item.entity_id || !item.timestamp) continue;
                const key = item.entity_id.toLowerCase();
                const list = importedFromInflowByOrderId.get(key) || [];
                list.push(toMillis(item.timestamp));
                importedFromInflowByOrderId.set(key, list);
            }
        }

        const hasImportedFromInflowNearby = (orderId: string, atIso: string) => {
            const ms = toMillis(atIso);
            if (!ms) return false;
            const list = importedFromInflowByOrderId.get(orderId.toLowerCase());
            if (!list || list.length === 0) return false;

            const windowMs = 10 * 60 * 1000;
            return list.some((t) => Math.abs(t - ms) <= windowMs);
        };

        for (const item of recentActivity) {
            if (!item.timestamp) continue;
            if (toMillis(item.timestamp) < sinceMillis) continue;

            const isInitialPicked = isInitialPickedFromInflow(item);
            if (includeSystemAudit && isInitialPicked && hasImportedFromInflowNearby(item.order_id, item.timestamp)) {
                continue;
            }

            rows.push({
                kind: "activity",
                timestamp: item.timestamp,
                orderId: item.order_id,
                orderNumber: item.order_number,
                description: isInitialPicked ? "Imported from inFlow (Picked)" : item.description,
                changedBy: item.changed_by,
                type: item.type,
                fromStatus: item.from_status,
                toStatus: item.to_status,
                reason: item.reason,
            });
        }

        if (includeSystemAudit) {
            for (const item of systemAudit) {
                if (!item.timestamp) continue;
                if (toMillis(item.timestamp) < sinceMillis) continue;
                rows.push({
                    kind: "system",
                    timestamp: item.timestamp,
                    entityType: item.entity_type,
                    entityId: item.entity_id,
                    orderNumber: item.order_number,
                    action: item.action,
                    description: item.description,
                    userId: item.user_id,
                });
            }
        }

        const q = search.trim().toLowerCase();
        const filtered = q
            ? rows.filter((r) => {
                  if (r.kind === "activity") {
                      return (
                          r.orderId.toLowerCase().includes(q) ||
                          (r.orderNumber || "").toLowerCase().includes(q) ||
                          (r.description || "").toLowerCase().includes(q) ||
                          (r.changedBy || "").toLowerCase().includes(q)
                      );
                  }
                  return (
                      (r.entityType || "").toLowerCase().includes(q) ||
                      (r.entityId || "").toLowerCase().includes(q) ||
                      (r.orderNumber || "").toLowerCase().includes(q) ||
                      (r.action || "").toLowerCase().includes(q) ||
                      (r.description || "").toLowerCase().includes(q) ||
                      (r.userId || "").toLowerCase().includes(q)
                  );
              })
            : rows;

        return filtered.sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
    }, [recentActivity, systemAudit, includeSystemAudit, sinceMillis, search]);

    const loadOrderAudit = async (orderIdentifier: string, hintOrderNumber?: string | null) => {
        const trimmed = orderIdentifier.trim();
        if (!trimmed) {
            toast.error("Enter an order id or number");
            return;
        }

        setInspectorOrderId(hintOrderNumber || trimmed);
        setAuditLoading(true);
        setAuditError(null);
        setInspectorResolved(null);

        try {
            let resolvedId = trimmed;
            let resolvedOrderNumber: string | null | undefined = hintOrderNumber || null;

            if (!isUuid(trimmed)) {
                const resolved = await ordersApi.resolveOrder(trimmed);
                resolvedId = resolved.id;
                resolvedOrderNumber = resolved.order_number;
            } else if (!resolvedOrderNumber) {
                // Best-effort enrichment so the inspector shows order number.
                const orderDetail = await ordersApi.getOrder(trimmed);
                resolvedOrderNumber = orderDetail?.inflow_order_id || null;
            }

            setInspectorResolved({ id: resolvedId, orderNumber: resolvedOrderNumber });
            setInspectorOrderId(resolvedOrderNumber || trimmed);

            const res = await ordersApi.getOrderAudit(resolvedId);
            setAuditLogs(res || []);

            toast.message("Loaded order audit", {
                description: resolvedOrderNumber ? `Order ${resolvedOrderNumber}` : resolvedId,
            });
        } catch (e: any) {
            setAuditLogs([]);
            setInspectorResolved(null);
            setAuditError(e?.response?.data?.error || e?.message || "Failed to load order audit");
        } finally {
            setAuditLoading(false);
        }
    };

    const empty = !loading && timeline.length === 0;

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle className="text-base">Flow</CardTitle>
                        <CardDescription>Recent activity plus background/system audit, with an order inspector.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => void load()} className="btn-lift" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refresh
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            {([
                                { key: "1h", label: "1h" },
                                { key: "24h", label: "24h" },
                                { key: "7d", label: "7d" },
                            ] as const).map((opt) => (
                                <Button
                                    key={opt.key}
                                    type="button"
                                    size="sm"
                                    variant={range === opt.key ? "default" : "outline"}
                                    className="btn-lift"
                                    onClick={() => setRange(opt.key)}
                                >
                                    {opt.label}
                                </Button>
                            ))}
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                            <div className="relative w-full sm:w-[22rem]">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search order number, id, or text..."
                                    className="pl-9"
                                />
                            </div>
                            <Checkbox
                                checked={includeSystemAudit}
                                onChange={(e) => setIncludeSystemAudit(e.target.checked)}
                                label="Include system audit"
                            />
                        </div>
                    </div>

                    {error ? (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
                            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                            <div className="text-sm text-destructive">{error}</div>
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base">Timeline</CardTitle>
                        <CardDescription>
                            Showing {timeline.length} item{timeline.length === 1 ? "" : "s"} since {new Date(sinceMillis).toLocaleString()}.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading timeline...
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
                                    const onPickOrder = (orderId: string, orderNumber?: string | null) => {
                                        void loadOrderAudit(orderNumber || orderId, orderNumber);
                                    };

                                    if (row.kind === "activity") {
                                        return (
                                            <button
                                                key={`a:${row.timestamp}:${row.orderId}:${row.description}`}
                                                type="button"
                                                onClick={() => onPickOrder(row.orderId, row.orderNumber)}
                                                className="w-full text-left rounded-lg border bg-card p-3 hover:bg-muted/30 transition-colors"
                                            >
                                                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="secondary">activity</Badge>
                                                            <span className="text-xs text-muted-foreground">{ts}</span>
                                                        </div>
                                                        <div className="mt-1 text-sm font-medium text-foreground break-words">
                                                            {row.orderNumber ? `Order ${row.orderNumber}` : `Order ${row.orderId}`}
                                                        </div>
                                                        <div className="mt-1 text-xs text-muted-foreground break-words">{row.description}</div>
                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                            {row.orderNumber ? (
                                                                <>
                                                                    ID <span className="font-mono">{row.orderId}</span>
                                                                </>
                                                            ) : null}
                                                            {row.changedBy ? ` · by ${row.changedBy}` : ""}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-2 sm:mt-0">{row.type || ""}</div>
                                                </div>
                                            </button>
                                        );
                                    }

                                    const clickableOrder = row.entityType.toLowerCase() === "order";
                                    return (
                                        <button
                                            key={`s:${row.timestamp}:${row.entityType}:${row.entityId}:${row.action}`}
                                            type="button"
                                            onClick={() => {
                                                if (!clickableOrder) return;
                                                onPickOrder(row.entityId, row.orderNumber);
                                            }}
                                            className={`w-full text-left rounded-lg border bg-card p-3 transition-colors ${
                                                clickableOrder ? "hover:bg-muted/30" : "opacity-90 cursor-default"
                                            }`}
                                        >
                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline">system</Badge>
                                                        <span className="text-xs text-muted-foreground">{ts}</span>
                                                    </div>
                                                    {clickableOrder ? (
                                                        <>
                                                            <div className="mt-1 text-sm font-medium text-foreground break-words">
                                                                {row.orderNumber ? `Order ${row.orderNumber}` : `Order ${row.entityId}`}
                                                            </div>
                                                            <div className="mt-1 text-xs text-muted-foreground break-words">
                                                                {row.description || `${row.entityType}:${row.action}`}
                                                            </div>
                                                            <div className="mt-1 text-xs text-muted-foreground">
                                                                {row.orderNumber ? (
                                                                    <>
                                                                        ID <span className="font-mono">{row.entityId}</span>
                                                                    </>
                                                                ) : null}
                                                                {row.userId ? ` · user ${row.userId}` : ""}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="mt-1 text-sm text-foreground break-words">
                                                                {row.description || `${row.entityType}:${row.action}`}
                                                            </div>
                                                            <div className="mt-1 text-xs text-muted-foreground">
                                                                {row.entityType} <span className="font-mono">{row.entityId}</span>
                                                                {row.userId ? ` · user ${row.userId}` : ""}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-2 sm:mt-0">{row.action}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Order inspector</CardTitle>
                        <CardDescription>Enter an order number (e.g. TH3270) or UUID, or click a timeline item.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Input
                                value={inspectorOrderId}
                                onChange={(e) => setInspectorOrderId(e.target.value)}
                                placeholder="Order number or id"
                                className="font-mono"
                            />
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => void loadOrderAudit(inspectorOrderId)}
                                disabled={auditLoading}
                                className="btn-lift"
                            >
                                {auditLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Load
                            </Button>
                        </div>

                        {inspectorResolved ? (
                            <div className="rounded-lg border bg-muted/20 p-3">
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
                                        <div key={log.id} className="rounded-lg border bg-card p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</div>
                                                <Badge variant={toCanonicalStatus(log.to_status) === "ISSUE" ? "destructive" : "secondary"}>
                                                    {log.to_status}
                                                </Badge>
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
                                            {log.changed_by ? (
                                                <div className="mt-1 text-xs text-muted-foreground">by {log.changed_by}</div>
                                            ) : null}
                                        </div>
                                    ))}
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
