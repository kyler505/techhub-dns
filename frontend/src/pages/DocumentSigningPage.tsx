import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFPageProxy } from "pdfjs-dist";
// pdf-lib is used server-side for PDF bundling
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ordersApi } from "../api/orders";
import { OrderDetail } from "../types/order";
import { SignatureModal } from "../components/SignatureModal";
import { signatureCache } from "../lib/signatureCache";
import { Button } from "../components/ui/button";
import { PenTool, X } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

interface PdfEntry {
    name: string;
    filename: string;
    url: string;
}

// Store basic placement info (normalized to PDF points)
interface Placement {
    id: string;
    pageIndex: number; // 0-based
    x: number; // PDF points (from left)
    y: number; // PDF points (from bottom, ReportLab style)
    width: number; // PDF points
    height: number; // PDF points
    dataUrl: string; // The image source
}



function DocumentSigningPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [selectedPdf, setSelectedPdf] = useState<PdfEntry | null>(null);
    const [loadingOrder, setLoadingOrder] = useState(true);
    const [orderError, setOrderError] = useState<string | null>(null);
    const [pageViewport, setPageViewport] = useState<{ width: number; height: number } | null>(null);
    const [renderSize, setRenderSize] = useState<{ width: number; height: number } | null>(null);
    const [containerWidth, setContainerWidth] = useState<number | null>(null);

    // Signing State
    const [modalOpen, setModalOpen] = useState(false);
    const [placements, setPlacements] = useState<Placement[]>([]);
    const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
    const viewerRef = useRef<HTMLDivElement | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load order when component mounts
    useEffect(() => {
        const orderId = searchParams.get('orderId');
        if (!orderId) {
            setOrderError('No order ID provided');
            setLoadingOrder(false);
            return;
        }

        const loadOrder = async () => {
            try {
                setLoadingOrder(true);
                setOrderError(null);
                const orderData = await ordersApi.getOrder(orderId);
                setOrder(orderData);

                if (orderData.picklist_path) {
                    setSelectedPdf({
                        name: `Picklist for Order ${orderData.inflow_order_id || orderData.id.slice(0, 8)}`,
                        filename: `order-${orderData.id}-picklist.pdf`,
                        url: `/api/orders/${orderData.id}/picklist`
                    });
                } else {
                    setOrderError('No picklist available for this order');
                }
            } catch (err) {
                console.error('Failed to load order:', err);
                setOrderError('Failed to load order details');
            } finally {
                setLoadingOrder(false);
            }
        };

        loadOrder();
    }, [searchParams]);

    const selectedPdfUrl = useMemo(() => (selectedPdf ? selectedPdf.url : null), [selectedPdf]);

    // Responsive sizing logic
    useEffect(() => {
        if (!viewerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (rect && rect.width > 0) {
                setContainerWidth(rect.width);
            }
        });
        observer.observe(viewerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!pageViewport || !containerWidth) return;
        const nextScale = containerWidth / pageViewport.width;
        setRenderSize({
            width: pageViewport.width * nextScale,
            height: pageViewport.height * nextScale,
        });
    }, [containerWidth, pageViewport]);

    const scale = useMemo(() => {
        if (!pageViewport || !renderSize) return 1;
        return renderSize.width / pageViewport.width;
    }, [pageViewport, renderSize]);

    const handlePageLoad = useCallback((page: PDFPageProxy) => {
        const viewport = page.getViewport({ scale: 1 });
        setPageViewport({ width: viewport.width, height: viewport.height });
    }, []);

    // --- Placement Logic ---

    const addPlacement = (dataUrl: string, imgW: number, imgH: number) => {
        if (!pageViewport) {
            setError("PDF is still loading. Try again in a moment.");
            setModalOpen(true);
            return false;
        }

        if (!Number.isFinite(imgW) || !Number.isFinite(imgH) || imgW <= 0 || imgH <= 0) {
            signatureCache.clear();
            setError("Saved signature data was invalid. Please add a new signature.");
            setModalOpen(true);
            return false;
        }

        // Default size logic: e.g. 150pt width, preserve aspect ratio
        const targetWidthPt = 150;
        const aspectRatio = imgW / imgH;
        const targetHeightPt = targetWidthPt / aspectRatio;

        // Center on page
        // PDF coords (bottom-left origin) vs Viewport (top-left origin for width calc is same)
        // Center X = (PageW - SigW) / 2
        // Center Y (from bottom) = (PageH - SigH) / 2

        const x = (pageViewport.width - targetWidthPt) / 2;
        const y = (pageViewport.height - targetHeightPt) / 2;

        const newPlacement: Placement = {
            id: Math.random().toString(36).substr(2, 9),
            pageIndex: 0,
            x,
            y,
            width: targetWidthPt,
            height: targetHeightPt,
            dataUrl
        };

        setError(null);
        setPlacements(prev => [...prev.filter(p => p.id !== 'temp'), newPlacement]);
        setSelectedPlacementId(newPlacement.id);
        return true;
    };

    const handleModalSave = (dataUrl: string, w: number, h: number) => {
        addPlacement(dataUrl, w, h);
    };

    const useLastSignature = () => {
        const cached = signatureCache.load();
        if (cached) {
            const placed = addPlacement(cached.dataUrl, cached.width, cached.height);
            if (!placed) {
                setModalOpen(true);
            }
        } else {
            setModalOpen(true);
        }
    };

    const removePlacement = (id: string) => {
        setPlacements(prev => prev.filter(p => p.id !== id));
        if (selectedPlacementId === id) setSelectedPlacementId(null);
    };

    // --- Dragging Logic ---
    const dragStartRef = useRef<{ id: string, startX: number, startY: number, initX: number, initY: number } | null>(null);

    const handlePointerDown = (e: React.PointerEvent, id: string) => {
        e.stopPropagation(); // Prevent PDF scrolling if possible? Or maybe just capture
        const placement = placements.find(p => p.id === id);
        if (!placement) return;

        setSelectedPlacementId(id);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);

        // Convert click screen coords -> PDF points not needed for Delta,
        // we just need delta pixels converted to delta points.

        dragStartRef.current = {
            id,
            startX: e.clientX,
            startY: e.clientY,
            initX: placement.x,
            initY: placement.y // stored as Bottom-Left
        };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragStartRef.current || !pageViewport || !renderSize) return;

        const { id, startX, startY, initX, initY } = dragStartRef.current;
        e.preventDefault();

        // Delta in Pixels
        const dxPx = e.clientX - startX;
        const dyPx = e.clientY - startY;

        // Delta in PDF Points
        // X grows right (same)
        // Y grows down in DOM, but UP in PDF.
        // So moving mouse DOWN (+dyPx) means moving CLOSER to bottom (decreasing Y in PDF? No.)
        // Wait: PDF origin is Bottom-Left.
        // Rendering: Top-Left is (0, PageH).
        // Let's visualize:
        // DOM y=0 is PDF y=PageH.
        // DOM y=100 is PDF y=PageH - 100/scale.
        // If I move DOWN (+10px), DOM y increases. PDF y decreases.
        // So dyPt = -dyPx / scale.

        const dxPt = dxPx / scale;
        const dyPt = -dyPx / scale;

        setPlacements(prev => prev.map(p => {
            if (p.id !== id) return p;
            return {
                ...p,
                x: initX + dxPt,
                y: initY + dyPt
            };
        }));
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (dragStartRef.current) {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            dragStartRef.current = null;
        }
    };

    const saveSignedPdf = async () => {
        if (!order || placements.length === 0) {
            setError("Place a signature before saving.");
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            // Pick the first signature image for the 'main' image (legacy field requirement?)
            // The backend update said signature_image is required.
            // We'll send the dataUrl of the first placement, or the last one used.
            // And send the FULL list of placements.

            const mainSig = placements[0].dataUrl;

            // Map frontend placements to backend format
            // Backend expects { page_number, x, y, width, height }
            // Backend x/y are drawing coordinates (Bottom-Left).
            // Our state is ALREADY in PDF Points (Bottom-Left).

            // Just double check boundaries? No, backend just stamps.

            const payload = {
                signature_image: mainSig, // Required by schema base
                placements: placements.map(p => ({
                    page_number: p.pageIndex + 1, // 1-based for Backend
                    x: p.x,
                    y: p.y,
                    width: p.width,
                    height: p.height
                }))
            };

            await ordersApi.signOrder(order.id, payload as any); // Cast because frontend types might need update

            const returnTo = searchParams.get('returnTo') || `/orders/${order.id}`;
            navigate(returnTo, {
                state: { message: 'Document signed successfully!' }
            });

        } catch (saveError) {
            console.error(saveError);
            setError("Unable to complete signing. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    // Calculate DOM styles for a placement
    const getPlacementStyle = (p: Placement) => {
        if (!pageViewport || !renderSize) return { display: 'none' };

        // Convert PDF Points (Bottom-Left) to DOM Pixels (Top-Left)
        // xPx = xPt * scale
        // yPx = (PageH - yPt - hPt) * scale

        const xPx = p.x * scale;
        const yPx = (pageViewport.height - p.y - p.height) * scale;
        const wPx = p.width * scale;
        const hPx = p.height * scale;

        return {
            left: `${xPx}px`,
            top: `${yPx}px`,
            width: `${wPx}px`,
            height: `${hPx}px`,
            position: 'absolute' as const,
        };
    };

    // --- Render ---

    if (loadingOrder) {
        return <div className="p-8 text-center text-gray-500">Loading document...</div>;
    }

    if (orderError || !order) {
        return <div className="p-8 text-center text-red-500">{orderError || "Order not found"}</div>;
    }

    return (
        <div className="px-4 pb-8 min-h-screen bg-gray-50/50">
            <SignatureModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                onSave={handleModalSave}
            />

            <div className="max-w-6xl mx-auto pt-6">
                <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Sign Delivery Document</h1>
                        <p className="text-gray-600">
                            Order {order.inflow_order_id} • {order.recipient_name}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={useLastSignature}
                            className="hidden sm:flex"
                        >
                            <PenTool className="w-4 h-4 mr-2" />
                            Add Signature
                        </Button>
                        <Button
                            onClick={saveSignedPdf}
                            disabled={placements.length === 0 || isSaving}
                            className="bg-[#500000] hover:bg-[#300000]"
                        >
                            {isSaving ? "Saving..." : "Finish & Save"}
                        </Button>
                    </div>
                </header>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div
                        className="relative bg-gray-100 min-h-[500px] flex justify-center p-4 overflow-hidden select-none"
                        ref={viewerRef}
                    >
                        {selectedPdfUrl ? (
                            <div className="relative shadow-lg ring-1 ring-gray-900/5">
                                    <Document
                                        file={selectedPdfUrl}
                                        loading={<div className="p-10 text-gray-500">Loading PDF...</div>}
                                        error={<div className="p-10 text-red-500">Failed to load PDF</div>}
                                    >
                                        <Page
                                            pageNumber={1}
                                            width={containerWidth || undefined}
                                            onLoadSuccess={handlePageLoad}
                                            renderTextLayer={false}
                                            renderAnnotationLayer={false}
                                            className="bg-white"
                                        />
                                    </Document>

                                {/* Overlay Layer */}
                                {placements.map(p => (
                                    <div
                                        key={p.id}
                                        style={getPlacementStyle(p)}
                                        className={`group cursor-move touch-none select-none ${selectedPlacementId === p.id ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                                        onPointerDown={(e) => handlePointerDown(e, p.id)}
                                        onPointerMove={handlePointerMove}
                                        onPointerUp={handlePointerUp}
                                    >
                                        <img
                                            src={p.dataUrl}
                                            alt="Signature"
                                            className="w-full h-full object-contain pointer-events-none"
                                        />

                                        {/* Delete Button (visible on hover/select) */}
                                        {(selectedPlacementId === p.id) && (
                                            <button
                                                className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 shadow-sm hover:bg-red-600"
                                                onClick={(e) => { e.stopPropagation(); removePlacement(p.id); }}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                ))}

                                {/* Empty State Hint */}
                                {placements.length === 0 && (
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                                        <div className="bg-black/75 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm">
                                            Tap "Add Signature" to begin
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-gray-400 self-center">No PDF Loaded</div>
                        )}
                    </div>

                    {/* Mobile Floating Action Button */}
                    <div className="sm:hidden fixed bottom-6 right-6">
                        <Button
                            className="rounded-full shadow-lg h-14 w-14 p-0 bg-blue-600 hover:bg-blue-700"
                            onClick={useLastSignature}
                        >
                            <PenTool className="w-6 h-6 text-white" />
                        </Button>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-50 border-t border-red-100 text-red-600 text-sm text-center">
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default DocumentSigningPage;
