import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import OrderDetailPage from "./pages/OrderDetailPage";
import PreDeliveryQueue from "./pages/PreDeliveryQueue";
import InDelivery from "./pages/InDelivery";
import Admin from "./pages/Admin";
import DocumentSigningPage from "./pages/DocumentSigningPage";
import boxTAM from "../assets/boxTAM.svg";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-white flex flex-col">
        {/* HEADER */}
        <nav className="bg-[#800000] shadow mb-4">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center gap-3">
                <img
                  src={boxTAM}
                  alt="boxTAM logo"
                  className="h-8 w-auto"
                />
                <h1 className="text-xl font-bold text-white">
                  TechHub Delivery Workflow
                </h1>
              </div>

              <nav className="flex gap-4">
                <Link
                  to="/"
                  className="text-white font-medium hover:text-gray-200"
                >
                  Dashboard
                </Link>
                <Link
                  to="/pre-delivery"
                  className="text-white font-medium hover:text-gray-200"
                >
                  Pre-Delivery Queue
                </Link>
                <Link
                  to="/in-delivery"
                  className="text-white font-medium hover:text-gray-200"
                >
                  In Delivery
                </Link>
                <Link
                  to="/admin"
                  className="text-white font-medium hover:text-gray-200"
                >
                  Admin
                </Link>
              </nav>
            </div>
          </div>
        </nav>

        {/* MAIN CONTENT */}
        <main className="max-w-7xl mx-auto flex-grow">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders/:orderId" element={<OrderDetailPage />} />
            <Route path="/pre-delivery" element={<PreDeliveryQueue />} />
            <Route path="/in-delivery" element={<InDelivery />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/document-signing" element={<DocumentSigningPage />} />
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
