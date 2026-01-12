import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
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
import boxTAM from "../assets/boxTAM.svg";

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="min-h-screen bg-white flex flex-col">
        {/* HEADER */}
        <nav className="bg-[#800000] shadow mb-4">
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
              </nav>
            </div>
          </div>
        </nav>

        {/* MAIN */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-4">
          <Routes>
            <Route path="/" element={<Orders />} />
            <Route path="/orders/:orderId" element={<OrderDetailPage />} />
            <Route path="/order-qa" element={<OrderQAChecklist />} />
            <Route path="/delivery" element={<DeliveryDashboard />} />
            <Route path="/delivery/runs/:runId" element={<DeliveryRunDetailPage />} />

            {/* Individual delivery routes (still accessible for direct links) */}
            <Route path="/shipping" element={<Shipping />} />
            <Route path="/pre-delivery" element={<PreDeliveryQueue />} />
            <Route path="/in-delivery" element={<InDelivery />} />
            <Route path="/document-signing" element={<DocumentSigningPage />} />

            <Route path="/admin" element={<Admin />} />
          </Routes>
        </main>

        {/* FOOTER */}
        <footer className="bg-[#800000] text-white mt-8">
          <div className="max-w-7xl mx-auto px-4 py-4 text-center text-sm">
            © {new Date().getFullYear()} TechHub • All rights reserved
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
