/**
 * Sessions Page
 *
 * Allows users to view and manage their active login sessions.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../contexts/AuthContext';
import {
    getSessionsQueryOptions,
    revokeAllOtherSessions as revokeAllOtherSessionsRequest,
    revokeSession as revokeSessionRequest,
    sessionsQueryKeys,
} from '../queries/sessions';
import { formatToCentralTime } from '../utils/timezone';

export default function Sessions() {
    const { user, logout } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const queryClient = useQueryClient();

    const sessionsQuery = useQuery({
        ...getSessionsQueryOptions(),
        retry: false,
    });

    const sessions = sessionsQuery.data ?? [];
    const isLoading = sessionsQuery.isPending;

    const revokeSessionMutation = useMutation({
        mutationFn: revokeSessionRequest,
        onSuccess: async () => {
            setError(null);
            await queryClient.invalidateQueries({ queryKey: sessionsQueryKeys.all });
        },
        onError: (err) => {
            setError('Failed to revoke session');
            console.error('Failed to revoke session:', err);
        },
    });

    const revokeAllSessionsMutation = useMutation({
        mutationFn: revokeAllOtherSessionsRequest,
        onSuccess: async () => {
            setError(null);
            await queryClient.invalidateQueries({ queryKey: sessionsQueryKeys.all });
        },
        onError: (err) => {
            setError('Failed to revoke sessions');
            console.error('Failed to revoke sessions:', err);
        },
    });

    const revokeSession = async (sessionId: string) => {
        await revokeSessionMutation.mutateAsync(sessionId);
    };

    const revokeAllOtherSessions = async () => {
        await revokeAllSessionsMutation.mutateAsync();
    };

const formatDate = (dateString: string) => {
    return formatToCentralTime(dateString);
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
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-maroon-700"></div>
            </div>
        );
    }

    const isMutating = revokeSessionMutation.isPending || revokeAllSessionsMutation.isPending;
    const effectiveError = error ?? (sessionsQuery.isError ? 'Failed to load sessions' : null);

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Active Sessions</h1>
                <p className="text-gray-600 mt-1">
                    Logged in as <strong>{user?.email}</strong>
                </p>
            </div>

            {effectiveError && (
                <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
                    {effectiveError}
                </div>
            )}

            <div className="bg-white shadow rounded-lg divide-y">
                {sessions?.map((session) => (
                    <div key={session.id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                                <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <div>
                                <div className="font-medium text-gray-900 flex items-center gap-2">
                                    {parseUserAgent(session.user_agent)}
                                    {session.is_current && (
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                            Current
                                        </span>
                                    )}
                                </div>
                                <div className="text-sm text-gray-500">
                                    {session.ip_address || 'Unknown IP'} • Last active {formatDate(session.last_seen_at)}
                                </div>
                            </div>
                        </div>

                        {!session.is_current && (
                            <button
                                onClick={() => revokeSession(session.id)}
                                disabled={isMutating}
                                className="text-sm text-red-600 hover:text-red-800 font-medium"
                            >
                                Sign out
                            </button>
                        )}
                    </div>
                ))}
                {sessions.length === 0 && !isLoading && (
                    <div className="p-8 text-center text-gray-500">
                        <svg className="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <p>No active sessions found</p>
                        <p className="text-sm mt-1">Sessions from other devices will appear here</p>
                    </div>
                )}
            </div>

            {sessions.length > 1 && (
                <div className="mt-6 flex gap-4">
                    <button
                        onClick={revokeAllOtherSessions}
                        disabled={isMutating}
                        className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-800"
                    >
                        Sign out of all other sessions
                    </button>
                </div>
            )}

            <div className="mt-8 pt-8 border-t">
                <button
                    onClick={logout}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                    Sign out of this device
                </button>
            </div>
        </div>
    );
}
