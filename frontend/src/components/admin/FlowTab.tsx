import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

import observabilityApi, { type SystemAuditItem } from "../../api/observability";
import { ordersApi } from "../../api/orders";
import type { AuditLog } from "../../types/order";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import AuditFilterSidebar from "./flow/AuditFilterSidebar";
import AuditInspector from "./flow/AuditInspector";
import AuditTimeline from "./flow/AuditTimeline";

type TimeRange = "1h" | "24h" | "7d";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: string) => UUID_RE.test(value.trim());

const normalize = (value: string | null | undefined) => (value || "").trim().toLowerCase();

const toMillis = (dateLike: string) => {
    const ms = new Date(dateLike).getTime();
    return Number.isFinite(ms) ? ms : 0;
};

const getSinceMillis = (range: TimeRange) => {
    const now = Date.now();
    if (range === "1h") return now - 60 * 60 * 1000;
    if (range === "24h") return now - 24 * 60 * 60 * 1000;
    return now - 7 * 24 * 60 * 60 * 1000;
};

const filterBySearch = (item: SystemAuditItem, q: string) => {
    if (!q) return true;
    return (
        normalize(item.entity_type).includes(q) ||
        normalize(item.entity_id).includes(q) ||
        normalize(item.order_number || "").includes(q) ||
        normalize(item.action).includes(q) ||
        normalize(item.description || "").includes(q) ||
        normalize(item.user_id || "").includes(q)
    );
};

const mergeUniqueById = (current: SystemAuditItem[], incoming: SystemAuditItem[]) => {
    const seen = new Set(current.map((item) => item.id));
    const next = [...current];
    for (const item of incoming) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        next.push(item);
    }
    return next;
};

const toErrorMessage = (error: unknown, fallback: string): string => {
    const e = error as {
        message?: unknown;
        response?: {
            status?: number;
            data?: {
                error?: unknown;
                message?: unknown;
            };
        };
    };

    const fromDataError = e?.response?.data?.error;
    if (typeof fromDataError === "string" && fromDataError.trim()) return fromDataError;
    if (typeof fromDataError === "object" && fromDataError) {
        const maybeMessage = (fromDataError as { message?: unknown }).message;
        if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
    }

    const fromDataMessage = e?.response?.data?.message;
    if (typeof fromDataMessage === "string" && fromDataMessage.trim()) return fromDataMessage;

    if (typeof e?.message === "string" && e.message.trim()) return e.message;

    return fallback;
};

const withOrderNumberPrefixCandidates = (value: string): string[] => {
    const trimmed = value.trim();
    const upper = trimmed.toUpperCase();
    const candidates = [trimmed];
    if (/^\d+$/.test(trimmed)) {
        return [`TH${trimmed}`, trimmed];
    } else if (/^[A-Z]{2}\d+$/.test(upper)) {
        candidates.push(upper);
    }
    return Array.from(new Set(candidates));
};

