import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import OrderDetailPage from "./pages/OrderDetailPage";
import PreDeliveryQueue from "./pages/PreDeliveryQueue";
import InDelivery from "./pages/InDelivery";
import Admin from "./pages/Admin";
import DocumentSigningPage from "./pages/DocumentSigningPage";
import OrderQAChecklist from "./pages/OrderQAChecklist";
import Shipping from "./pages/Shipping";
import boxTAM from "../assets/boxTAM.svg";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-white flex flex-col">
        {/* HEADER */}
        <nav className="bg-[#800000] shadow mb-4">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between items-center py-4">
              {/* Logo + Title (links to Dashboard) */}
              <Link to="/" className="flex items-center gap-3">
                <img src={boxTAM} alt="boxTAM logo" className="h-8 w-auto" />
                <h1 className="text-xl font-bold text-white">
                  TechHub Delivery Workflow
                </h1>
              </Link>

              {/* Top nav */}
              <nav className="flex gap-4 items-center">
                <Link to="/" className="text-white font-medium hover:text-gray-200">
                  Dashboard
                </Link>

                <Link to="/order-qa" className="text-white font-medium hover:text-gray-200">
                  Order QA
                </Link>

                {/* Delivery dropdown */}
                <div className="relative group">
                  <button
                    type="button"
                    className="text-white font-medium hover:text-gray-200 inline-flex items-center gap-2"
                    aria-haspopup="menu"
                  >
                    Delivery <span className="text-white/80">▾</span>
                  </button>

                  {/* Hover-safe dropdown */}
                  <div className="absolute right-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition">
                    <div
                      className="w-56 rounded-md bg-white shadow-lg ring-1 ring-black/5"
                      role="menu"
                    >
                      <div className="py-1">
                        <Link
                          to="/shipping"
                          className="block px-4 py-2 text-sm text-gray-800 hover:bg-gray-100"
                          role="menuitem"
                        >
                          Shipping
                        </Link>
                        <Link
                          to="/pre-delivery"
                          className="block px-4 py-2 text-sm text-gray-800 hover:bg-gray-100"
                          role="menuitem"
                        >
                          Pre-Delivery Queue
                        </Link>
                        <Link
                          to="/in-delivery"
                          className="block px-4 py-2 text-sm text-gray-800 hover:bg-gray-100"
                          role="menuitem"
                        >
                          In Delivery
                        </Link>
                        <Link
                          to="/document-signing"
                          className="block px-4 py-2 text-sm text-gray-800 hover:bg-gray-100"
                          role="menuitem"
                        >
                          Document Signing
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>

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
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders/:orderId" element={<OrderDetailPage />} />
            <Route path="/order-qa" element={<OrderQAChecklist />} />

            {/* Delivery group routes */}
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
