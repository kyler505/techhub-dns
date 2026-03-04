import { Search } from "lucide-react";

import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Checkbox } from "../../ui/checkbox";
import { Input } from "../../ui/input";

type TimeRange = "1h" | "24h" | "7d";

interface AuditFilterSidebarProps {
    range: TimeRange;
    setRange: (range: TimeRange) => void;
    search: string;
    setSearch: (value: string) => void;
    includeValues: boolean;
    setIncludeValues: (value: boolean) => void;
    entityTypeFilter: string;
    setEntityTypeFilter: (value: string) => void;
    actionFilter: string;
    setActionFilter: (value: string) => void;
    entityIdFilter: string;
    setEntityIdFilter: (value: string) => void;
    entityTypes: string[];
    actions: string[];
}

export default function AuditFilterSidebar({
    range,
    setRange,
    search,
    setSearch,
    includeValues,
    setIncludeValues,
    entityTypeFilter,
    setEntityTypeFilter,
    actionFilter,
    setActionFilter,
    entityIdFilter,
    setEntityIdFilter,
    entityTypes,
    actions,
}: AuditFilterSidebarProps) {
    return (
        <Card className="border-maroon-900/10">
            <CardHeader>
                <CardTitle className="text-base">Filters</CardTitle>
                <CardDescription>Time range, text search, and entity pivots.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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

                <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search entity, action, id, user, or text..."
                        className="pl-9"
                    />
                </div>

                <Checkbox checked={includeValues} onChange={(e) => setIncludeValues(e.target.checked)} label="Include payload values" />

                <div className="space-y-2">
                    <Input value={entityTypeFilter} onChange={(e) => setEntityTypeFilter(e.target.value)} placeholder="Filter entity type" />
                    <Input value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} placeholder="Filter action" />
                    <Input value={entityIdFilter} onChange={(e) => setEntityIdFilter(e.target.value)} placeholder="Filter entity id" />
                </div>

                <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Entity types</div>
                    <div className="flex flex-wrap gap-2">
                        {entityTypes.slice(0, 10).map((entityType) => (
                            <Button
                                key={entityType}
                                type="button"
                                size="sm"
                                variant={entityTypeFilter === entityType ? "default" : "outline"}
                                onClick={() => setEntityTypeFilter(entityTypeFilter === entityType ? "" : entityType)}
                            >
                                {entityType}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Actions</div>
                    <div className="flex flex-wrap gap-2">
                        {actions.slice(0, 10).map((action) => (
                            <Button
                                key={action}
                                type="button"
                                size="sm"
                                variant={actionFilter === action ? "default" : "outline"}
                                onClick={() => setActionFilter(actionFilter === action ? "" : action)}
                            >
                                {action}
                            </Button>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