export default function FlowTab() {
    const [range, setRange] = useState<TimeRange>("24h");
    const [search, setSearch] = useState("");
    const [entityTypeFilter, setEntityTypeFilter] = useState("");
    const [actionFilter, setActionFilter] = useState("");
    const [entityIdFilter, setEntityIdFilter] = useState("");
    const [includeValues, setIncludeValues] = useState(false);

    const [appliedRange, setAppliedRange] = useState<TimeRange>("24h");
    const [appliedEntityTypeFilter, setAppliedEntityTypeFilter] = useState("");
    const [appliedActionFilter, setAppliedActionFilter] = useState("");
    const [appliedEntityIdFilter, setAppliedEntityIdFilter] = useState("");
    const [appliedIncludeValues, setAppliedIncludeValues] = useState(false);

    const [systemAudit, setSystemAudit] = useState<SystemAuditItem[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

    const [inspectorOrderId, setInspectorOrderId] = useState("");
    const [inspectorResolved, setInspectorResolved] = useState<{ id: string; orderNumber?: string | null } | null>(null);
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [auditLogCache, setAuditLogCache] = useState<Record<string, AuditLog[]>>({});
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditError, setAuditError] = useState<string | null>(null);

    const sinceMillis = useMemo(() => getSinceMillis(appliedRange), [appliedRange]);
    const sinceIso = useMemo(() => new Date(sinceMillis).toISOString(), [sinceMillis]);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const systemRes = await observabilityApi.getSystemAudit({
                limit: 150,
                since: sinceIso,
                entity_type: appliedEntityTypeFilter || undefined,
                entity_id: appliedEntityIdFilter || undefined,
                action: appliedActionFilter || undefined,
                include_values: appliedIncludeValues,
            });

            const items = systemRes.items || [];
            setSystemAudit(items);
            setNextCursor(systemRes.next_cursor || null);
            setSelectedEventId((current) => current || items[0]?.id || null);
        } catch (e: unknown) {
            setError(toErrorMessage(e, "Failed to load audit stream"));
        } finally {
            setLoading(false);
        }
    };

    const loadMore = async () => {
        if (!nextCursor || loading || loadingMore) return;
        setLoadingMore(true);
        try {
            const systemRes = await observabilityApi.getSystemAudit({
                limit: 150,
                since: sinceIso,
                entity_type: appliedEntityTypeFilter || undefined,
                entity_id: appliedEntityIdFilter || undefined,
                action: appliedActionFilter || undefined,
                include_values: appliedIncludeValues,
                cursor: nextCursor,
            });
            setSystemAudit((current) => mergeUniqueById(current, systemRes.items || []));
            setNextCursor(systemRes.next_cursor || null);
        } catch (e: unknown) {
            toast.error(toErrorMessage(e, "Failed to load more events"));
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        void load();
    }, [appliedRange, appliedEntityTypeFilter, appliedActionFilter, appliedEntityIdFilter, appliedIncludeValues]);

    const hasPendingServerFilters =
        range !== appliedRange ||
        entityTypeFilter !== appliedEntityTypeFilter ||
        actionFilter !== appliedActionFilter ||
        entityIdFilter !== appliedEntityIdFilter ||
        includeValues !== appliedIncludeValues;

    const applyServerFilters = () => {
        setAppliedRange(range);
        setAppliedEntityTypeFilter(entityTypeFilter);
        setAppliedActionFilter(actionFilter);
        setAppliedEntityIdFilter(entityIdFilter);
        setAppliedIncludeValues(includeValues);
    };

    const resetServerFilters = () => {
        setRange("24h");
        setEntityTypeFilter("");
        setActionFilter("");
        setEntityIdFilter("");
        setIncludeValues(false);
        setAppliedRange("24h");
        setAppliedEntityTypeFilter("");
        setAppliedActionFilter("");
        setAppliedEntityIdFilter("");
        setAppliedIncludeValues(false);
    };

    const timeline = useMemo(() => {
        const q = normalize(search);
        return systemAudit
            .filter((item) => toMillis(item.timestamp) >= sinceMillis)
            .filter((item) => filterBySearch(item, q))
            .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
    }, [systemAudit, sinceMillis, search]);

    const entityTypes = useMemo(() => {
        return Array.from(new Set(systemAudit.map((item) => item.entity_type).filter(Boolean))).sort();
    }, [systemAudit]);

    const actions = useMemo(() => {
        return Array.from(new Set(systemAudit.map((item) => item.action).filter(Boolean))).sort();
    }, [systemAudit]);

    const selectedEvent = useMemo(() => {
        if (!selectedEventId) return timeline[0] || null;
        return timeline.find((item) => item.id === selectedEventId) || timeline[0] || null;
    }, [timeline, selectedEventId]);

    useEffect(() => {
        if (selectedEvent) {
            setSelectedEventId(selectedEvent.id);
            if (normalize(selectedEvent.entity_type) === "order") {
                setInspectorOrderId(selectedEvent.order_number || selectedEvent.entity_id);
            }
        } else {
            setSelectedEventId(null);
        }
    }, [selectedEvent?.id]);

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
                let resolved = null as Awaited<ReturnType<typeof ordersApi.resolveOrder>> | null;
                const candidates = withOrderNumberPrefixCandidates(trimmed);
                for (const candidate of candidates) {
                    try {
                        resolved = await ordersApi.resolveOrder(candidate);
                        break;
                    } catch (err: unknown) {
                        const status = (err as { response?: { status?: number } })?.response?.status;
                        const isLast = candidate === candidates[candidates.length - 1];
                        if (status === 404 && !isLast) {
                            continue;
                        }
                        throw err;
                    }
                }

                if (!resolved) {
                    throw new Error("Order could not be resolved");
                }

                resolvedId = resolved.id;
                resolvedOrderNumber = resolved.order_number;
            } else if (!resolvedOrderNumber) {
                const orderDetail = await ordersApi.getOrder(trimmed);
                resolvedOrderNumber = orderDetail?.inflow_order_id || null;
            }

            setInspectorResolved({ id: resolvedId, orderNumber: resolvedOrderNumber });
            setInspectorOrderId(resolvedOrderNumber || trimmed);

            const cached = auditLogCache[resolvedId];
            if (cached) {
                setAuditLogs(cached);
                return;
            }

            const res = await ordersApi.getOrderAudit(resolvedId);
            setAuditLogs(res || []);
            setAuditLogCache((current) => ({
                ...current,
                [resolvedId]: res || [],
            }));

            toast.message("Loaded order audit", {
                description: resolvedOrderNumber ? `Order ${resolvedOrderNumber}` : resolvedId,
            });
        } catch (e: unknown) {
            setAuditLogs([]);
            setInspectorResolved(null);
            setAuditError(toErrorMessage(e, "Failed to load order audit"));
        } finally {
            setAuditLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Audit Explorer</CardTitle>
                    <CardDescription>Server-driven audit stream with entity/action filters and order drill-down.</CardDescription>
                </CardHeader>
                <CardContent>
                    {error ? (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
                            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                            <div className="text-sm text-destructive">{error}</div>
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <div className="xl:col-span-3">
                    <AuditFilterSidebar
                        range={range}
                        setRange={setRange}
                        search={search}
                        setSearch={setSearch}
                        includeValues={includeValues}
                        setIncludeValues={setIncludeValues}
                        entityTypeFilter={entityTypeFilter}
                        setEntityTypeFilter={setEntityTypeFilter}
                        actionFilter={actionFilter}
                        setActionFilter={setActionFilter}
                        entityIdFilter={entityIdFilter}
                        setEntityIdFilter={setEntityIdFilter}
                        entityTypes={entityTypes}
                        actions={actions}
                        onApply={applyServerFilters}
                        onReset={resetServerFilters}
                        hasPendingChanges={hasPendingServerFilters}
                        isApplying={loading}
                    />
                </div>

                <div className="xl:col-span-5">
                    <AuditTimeline
                        timeline={timeline}
                        selectedEventId={selectedEvent?.id || null}
                        onSelectEvent={setSelectedEventId}
                        sinceMillis={sinceMillis}
                        loading={loading}
                        loadingMore={loadingMore}
                        nextCursor={nextCursor}
                        onLoadMore={() => void loadMore()}
                    />
                </div>

                <div className="xl:col-span-4">
                    <AuditInspector
                        selectedEvent={selectedEvent}
                        setEntityTypeFilter={(value) => {
                            setEntityTypeFilter(value);
                            setAppliedEntityTypeFilter(value);
                        }}
                        setActionFilter={(value) => {
                            setActionFilter(value);
                            setAppliedActionFilter(value);
                        }}
                        setEntityIdFilter={(value) => {
                            setEntityIdFilter(value);
                            setAppliedEntityIdFilter(value);
                        }}
                        inspectorOrderId={inspectorOrderId}
                        setInspectorOrderId={setInspectorOrderId}
                        loadOrderAudit={(orderIdentifier, hint) => {
                            void loadOrderAudit(orderIdentifier, hint);
                        }}
                        auditLoading={auditLoading}
                        inspectorResolved={inspectorResolved}
                        auditError={auditError}
                        auditLogs={auditLogs}
                    />
                </div>
            </div>
        </div>
    );
}
