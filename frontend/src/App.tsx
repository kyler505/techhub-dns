import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast, Toaster } from "sonner";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AppShellErrorBoundary, RouteContentErrorBoundary } from "./components/error-boundaries/AppErrorBoundaries";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Sidebar } from "./components/Sidebar";
import { Skeleton } from "./components/Skeleton";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { SyncHealthBanner } from "./components/SyncHealthBanner";
import { OfflineBanner } from "./components/OfflineBanner";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage"));
const DeliveryLayout = lazy(() => import("./pages/delivery/DeliveryLayout"));
const DeliveryDispatchPage = lazy(() => import("./pages/delivery/Dispatch"));
const Shipping = lazy(() => import("./pages/Shipping"));
const Admin = lazy(() => import("./pages/Admin"));
const DocumentSigningPage = lazy(() => import("./pages/DocumentSigningPage"));
const OrderQAChecklist = lazy(() => import("./pages/OrderQAChecklist"));
const OrderQAPage = lazy(() => import("./pages/OrderQAPage"));
const DeliveryRunDetailPage = lazy(() => import("./pages/DeliveryRunDetailPage"));
const Login = lazy(() => import("./pages/Login"));
const Sessions = lazy(() => import("./pages/Sessions"));
const TagRequest = lazy(() => import("./pages/TagRequest"));
const VettingEditor = lazy(() => import("./pages/VettingEditor"));

const prefetchRoutes = () => {
    void import("./pages/Dashboard");
    void import("./pages/Orders");
};

function AppContent() {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    /** Stable key for AnimatePresence — suppresses transition when clicking between orders. */
    const pageKey = (() => {
        const p = location.pathname;
        if (p === "/orders") return "/orders";
        if (/^\/orders\/[^/]+$/.test(p)) return "/orders/:orderId";
        return p;
    })();

    /** Disable outer page fade for order detail transitions — inner animations own the motion. */
    const isOrderDetailTransition = location.pathname !== "/orders" && /^\/orders\/[^/]+$/.test(location.pathname);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const idleCallback = window.requestIdleCallback || ((cb: IdleRequestCallback) => window.setTimeout(cb, 250));
        const idleCancel = window.cancelIdleCallback || window.clearTimeout;
        const id = idleCallback(() => {
            prefetchRoutes();
        });
        return () => idleCancel(id as number);
    }, []);

    // Listen for rate-limit events from the API client
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            toast.warning(detail?.message ?? "Too many requests. Please wait a moment.");
        };
        window.addEventListener("app-rate-limit", handler);
        return () => window.removeEventListener("app-rate-limit", handler);
    }, []);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Skeleton className="w-96 h-96 rounded-lg" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Suspense fallback={<Skeleton className="w-96 h-96 rounded-lg" />}>
                    <RouteContentErrorBoundary>
                        <Routes>
                            <Route path="/login" element={<Login />} />
                            <Route path="*" element={<Navigate to="/login" state={{ from: location }} replace />} />
                        </Routes>
                    </RouteContentErrorBoundary>
                </Suspense>
            </div>
        );
    }

	return (
		<div className="min-h-screen bg-background overflow-x-hidden">
				<Sidebar />

				<main className="min-h-screen transition-[margin] duration-300 lg:ml-[var(--sidebar-width)]">
					<div className="sticky top-0 z-30 h-12 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
						<div className="flex h-full items-center px-4 pl-16 sm:px-6 lg:px-8 lg:pl-8">
							<Breadcrumbs />
						</div>
					</div>

					<SyncHealthBanner />

					<div className="w-full">
                        <RouteContentErrorBoundary>
                            <Suspense fallback={
                                <div className="space-y-4">
                                    <Skeleton className="h-8 w-64" />
                                    <Skeleton className="h-64 w-full rounded-lg" />
                                </div>
                            }>
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={pageKey}
                                        initial={isOrderDetailTransition ? false : { opacity: 0, scale: 0.985 }}
                                        animate={isOrderDetailTransition ? undefined : { opacity: 1, scale: 1 }}
                                        exit={isOrderDetailTransition ? undefined : { opacity: 0, scale: 0.99 }}
                                        transition={isOrderDetailTransition ? { duration: 0 } : { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                                    >
                                        <Routes location={location}>
                                            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                                            <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
                                            <Route path="/orders/:orderId" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
                                            <Route path="/orders/:orderId/qa" element={<ProtectedRoute><OrderQAPage /></ProtectedRoute>} />
                                            <Route path="/tag-request" element={<ProtectedRoute><TagRequest /></ProtectedRoute>} />
                                            <Route path="/vetting-editor" element={<ProtectedRoute><VettingEditor /></ProtectedRoute>} />
                                            <Route path="/order-qa" element={<ProtectedRoute><OrderQAChecklist /></ProtectedRoute>} />
                                            <Route path="/delivery" element={<ProtectedRoute><DeliveryLayout /></ProtectedRoute>}>
                                                <Route index element={<Navigate to="dispatch" replace />} />
                                                <Route path="dispatch" element={<DeliveryDispatchPage />} />
                                                <Route path="runs/:runId" element={<DeliveryRunDetailPage />} />
                                            </Route>
                                            <Route path="/shipping" element={<ProtectedRoute><Shipping /></ProtectedRoute>} />
                                            <Route path="/document-signing" element={<ProtectedRoute><DocumentSigningPage /></ProtectedRoute>} />
                                            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
                                            <Route path="/sessions" element={<ProtectedRoute><Sessions /></ProtectedRoute>} />
                                            <Route path="/login" element={<Navigate to="/" replace />} />
                                        </Routes>
                                    </motion.div>
                                </AnimatePresence>
                            </Suspense>
                        </RouteContentErrorBoundary>
                    </div>
                                    <OfflineBanner />
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
            <AppShellErrorBoundary>
                <AuthProvider>
                    <AppContent />
                </AuthProvider>
            </AppShellErrorBoundary>
        </BrowserRouter>
    );
}

export default App;