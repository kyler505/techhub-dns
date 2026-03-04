/**
 * Sessions Page
 *
 * Allows users to view and manage their active login sessions.
 */

import { useState, useEffect } from 'react';
import { useAuth, Session } from '../contexts/AuthContext';
import axios from 'axios';

export default function Sessions() {
    const { user, logout } = useAuth();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
        } catch (err) {
            setError('Failed to revoke session');
            console.error('Failed to revoke session:', err);
        }
    };

    const revokeAllOtherSessions = async () => {
        try {
            await axios.post('/auth/sessions/revoke_all', {}, { withCredentials: true });
            await fetchSessions();
        } catch (err) {
            setError('Failed to revoke sessions');
            console.error('Failed to revoke sessions:', err);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    const parseUserAgent = (ua: string | null): string => {
        if (!ua) return 'Unknown device';
        // Simple extraction - could use a library for more detail
        if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS Device';
        if (ua.includes('Android')) return 'Android Device';
        if (ua.includes('Windows')) return 'Windows PC';
        if (ua.includes('Mac')) return 'Mac';
        if (ua.includes('Linux')) return 'Linux';
        return 'Unknown device';
    };

    if (isLoading) {
        return (
            <div className="container mx-auto py-6">
                <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-maroon-900/10 bg-gradient-to-br from-maroon-50 via-background to-background">
                    <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-maroon-700"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-4xl py-6 space-y-4">
            <div className="rounded-xl border border-maroon-900/10 bg-gradient-to-br from-maroon-50 via-background to-background p-5 sm:p-6">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-maroon-700">Security</div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Active Sessions</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Logged in as <strong>{user?.email}</strong>
                </p>
            </div>

            {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-destructive">
                    {error}
                </div>
            )}

            <div className="overflow-hidden rounded-lg border border-maroon-900/10 bg-card divide-y">
                {sessions?.map((session) => (
                    <div key={session.id} className="flex items-center justify-between p-4 hover:bg-muted/30">
                        <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-maroon-50">
                                <svg className="h-5 w-5 text-maroon-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 font-medium text-foreground">
                                    {parseUserAgent(session.user_agent)}
                                    {session.is_current && (
                                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                                            Current
                                        </span>
                                    )}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    {session.ip_address || 'Unknown IP'} • Last active {formatDate(session.last_seen_at)}
                                </div>
                            </div>
                        </div>

                        {!session.is_current && (
                            <button
                                onClick={() => revokeSession(session.id)}
                                className="text-sm font-medium text-destructive hover:opacity-80"
                            >
                                Sign out
                            </button>
                        )}
                    </div>
                ))}
                {sessions.length === 0 && !isLoading && (
                    <div className="p-8 text-center text-muted-foreground">
                        <svg className="mx-auto mb-3 h-12 w-12 text-maroon-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <p>No active sessions found</p>
                        <p className="text-sm mt-1">Sessions from other devices will appear here</p>
                    </div>
                )}
            </div>

            {sessions.length > 1 && (
                <div className="flex gap-4">
                    <button
                        onClick={revokeAllOtherSessions}
                        className="rounded-md border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/5"
                    >
                        Sign out of all other sessions
                    </button>
                </div>
            )}

            <div className="border-t border-maroon-900/10 pt-6">
                <button
                    onClick={logout}
                    className="rounded-lg bg-primary px-4 py-2 text-white transition-colors hover:bg-primary/90"
                >
                    Sign out of this device
                </button>
            </div>
        </div>
    );
}
