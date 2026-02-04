/**
 * Sessions Page
 *
 * Allows users to view and manage their active login sessions.
 */

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Monitor } from "lucide-react";
import { toast } from "sonner";
import { useAuth, Session } from "../contexts/AuthContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";

function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString();
}

function parseUserAgent(ua: string | null): string {
    if (!ua) return "Unknown device";
    // Simple extraction - could use a library for more detail
    if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS Device";
    if (ua.includes("Android")) return "Android Device";
    if (ua.includes("Windows")) return "Windows PC";
    if (ua.includes("Mac")) return "Mac";
    if (ua.includes("Linux")) return "Linux";
    return "Unknown device";
}

export default function Sessions() {
    const { user, logout } = useAuth();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");

    const fetchSessions = async () => {
        try {
            const response = await axios.get('/auth/sessions', {
                withCredentials: true,
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                },
                params: { _t: Date.now() }
            });

            const data = response.data as unknown;
            if (!data || typeof data !== 'object' || !Array.isArray((data as any).sessions)) {
                throw new Error('Invalid sessions response');
            }

            setSessions((data as any).sessions);
            setError(null);
        } catch (err) {
            setError('Failed to load sessions');
            setSessions([]); // Reset to empty array on error
            console.error('Failed to load sessions:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const revokeSession = async (sessionId: string) => {
        try {
            await axios.post('/auth/sessions/revoke', { session_id: sessionId }, { withCredentials: true });
            await fetchSessions();
            toast.success("Session signed out");
        } catch (err) {
            setError('Failed to revoke session');
            console.error('Failed to revoke session:', err);
            toast.error("Failed to sign out session");
        }
    };

    const revokeAllOtherSessions = async () => {
        try {
            await axios.post('/auth/sessions/revoke_all', {}, { withCredentials: true });
            await fetchSessions();
            toast.success("Signed out of other sessions");
        } catch (err) {
            setError('Failed to revoke sessions');
            console.error('Failed to revoke sessions:', err);
            toast.error("Failed to sign out other sessions");
        }
    };

    const filteredSessions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return sessions;

        return sessions.filter((s) => {
            const device = parseUserAgent(s.user_agent).toLowerCase();
            const ip = (s.ip_address ?? "").toLowerCase();
            return device.includes(q) || ip.includes(q);
        });
    }, [query, sessions]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-4xl py-6 space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div className="space-y-1">
                            <CardTitle>Active Sessions</CardTitle>
                            <CardDescription>
                                Logged in as <span className="font-medium">{user?.email}</span>
                            </CardDescription>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="w-full sm:w-72">
                                <Input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search by device or IP"
                                    aria-label="Search sessions"
                                />
                            </div>

                            {sessions.length > 1 && (
                                <Button
                                    variant="outline"
                                    onClick={revokeAllOtherSessions}
                                    className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                                >
                                    Sign out others
                                </Button>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}
                </CardHeader>

                <CardContent className="p-0">
                    {filteredSessions.map((session) => (
                        <div
                            key={session.id}
                            className="flex items-start justify-between gap-4 border-t border-border px-6 py-4"
                        >
                            <div className="flex items-start gap-4">
                                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                    <Monitor className="h-5 w-5" aria-hidden="true" />
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <div className="font-medium text-foreground">
                                            {parseUserAgent(session.user_agent)}
                                        </div>
                                        {session.is_current && (
                                            <Badge variant="success">Current</Badge>
                                        )}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        {session.ip_address || "Unknown IP"} - Last active {formatDate(session.last_seen_at)}
                                    </div>
                                </div>
                            </div>

                            {!session.is_current && (
                                <Button
                                    variant="outline"
                                    onClick={() => revokeSession(session.id)}
                                    className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                                >
                                    Sign out
                                </Button>
                            )}
                        </div>
                    ))}

                    {filteredSessions.length === 0 && (
                        <div className="border-t border-border px-6 py-12 text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                <Monitor className="h-6 w-6" aria-hidden="true" />
                            </div>
                            <div className="mt-4 font-medium text-foreground">
                                No sessions found
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                                Try a different search, or check back after logging in on another device.
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button variant="destructive" onClick={logout}>
                    Sign out of this device
                </Button>
            </div>
        </div>
    );
}
