import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import boxTAM from "../assets/boxTAM.svg";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage"));
const DeliveryDashboard = lazy(() => import("./pages/DeliveryDashboard"));
const PreDeliveryQueue = lazy(() => import("./pages/PreDeliveryQueue"));
const InDelivery = lazy(() => import("./pages/InDelivery"));
const Admin = lazy(() => import("./pages/Admin"));
const DocumentSigningPage = lazy(() => import("./pages/DocumentSigningPage"));
const OrderQAChecklist = lazy(() => import("./pages/OrderQAChecklist"));
const OrderQAPage = lazy(() => import("./pages/OrderQAPage"));
const Shipping = lazy(() => import("./pages/Shipping"));
const DeliveryRunDetailPage = lazy(() => import("./pages/DeliveryRunDetailPage"));
const Login = lazy(() => import("./pages/Login"));
const Sessions = lazy(() => import("./pages/Sessions"));

const prefetchRoutes = () => {
    void import("./pages/Dashboard");
    void import("./pages/Orders");
};

function UserMenu() {
    const { user, isAuthenticated, logout } = useAuth();

    if (!isAuthenticated) {
        return (
            <Link to="/login" className="text-white font-medium hover:text-gray-200">
                Sign In
            </Link>
        );
    }

    return (
        <div className="flex items-center gap-3">
            <Link to="/sessions" className="text-white/80 hover:text-white text-sm">
                {user?.display_name || user?.email}
            </Link>
            <button
                onClick={logout}
                className="text-sm text-white/60 hover:text-white"
            >
                Sign Out
            </button>
        </div>
    );
}

function AppContent() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        const idleCallback = window.requestIdleCallback || ((cb: IdleRequestCallback) => window.setTimeout(cb, 250));
        const idleCancel = window.cancelIdleCallback || window.clearTimeout;
        const id = idleCallback(() => {
            prefetchRoutes();
        });
        return () => idleCancel(id as number);
    }, []);

    return (
        <div className="min-h-[100dvh] bg-white flex flex-col">
            {/* HEADER */}
            <nav className="bg-maroon-700 shadow mb-4">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
                        {/* Logo + Title (links to Orders) */}
                        <Link to="/" className="flex items-center gap-3">
                            <img src={boxTAM} alt="boxTAM logo" className="h-8 w-auto" />
                            <h1 className="text-xl font-bold text-white">
                                TechHub
                            </h1>
                        </Link>

                        {/* Top nav */}
                        <nav className="flex flex-wrap items-center gap-2 text-sm md:text-base md:gap-4 w-full md:w-auto">
                            <Link to="/" className="text-white font-medium hover:text-gray-200">
                                Dashboard
                            </Link>

                            <Link to="/orders" className="text-white font-medium hover:text-gray-200">
                                Orders
                            </Link>

                            <Link to="/order-qa" className="text-white font-medium hover:text-gray-200">
                                QA
                            </Link>

                            <Link to="/delivery" className="text-white font-medium hover:text-gray-200">
                                Delivery
                            </Link>

                            <Link to="/admin" className="text-white font-medium hover:text-gray-200">
                                Admin
                            </Link>

                            <div className="hidden md:block border-l border-white/30 h-6 mx-2"></div>

                            <div className="flex items-center gap-3 md:ml-auto">
                                <UserMenu />
                            </div>
                        </nav>
                    </div>
                </div>
            </nav>

            {/* MAIN */}
            <main className="flex-1 max-w-7xl mx-auto w-full px-3 md:px-4 flex flex-col">
                <Suspense fallback={<div className="flex items-center justify-center w-full py-10 text-sm text-muted-foreground">Loading...</div>}>
                    <Routes>
                        {/* Public routes */}
                        <Route path="/login" element={<Login />} />

                        {/* Protected routes */}
                        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                        <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
                        <Route path="/orders/:orderId" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
                        <Route path="/orders/:orderId/qa" element={<ProtectedRoute><OrderQAPage /></ProtectedRoute>} />
                        <Route path="/order-qa" element={<ProtectedRoute><OrderQAChecklist /></ProtectedRoute>} />
                        <Route path="/delivery" element={<ProtectedRoute><DeliveryDashboard /></ProtectedRoute>} />
                        <Route path="/delivery/runs/:runId" element={<ProtectedRoute><DeliveryRunDetailPage /></ProtectedRoute>} />
                        <Route path="/shipping" element={<ProtectedRoute><Shipping /></ProtectedRoute>} />
                        <Route path="/pre-delivery" element={<ProtectedRoute><PreDeliveryQueue /></ProtectedRoute>} />
                        <Route path="/in-delivery" element={<ProtectedRoute><InDelivery /></ProtectedRoute>} />
                        <Route path="/document-signing" element={<ProtectedRoute><DocumentSigningPage /></ProtectedRoute>} />
                        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
                        <Route path="/sessions" element={<ProtectedRoute><Sessions /></ProtectedRoute>} />
                    </Routes>
                </Suspense>
            </main>

            {/* FOOTER */}
            <footer className="bg-maroon-700 text-white mt-8">
                <div className="max-w-7xl mx-auto px-4 py-4 text-center text-sm">
                    © {new Date().getFullYear()} TechHub • All rights reserved
                </div>
            </footer>
        </div>
    );
}

function App() {
    return (
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </BrowserRouter>
    );
}

export default App;
