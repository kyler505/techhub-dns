/**
 * Login Page
 *
 * TAMU-branded login page with SSO button.
 */

import { useAuth } from '../contexts/AuthContext';
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Login() {
    const { isAuthenticated, isLoading, login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Redirect if already authenticated
    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            const from = (location.state as any)?.from?.pathname || '/';
            navigate(from, { replace: true });
        }
    }, [isAuthenticated, isLoading, navigate, location]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-maroon-700"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full space-y-8 p-8">
                <div className="text-center">
                    {/* TAMU Logo/Branding */}
                    <div className="mx-auto h-16 w-16 bg-maroon-700 rounded-lg flex items-center justify-center mb-4">
                        <span className="text-white text-2xl font-bold">TH</span>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900">TechHub Delivery</h1>
                    <p className="mt-2 text-gray-600">Sign in to manage deliveries</p>
                </div>

                <div className="mt-8 space-y-4">
                    <button
                        onClick={login}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-transparent text-lg font-medium rounded-lg text-white bg-maroon-700 hover:bg-maroon-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-maroon-500 transition-colors"
                    >
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M11.5 2.5H2.5V11.5H11.5V2.5Z" />
                            <path d="M21.5 2.5H12.5V11.5H21.5V2.5Z" />
                            <path d="M11.5 12.5H2.5V21.5H11.5V12.5Z" />
                            <path d="M21.5 12.5H12.5V21.5H21.5V12.5Z" />
                        </svg>
                        Sign in with TAMU NetID
                    </button>
                </div>

                <p className="mt-4 text-center text-sm text-gray-500">
                    Use your Texas A&M University credentials
                </p>
            </div>
        </div>
    );
}
