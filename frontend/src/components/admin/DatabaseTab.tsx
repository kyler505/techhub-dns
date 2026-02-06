import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import observabilityApi, {
    SchemaRelationship,
    SchemaSummaryResponse,
    SchemaTable,
    TableStat,
    TableStatsResponse,
} from "../../api/observability";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../ui/table";

type PositionedTable = {
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
};

const formatMaybeDate = (value?: string | null) => {
    if (!value) return "-";
    const ms = new Date(value).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return value;
    return new Date(ms).toLocaleString();
};

const TABLE_LAYOUT: PositionedTable[] = [
    { name: "users", x: 40, y: 40, w: 220, h: 70 },
    { name: "sessions", x: 40, y: 140, w: 220, h: 70 },
    { name: "delivery_runs", x: 340, y: 40, w: 260, h: 70 },
    { name: "orders", x: 340, y: 140, w: 260, h: 70 },
    { name: "audit_logs", x: 340, y: 240, w: 260, h: 70 },
    { name: "system_audit_logs", x: 40, y: 240, w: 220, h: 70 },
];

const getBoxCenter = (t: PositionedTable) => ({ cx: t.x + t.w / 2, cy: t.y + t.h / 2 });

export default function DatabaseTab() {
    const [schema, setSchema] = useState<SchemaSummaryResponse | null>(null);
    const [stats, setStats] = useState<TableStatsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedTable, setSelectedTable] = useState<string>("orders");

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [schemaRes, statsRes] = await Promise.all([
                observabilityApi.getSchemaSummary(),
                observabilityApi.getTableStats(),
            ]);
            setSchema(schemaRes);
            setStats(statsRes);
        } catch (e: any) {
            setError(e?.response?.data?.error || e?.message || "Failed to load database observability");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const tablesByName = useMemo(() => {
        const map = new Map<string, SchemaTable>();
        for (const t of schema?.tables || []) {
            map.set(t.name, t);
        }
        return map;
    }, [schema]);

    const selected = tablesByName.get(selectedTable);

    const statsByTable = useMemo(() => {
        const map = new Map<string, TableStat>();
        for (const s of stats?.tables || []) {
            map.set(s.table, s);
        }
        return map;
    }, [stats]);

    const relationships = useMemo(() => {
        const rels: SchemaRelationship[] = schema?.relationships || [];
        const allow = new Set(TABLE_LAYOUT.map((t) => t.name));
        return rels.filter((r) => allow.has(r.from_table) && allow.has(r.to_table));
    }, [schema]);

    const diagramView = { w: 680, h: 360 };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle className="text-base">Database</CardTitle>
                        <CardDescription>Schema + table-level stats only (no row browsing).</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                void load();
                                toast.message("Refreshing database observability");
                            }}
                            disabled={loading}
                            className="btn-lift"
                        >
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refresh
                        </Button>
                    </div>
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

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                <Card className="xl:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base">Schema diagram</CardTitle>
                        <CardDescription>Click a table to inspect its columns (allowlisted).</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-lg border bg-muted/10 p-3 overflow-auto">
                            <svg
                                viewBox={`0 0 ${diagramView.w} ${diagramView.h}`}
                                className="min-w-[680px] w-full"
                                role="img"
                                aria-label="Database schema diagram"
                            >
                                <defs>
                                    <marker
                                        id="arrow"
                                        viewBox="0 0 10 10"
                                        refX="9"
                                        refY="5"
                                        markerWidth="6"
                                        markerHeight="6"
                                        orient="auto-start-reverse"
                                    >
                                        <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--border))" />
                                    </marker>
                                </defs>

                                {/* Relationships */}
                                {relationships.map((rel) => {
                                    const from = TABLE_LAYOUT.find((t) => t.name === rel.from_table);
                                    const to = TABLE_LAYOUT.find((t) => t.name === rel.to_table);
                                    if (!from || !to) return null;
                                    const a = getBoxCenter(from);
                                    const b = getBoxCenter(to);
                                    const selectedEdge = selectedTable === rel.from_table || selectedTable === rel.to_table;
                                    return (
                                        <g key={`${rel.from_table}.${rel.from_column}->${rel.to_table}.${rel.to_column}`} opacity={selectedEdge ? 1 : 0.55}>
                                            <line
                                                x1={a.cx}
                                                y1={a.cy}
                                                x2={b.cx}
                                                y2={b.cy}
                                                stroke={selectedEdge ? "hsl(var(--primary))" : "hsl(var(--border))"}
                                                strokeWidth={selectedEdge ? 2.5 : 2}
                                                markerEnd="url(#arrow)"
                                            />
                                        </g>
                                    );
                                })}

                                {/* Tables */}
                                {TABLE_LAYOUT.map((t) => {
                                    const isSelected = t.name === selectedTable;
                                    return (
                                        <g
                                            key={t.name}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setSelectedTable(t.name)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") setSelectedTable(t.name);
                                            }}
                                            style={{ cursor: "pointer" }}
                                        >
                                            <rect
                                                x={t.x}
                                                y={t.y}
                                                width={t.w}
                                                height={t.h}
                                                rx={10}
                                                fill={isSelected ? "hsl(var(--muted))" : "hsl(var(--background))"}
                                                stroke={isSelected ? "hsl(var(--primary))" : "hsl(var(--border))"}
                                                strokeWidth={isSelected ? 2.5 : 2}
                                            />
                                            <text
                                                x={t.x + 12}
                                                y={t.y + 26}
                                                fontSize={14}
                                                fill="currentColor"
                                                className="text-foreground"
                                            >
                                                {t.name}
                                            </text>
                                            <text
                                                x={t.x + 12}
                                                y={t.y + 48}
                                                fontSize={11}
                                                fill="currentColor"
                                                className="text-muted-foreground"
                                            >
                                                {statsByTable.get(t.name)?.row_count != null
                                                    ? `${statsByTable.get(t.name)?.row_count} rows`
                                                    : "rows: -"}
                                            </text>
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Table inspector</CardTitle>
                        <CardDescription>Columns are filtered to avoid secrets/token fields.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            {TABLE_LAYOUT.map((t) => (
                                <Button
                                    key={t.name}
                                    type="button"
                                    size="sm"
                                    variant={selectedTable === t.name ? "default" : "outline"}
                                    className="btn-lift"
                                    onClick={() => setSelectedTable(t.name)}
                                >
                                    {t.name}
                                </Button>
                            ))}
                        </div>

                        {selected ? (
                            <div className="rounded-lg border bg-card">
                                <div className="flex items-center justify-between gap-2 border-b p-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-foreground">{selected.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {selected.columns.length} column{selected.columns.length === 1 ? "" : "s"}
                                        </div>
                                    </div>
                                    <Badge variant="secondary">schema</Badge>
                                </div>
                                <div className="max-h-[360px] overflow-auto p-3">
                                    <div className="space-y-2">
                                        {selected.columns.map((c) => (
                                            <div key={c.name} className="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-mono text-foreground break-words">{c.name}</div>
                                                    <div className="text-xs text-muted-foreground break-words">{c.type}</div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {c.is_pk ? <Badge variant="success">PK</Badge> : null}
                                                    {c.is_fk ? <Badge variant="outline">FK</Badge> : null}
                                                    {c.nullable === false ? <Badge variant="secondary">NOT NULL</Badge> : null}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed bg-card p-4 text-center">
                                <p className="text-sm font-medium text-foreground">Schema not available</p>
                                <p className="text-xs text-muted-foreground mt-1">This environment may not have all tables.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Table stats</CardTitle>
                    <CardDescription>Row count + freshness (max timestamp for allowlisted columns).</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading && !stats ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading stats...
                        </div>
                    ) : (
                        <div className="rounded-lg border bg-card overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Table</TableHead>
                                        <TableHead className="text-right">Row count</TableHead>
                                        <TableHead>Last updated</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(stats?.tables || []).map((s) => (
                                        <TableRow key={s.table}>
                                            <TableCell className="font-mono">
                                                <button
                                                    type="button"
                                                    className="underline underline-offset-2"
                                                    onClick={() => setSelectedTable(s.table)}
                                                >
                                                    {s.table}
                                                </button>
                                            </TableCell>
                                            <TableCell className="text-right">{s.row_count}</TableCell>
                                            <TableCell className="text-muted-foreground">{formatMaybeDate(s.last_updated)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
