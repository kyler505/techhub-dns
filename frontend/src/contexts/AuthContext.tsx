/**
 * Authentication Context and Provider
 *
 * Provides authentication state and functions throughout the app.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from '../api/client';

export interface User {
    id: string;
    email: string;
    display_name: string | null;
    department: string | null;
    created_at: string;
    last_login_at: string;
}

export interface Session {
    id: string;
    created_at: string;
    expires_at: string;
    last_seen_at: string;
    user_agent: string | null;
    ip_address: string | null;
    is_current: boolean;
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: () => void;
    logout: () => Promise<void>;
    refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refreshAuth = async () => {
        try {
            const response = await apiClient.get('/auth/me');
            setUser(response.data.user);
            setSession(response.data.session);
        } catch (error) {
            // Not authenticated or error - clear state
            setUser(null);
            setSession(null);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        refreshAuth();
    }, []);

    const login = () => {
        // Redirect to SAML login endpoint
        // The backend will redirect to TAMU SSO
        window.location.href = '/auth/saml/login?next=' + encodeURIComponent(window.location.pathname);
    };

    const logout = async () => {
        try {
            await apiClient.post('/auth/logout');
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setUser(null);
            setSession(null);
            // Redirect to login page
            window.location.href = '/login';
        }
    };

    const value: AuthContextType = {
        user,
        session,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshAuth,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
