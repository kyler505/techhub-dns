import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Sidebar } from "./components/Sidebar";
import { Skeleton } from "./components/Skeleton";
import { Breadcrumbs } from "./components/Breadcrumbs";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage"));
const DeliveryDashboard = lazy(() => import("./pages/DeliveryDashboard"));
const Shipping = lazy(() => import("./pages/Shipping"));
const Admin = lazy(() => import("./pages/Admin"));
const DocumentSigningPage = lazy(() => import("./pages/DocumentSigningPage"));
const OrderQAChecklist = lazy(() => import("./pages/OrderQAChecklist"));
const OrderQAPage = lazy(() => import("./pages/OrderQAPage"));
const DeliveryRunDetailPage = lazy(() => import("./pages/DeliveryRunDetailPage"));
const Login = lazy(() => import("./pages/Login"));
const Sessions = lazy(() => import("./pages/Sessions"));

const prefetchRoutes = () => {
    void import("./pages/Dashboard");
    void import("./pages/Orders");
};

function AppContent() {
    const { isAuthenticated } = useAuth();
    const location = useLocation();

    useEffect(() => {
        if (typeof window === "undefined") return;
        const idleCallback = window.requestIdleCallback || ((cb: IdleRequestCallback) => window.setTimeout(cb, 250));
        const idleCancel = window.cancelIdleCallback || window.clearTimeout;
        const id = idleCallback(() => {
            prefetchRoutes();
        });
        return () => idleCancel(id as number);
    }, []);

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Suspense fallback={<Skeleton className="w-96 h-96 rounded-lg" />}>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="*" element={<Navigate to="/login" replace />} />
                    </Routes>
                </Suspense>
            </div>
        );
    }

	return (
		<div className="min-h-screen bg-background">
				<Sidebar />

				<main className="ml-[var(--sidebar-width)] min-h-screen transition-[margin] duration-300">
					<div className="sticky top-0 z-30 h-11 sm:h-12 bg-background/80 backdrop-blur-sm border-b border-border">
						<div className="h-full flex items-center px-6 lg:px-8">
							<Breadcrumbs />
						</div>
					</div>

                    <div className="p-6 lg:p-8">
                        <Suspense fallback={
                            <div className="space-y-4">
                                <Skeleton className="h-8 w-64" />
                                <Skeleton className="h-64 w-full rounded-lg" />
                            </div>
                        }>
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={location.pathname}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Routes location={location}>
                                        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                                        <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
                                        <Route path="/orders/:orderId" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
                                        <Route path="/orders/:orderId/qa" element={<ProtectedRoute><OrderQAPage /></ProtectedRoute>} />
                                        <Route path="/order-qa" element={<ProtectedRoute><OrderQAChecklist /></ProtectedRoute>} />
                                        <Route path="/delivery" element={<ProtectedRoute><DeliveryDashboard /></ProtectedRoute>} />
                                        <Route path="/delivery/runs/:runId" element={<ProtectedRoute><DeliveryRunDetailPage /></ProtectedRoute>} />
                                        <Route path="/shipping" element={<ProtectedRoute><Shipping /></ProtectedRoute>} />
                                        <Route path="/document-signing" element={<ProtectedRoute><DocumentSigningPage /></ProtectedRoute>} />
                                        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
                                        <Route path="/sessions" element={<ProtectedRoute><Sessions /></ProtectedRoute>} />
                                        <Route path="/login" element={<Navigate to="/" replace />} />
                                    </Routes>
                                </motion.div>
                            </AnimatePresence>
                        </Suspense>
                    </div>
                </main>

					<Toaster
						position="top-right"
						toastOptions={{
							style: {
								background: "hsl(var(--popover))",
								color: "hsl(var(--popover-foreground))",
								border: "1px solid hsl(var(--border))",
								borderRadius: "var(--radius)",
							},
						}}
					/>
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
