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
        if (!pageViewport) return 1;
        const fallbackWidth = viewerRef.current?.clientWidth || pageViewport.width;
        const targetWidth = renderSize?.width || containerWidth || fallbackWidth;
        return targetWidth / pageViewport.width;
    }, [pageViewport, renderSize, containerWidth]);

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
        const placed = addPlacement(dataUrl, w, h);
        if (placed) {
            setModalOpen(false);
        }
        return placed;
    };

    const useLastSignature = () => {
        setError(null);
        setModalOpen(true);
    };

    const removePlacement = (id: string) => {
        setPlacements(prev => prev.filter(p => p.id !== id));
        if (selectedPlacementId === id) setSelectedPlacementId(null);
    };

    // --- Dragging Logic ---
    const dragStartRef = useRef<{ id: string, startX: number, startY: number, initX: number, initY: number } | null>(null);
    const resizeStartRef = useRef<{
        id: string;
        anchorX: number;      // Top-right corner X (fixed point)
        anchorY: number;      // Top-right corner Y (fixed point, in PDF coords from bottom)
        aspectRatio: number;
        handleOffsetX: number;
        handleOffsetY: number;
        minSize: number;
    } | null>(null);
    const interactionTypeRef = useRef<'pointer' | 'touch' | null>(null);
    const interactionModeRef = useRef<'drag' | 'resize' | null>(null);

    const windowPointerListenersRef = useRef(false);
    const windowTouchListenersRef = useRef(false);
    const touchListenerOptions = useRef<AddEventListenerOptions>({ passive: false });

    const attachPointerListeners = () => {
        if (windowPointerListenersRef.current) return;
        window.addEventListener('pointermove', handlePointerMove as unknown as EventListener);
        window.addEventListener('pointerup', handleWindowPointerUp);
        windowPointerListenersRef.current = true;
    };

    const detachPointerListeners = () => {
        if (!windowPointerListenersRef.current) return;
        window.removeEventListener('pointermove', handlePointerMove as unknown as EventListener);
        window.removeEventListener('pointerup', handleWindowPointerUp);
        windowPointerListenersRef.current = false;
    };

    const attachTouchListeners = () => {
        if (windowTouchListenersRef.current) return;
        window.addEventListener('touchmove', handleTouchMove as unknown as EventListener, touchListenerOptions.current);
        window.addEventListener('touchend', handleWindowTouchEnd);
        window.addEventListener('touchcancel', handleWindowTouchEnd);
        windowTouchListenersRef.current = true;
    };

    const detachTouchListeners = () => {
        if (!windowTouchListenersRef.current) return;
        window.removeEventListener('touchmove', handleTouchMove as unknown as EventListener, touchListenerOptions.current);
        window.removeEventListener('touchend', handleWindowTouchEnd);
        window.removeEventListener('touchcancel', handleWindowTouchEnd);
        windowTouchListenersRef.current = false;
    };

    const updateDrag = (clientX: number, clientY: number) => {
        if (!dragStartRef.current || !pageViewport) return;

        const { id, startX, startY, initX, initY } = dragStartRef.current;
        const dxPx = clientX - startX;
        const dyPx = clientY - startY;
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

    const updateResize = (clientX: number, clientY: number) => {
        if (!resizeStartRef.current || !pageViewport || !viewerRef.current) return;

        const {
            id,
            anchorX,
            anchorY,
            aspectRatio,
            handleOffsetX,
            handleOffsetY,
            minSize
        } = resizeStartRef.current;

        // Get viewer position for coordinate conversion
        const viewerRect = viewerRef.current.getBoundingClientRect();
        
        // Calculate handle position in screen coordinates, accounting for offset
        const handleScreenX = clientX - handleOffsetX;
        const handleScreenY = clientY - handleOffsetY;
        
        // Convert to PDF coordinates
        const handlePdfX = (handleScreenX - viewerRect.left) / scale;
        const handlePdfY = (viewerRect.bottom - handleScreenY) / scale; // Convert to PDF coords (from bottom)

        // Calculate new dimensions based on distance from anchor (top-right) to handle (bottom-left)
        let newWidth = anchorX - handlePdfX;
        let newHeight = anchorY - handlePdfY;
        
        // Maintain aspect ratio by using the larger dimension
        const currentAspect = newWidth / newHeight;
        if (currentAspect > aspectRatio) {
            // Too wide, adjust width based on height
            newWidth = newHeight * aspectRatio;
        } else {
            // Too tall, adjust height based on width
            newHeight = newWidth / aspectRatio;
        }
        
        // Clamp to minimum size
        newWidth = Math.max(minSize, newWidth);
        newHeight = Math.max(minSize, newHeight);

        // Calculate new position (bottom-left corner)
        const nextX = anchorX - newWidth;
        const nextY = anchorY - newHeight;

        requestAnimationFrame(() => {
            setPlacements(prev => prev.map(p => {
                if (p.id !== id) return p;
                return {
                    ...p,
                    x: nextX,
                    y: nextY,
                    width: newWidth,
                    height: newHeight
                };
            }));
        });
    };

    const handlePointerDown = (e: React.PointerEvent, id: string) => {
        e.stopPropagation(); // Prevent PDF scrolling if possible? Or maybe just capture
        const placement = placements.find(p => p.id === id);
        if (!placement) return;

        interactionTypeRef.current = 'pointer';
        interactionModeRef.current = 'drag';
        setSelectedPlacementId(id);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        attachPointerListeners();

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

    const handlePointerMove = (e: React.PointerEvent | PointerEvent) => {
        if (interactionTypeRef.current !== 'pointer') return;
        if ('preventDefault' in e) {
            e.preventDefault();
        }
        if (interactionModeRef.current === 'resize') {
            updateResize(e.clientX, e.clientY);
        } else {
            updateDrag(e.clientX, e.clientY);
        }
    };

    const handleTouchStart = (e: React.TouchEvent, id: string) => {
        if (interactionTypeRef.current === 'pointer') return;
        const placement = placements.find(p => p.id === id);
        const touch = e.touches[0];
        if (!placement || !touch) return;

        e.stopPropagation();
        e.preventDefault();
        interactionTypeRef.current = 'touch';
        interactionModeRef.current = 'drag';
        setSelectedPlacementId(id);
        attachTouchListeners();

        dragStartRef.current = {
            id,
            startX: touch.clientX,
            startY: touch.clientY,
            initX: placement.x,
            initY: placement.y
        };
    };

    const handleTouchMove = (e: TouchEvent | React.TouchEvent) => {
        if (interactionTypeRef.current !== 'touch') return;
        const touch = 'touches' in e ? (e.touches[0] || e.changedTouches[0]) : null;
        if (!touch) return;
        if ('preventDefault' in e) {
            e.preventDefault();
        }
        if (interactionModeRef.current === 'resize') {
            updateResize(touch.clientX, touch.clientY);
        } else {
            updateDrag(touch.clientX, touch.clientY);
        }
    };

    const handleWindowPointerUp = () => {
        dragStartRef.current = null;
        resizeStartRef.current = null;
        interactionTypeRef.current = null;
        interactionModeRef.current = null;
        detachPointerListeners();
    };

    const handleWindowTouchEnd = () => {
        dragStartRef.current = null;
        resizeStartRef.current = null;
        interactionTypeRef.current = null;
        interactionModeRef.current = null;
        detachTouchListeners();
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (dragStartRef.current || resizeStartRef.current) {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            dragStartRef.current = null;
            resizeStartRef.current = null;
            interactionTypeRef.current = null;
            interactionModeRef.current = null;
            detachPointerListeners();
        }
    };

    const handleResizePointerDown = (e: React.PointerEvent, id: string) => {
        e.stopPropagation();
        const placement = placements.find(p => p.id === id);
        if (!placement) return;

        interactionTypeRef.current = 'pointer';
        interactionModeRef.current = 'resize';
        setSelectedPlacementId(id);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        attachPointerListeners();

        // Calculate offset from pointer to handle center for accurate positioning
        const handleRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const handleOffsetX = e.clientX - (handleRect.left + handleRect.width / 2);
        const handleOffsetY = e.clientY - (handleRect.top + handleRect.height / 2);
        
        // Anchor at top-right corner (kept fixed during resize)
        const anchorX = placement.x + placement.width;
        const anchorY = placement.y + placement.height;
        
        resizeStartRef.current = {
            id,
            anchorX,
            anchorY,
            aspectRatio: placement.width / placement.height,
            handleOffsetX,
            handleOffsetY,
            minSize: 40
        };
    };

    const handleResizeTouchStart = (e: React.TouchEvent, id: string) => {
        if (interactionTypeRef.current === 'pointer') return;
        const placement = placements.find(p => p.id === id);
        const touch = e.touches[0];
        if (!placement || !touch) return;

        e.stopPropagation();
        e.preventDefault();
        interactionTypeRef.current = 'touch';
        interactionModeRef.current = 'resize';
        setSelectedPlacementId(id);
        attachTouchListeners();

        // Anchor at top-right corner (kept fixed during resize)
        const anchorX = placement.x + placement.width;
        const anchorY = placement.y + placement.height;
        
        // For touch, calculate offset from touch point to where handle center would be
        const handleEl = e.currentTarget as HTMLElement;
        const handleRect = handleEl.getBoundingClientRect();
        const handleOffsetX = touch.clientX - (handleRect.left + handleRect.width / 2);
        const handleOffsetY = touch.clientY - (handleRect.top + handleRect.height / 2);
        
        resizeStartRef.current = {
            id,
            anchorX,
            anchorY,
            aspectRatio: placement.width / placement.height,
            handleOffsetX,
            handleOffsetY,
            minSize: 40
        };
    };

    useEffect(() => {
        return () => {
            detachPointerListeners();
            detachTouchListeners();
        };
    }, []);

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
        if (!pageViewport) return { display: 'none' };

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
        <div className="px-4 pb-8 min-h-[100dvh] bg-gradient-to-b from-[#f8f5f2] via-[#fbfbfb] to-white">
            <SignatureModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                onSave={handleModalSave}
            />

            <div className="max-w-6xl mx-auto pt-6">
                <header className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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
                    <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="text-sm text-gray-600">
                            <span className="font-medium text-gray-800">Picklist</span>
                            <span className="mx-2 text-gray-300">•</span>
                            <span>1 page</span>
                        </div>
                        <div className="text-xs text-gray-500">
                            Drag to place • Resize from bottom-left • Tap Save when finished
                        </div>
                    </div>
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
                                        className={`group cursor-move touch-none select-none ${selectedPlacementId === p.id ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                                        style={{ ...getPlacementStyle(p), touchAction: 'none' }}
                                        onPointerDown={(e) => handlePointerDown(e, p.id)}
                                        onPointerMove={handlePointerMove}
                                        onPointerUp={handlePointerUp}
                                        onPointerCancel={handlePointerUp}
                                        onTouchStart={(e) => handleTouchStart(e, p.id)}
                                        onTouchMove={handleTouchMove}
                                        onTouchEnd={handleWindowTouchEnd}
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

                                        {(selectedPlacementId === p.id) && (
                                            <div
                                                className="absolute -bottom-3 -left-3 h-6 w-6 rounded-full border-2 border-blue-500 bg-white shadow-md flex items-center justify-center cursor-nw-resize hover:scale-110 transition-transform"
                                                onPointerDown={(e) => handleResizePointerDown(e, p.id)}
                                                onPointerUp={handlePointerUp}
                                                onPointerCancel={handlePointerUp}
                                                onTouchStart={(e) => handleResizeTouchStart(e, p.id)}
                                                onTouchEnd={handleWindowTouchEnd}
                                                style={{ touchAction: 'none' }}
                                            >
                                                <svg className="w-3 h-3 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M18 6L6 18" />
                                                    <path d="M12 6h6v6" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* Empty State Hint */}
                                {placements.length === 0 && (
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                                        <div className="bg-black/75 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm">
                                            Tap "Add Signature" to draw, then drag to place
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
