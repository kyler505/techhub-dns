/**
 * Protected Route Component
 *
 * Wraps routes that require authentication.
 * Redirects to login if user is not authenticated.
 */

import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
    children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        // Show loading spinner while checking auth
        return (
            <div className="flex items-center justify-center w-full h-full flex-1">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-maroon-700"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        if (typeof window !== 'undefined') {
            const destination = `${location.pathname}${location.search}${location.hash}`;
            try {
                window.sessionStorage.setItem('auth:returnTo', destination);
            } catch (_error) {
                // Ignore storage write failures and fall back to router state.
            }
        }

        // Redirect to login, preserving the intended destination
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
}
