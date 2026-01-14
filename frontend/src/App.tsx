import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Orders from "./pages/Orders";
import OrderDetailPage from "./pages/OrderDetailPage";
import DeliveryDashboard from "./pages/DeliveryDashboard";
import PreDeliveryQueue from "./pages/PreDeliveryQueue";
import InDelivery from "./pages/InDelivery";
import Admin from "./pages/Admin";
import DocumentSigningPage from "./pages/DocumentSigningPage";
import OrderQAChecklist from "./pages/OrderQAChecklist";
import Shipping from "./pages/Shipping";
import DeliveryRunDetailPage from "./pages/DeliveryRunDetailPage";
import Login from "./pages/Login";
import Sessions from "./pages/Sessions";
import boxTAM from "../assets/boxTAM.svg";

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
    return (
        <div className="min-h-screen bg-white flex flex-col">
            {/* HEADER */}
            <nav className="bg-maroon-700 shadow mb-4">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex justify-between items-center py-4">
                        {/* Logo + Title (links to Orders) */}
                        <Link to="/" className="flex items-center gap-3">
                            <img src={boxTAM} alt="boxTAM logo" className="h-8 w-auto" />
                            <h1 className="text-xl font-bold text-white">
                                TechHub
                            </h1>
                        </Link>

                        {/* Top nav */}
                        <nav className="flex gap-4 items-center">
                            <Link to="/" className="text-white font-medium hover:text-gray-200">
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

                            <div className="border-l border-white/30 h-6 mx-2"></div>

                            <UserMenu />
                        </nav>
                    </div>
                </div>
            </nav>

            {/* MAIN */}
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 flex flex-col">
                <Routes>
                    {/* Public routes */}
                    <Route path="/login" element={<Login />} />

                    {/* Protected routes */}
                    <Route path="/" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
                    <Route path="/orders/:orderId" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
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
