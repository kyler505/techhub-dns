import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { adminsApi, GetAdminsResponse } from "../../api/admins";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../ui/table";

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const looksLikeEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(value.trim());

export default function AdminsTab() {
    const [data, setData] = useState<GetAdminsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [draft, setDraft] = useState<string[]>([]);
    const [newEmail, setNewEmail] = useState("");

    const source = data?.source;
    const readOnly = source === "env";

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await adminsApi.getAdmins();
            setData(res);
            setDraft(res.admins || []);
        } catch (e: any) {
            const msg = e?.response?.data?.error || e?.message || "Failed to load admin allowlist";
            setError(msg);
            toast.error("Failed to load admins", { description: msg });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const sortedDraft = useMemo(() => {
        const uniq = Array.from(new Set(draft.map(normalizeEmail).filter(Boolean)));
        uniq.sort();
        return uniq;
    }, [draft]);

    const isDirty = useMemo(() => {
        const a = (data?.admins || []).slice().sort().join("|");
        const b = sortedDraft.slice().sort().join("|");
        return a !== b;
    }, [data?.admins, sortedDraft]);

    const add = () => {
        const email = normalizeEmail(newEmail);
        if (!email) return;
        if (!looksLikeEmail(email)) {
            toast.error("Invalid email", { description: "Enter a valid email address." });
            return;
        }
        if (sortedDraft.includes(email)) {
            setNewEmail("");
            return;
        }
        setDraft((prev) => [...prev, email]);
        setNewEmail("");
    };

    const remove = (email: string) => {
        setDraft((prev) => prev.filter((e) => normalizeEmail(e) !== normalizeEmail(email)));
    };

    const save = async () => {
        if (readOnly) return;
        setSaving(true);
        try {
            const res = await adminsApi.updateAdmins(sortedDraft);
            setData(res);
            setDraft(res.admins || []);
            toast.success("Admin allowlist updated", {
                description: `${(res.admins || []).length} admin${(res.admins || []).length === 1 ? "" : "s"}`,
            });
        } catch (e: any) {
            const status = e?.response?.status;
            const msg = e?.response?.data?.error || e?.message || "Failed to update admin allowlist";
            if (status === 409) {
                toast.error("Admin allowlist is read-only", { description: msg });
            } else {
                toast.error("Failed to update admins", { description: msg });
            }
        } finally {
            setSaving(false);
        }
    };

    const banner =
        source === "env" ? (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">ADMIN_EMAILS override is active</div>
                    <div className="text-xs text-muted-foreground mt-1">
                        This allowlist is managed via environment variables. Editing is disabled and API updates will be rejected.
                    </div>
                </div>
            </div>
        ) : source === "default" ? (
            <div className="flex items-start gap-2 rounded-md border bg-muted/20 p-3">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">No allowlist configured</div>
                    <div className="text-xs text-muted-foreground mt-1">
                        In development, any authenticated user is treated as an admin. In non-development, admin access fails closed.
                    </div>
                </div>
            </div>
        ) : null;

    const sourceBadge = source === "env" ? "warning" : source === "db" ? "success" : "secondary";

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <CardTitle className="text-base">Admins</CardTitle>
                        <CardDescription>Manage the admin email allowlist (DB-backed unless overridden by env).</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        {source ? <Badge variant={sourceBadge as any}>{source}</Badge> : null}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                void load();
                                toast.message("Refreshing admin allowlist");
                            }}
                            disabled={loading || saving}
                            className="btn-lift"
                        >
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refresh
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {banner}

                    {error ? (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
                            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                            <div className="text-sm text-destructive">{error}</div>
                        </div>
                    ) : null}

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                            type="email"
                            placeholder="admin@example.com"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            disabled={readOnly || loading || saving}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") add();
                            }}
                        />
                        <Button type="button" onClick={add} disabled={readOnly || loading || saving || !newEmail.trim()} className="btn-lift">
                            <Plus className="mr-2 h-4 w-4" />
                            Add
                        </Button>
                        <Button
                            type="button"
                            variant="default"
                            onClick={() => void save()}
                            disabled={readOnly || loading || saving || !isDirty}
                            className="btn-lift"
                        >
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save
                        </Button>
                    </div>

                    <div className="rounded-lg border bg-card overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Email</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedDraft.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={2} className="text-sm text-muted-foreground">
                                            No admins configured.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    sortedDraft.map((email) => (
                                        <TableRow key={email}>
                                            <TableCell className="font-mono text-sm">{email}</TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => remove(email)}
                                                    disabled={readOnly || loading || saving}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    Remove
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {data?.env_admins && data.env_admins.length > 0 && source !== "env" ? (
                        <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                            Env allowlist detected: <span className="font-mono">{data.env_admins.join(", ")}</span>
                        </div>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}
