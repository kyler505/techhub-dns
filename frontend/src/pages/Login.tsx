/**
 * Login Page
 *
 * Minimal TAMU-branded login page with SSO button.
 */

import { useAuth } from '../contexts/AuthContext';
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import boxTAM from '../../assets/boxTAM.svg';

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
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-maroon-700"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
                {/* A&M Logo */}
                <img
                    src={boxTAM}
                    alt="Texas A&M University"
                    className="mx-auto h-24 w-auto mb-8"
                />

                <button
                    onClick={login}
                    className="px-8 py-3 text-lg font-medium rounded-lg text-white bg-maroon-700 hover:bg-maroon-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-maroon-500 transition-colors"
                >
                    Sign in with NetID
                </button>
            </div>
        </div>
    );
}
