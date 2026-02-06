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
import { Card } from "../components/ui/card";
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
        startPointerX: number;
        startPointerY: number;
        startHandleX: number;
        startHandleY: number;
        startWidth: number;
        startHeight: number;
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
        if (!resizeStartRef.current || !pageViewport) return;

        const {
            id,
            anchorX,
            anchorY,
            aspectRatio,
            startPointerX,
            startPointerY,
            startHandleX,
            startHandleY,
            startWidth,
            startHeight,
            minSize
        } = resizeStartRef.current;

        const dxPx = clientX - startPointerX;
        const dyPx = clientY - startPointerY;
        const dxPt = dxPx / scale;
        const dyPt = -dyPx / scale;

        const handlePdfX = startHandleX + dxPt;
        const handlePdfY = startHandleY + dyPt;

        const widthFromX = anchorX - handlePdfX;
        const heightFromY = anchorY - handlePdfY;

        let newWidth = startWidth;
        let newHeight = startHeight;

        if (Math.abs(dxPt) >= Math.abs(dyPt)) {
            newWidth = widthFromX;
            newHeight = newWidth / aspectRatio;
        } else {
            newHeight = heightFromY;
            newWidth = newHeight * aspectRatio;
        }

        const minWidth = minSize;
        const minHeight = minSize;

        if (newWidth < minWidth) {
            newWidth = minWidth;
            newHeight = newWidth / aspectRatio;
        }
        if (newHeight < minHeight) {
            newHeight = minHeight;
            newWidth = newHeight * aspectRatio;
        }

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
        const target = e.target as HTMLElement | null;
        if (target?.closest('[data-resize-handle], [data-delete-button]')) return;
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
        const target = e.target as HTMLElement | null;
        if (target?.closest('[data-resize-handle], [data-delete-button]')) return;
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

        // Anchor at top-right corner (kept fixed during resize)
        const anchorX = placement.x + placement.width;
        const anchorY = placement.y + placement.height;
        const minSize = Math.max(32, Math.min(placement.width, placement.height) * 0.4);

        resizeStartRef.current = {
            id,
            anchorX,
            anchorY,
            aspectRatio: placement.width / placement.height,
            startPointerX: e.clientX,
            startPointerY: e.clientY,
            startHandleX: placement.x,
            startHandleY: placement.y,
            startWidth: placement.width,
            startHeight: placement.height,
            minSize
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
        const minSize = Math.max(32, Math.min(placement.width, placement.height) * 0.4);

        resizeStartRef.current = {
            id,
            anchorX,
            anchorY,
            aspectRatio: placement.width / placement.height,
            startPointerX: touch.clientX,
            startPointerY: touch.clientY,
            startHandleX: placement.x,
            startHandleY: placement.y,
            startWidth: placement.width,
            startHeight: placement.height,
            minSize
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
        return <div className="p-8 text-center text-muted-foreground">Loading document...</div>;
    }

    if (orderError || !order) {
        return <div className="p-8 text-center text-destructive">{orderError || "Order not found"}</div>;
    }

    return (
        <div className="min-h-[100dvh] bg-gradient-to-b from-[#f8f5f2] via-[#fbfbfb] to-background px-4 pb-8">
            <SignatureModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                onSave={handleModalSave}
            />

            <div className="max-w-6xl mx-auto pt-6">
                <header className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Sign Delivery Document</h1>
                        <p className="text-muted-foreground">
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
                        >
                            {isSaving ? "Saving..." : "Finish & Save"}
                        </Button>
                    </div>
                </header>

                <Card className="overflow-hidden">
                    <div className="flex flex-col gap-2 border-b border-border bg-gradient-to-r from-muted/40 to-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Picklist</span>
                            <span className="mx-2 text-muted-foreground/40">•</span>
                            <span>1 page</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            Drag to place • Resize from bottom-left • Tap Save when finished
                        </div>
                    </div>
                    <div
                        className="relative flex min-h-[500px] justify-center overflow-hidden bg-muted/30 p-4 select-none"
                        ref={viewerRef}
                    >
                        {selectedPdfUrl ? (
                            <div className="relative shadow-premium ring-1 ring-border/50">
                                    <Document
                                        file={selectedPdfUrl}
                                        loading={<div className="p-10 text-muted-foreground">Loading PDF...</div>}
                                        error={<div className="p-10 text-destructive">Failed to load PDF</div>}
                                    >
                                        <Page
                                            pageNumber={1}
                                            width={containerWidth || undefined}
                                            onLoadSuccess={handlePageLoad}
                                            renderTextLayer={false}
                                            renderAnnotationLayer={false}
                                            className="bg-background"
                                        />
                                    </Document>

                                {/* Overlay Layer */}
                                {placements.map(p => (
                                    <div
                                        key={p.id}
                                        className={`group cursor-move touch-none select-none ${selectedPlacementId === p.id ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`}
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
                                            <Button
                                                type="button"
                                                data-delete-button
                                                variant="destructive"
                                                size="icon"
                                                className="pointer-events-auto absolute -right-3 -top-3 z-20 h-7 w-7 rounded-full p-0 shadow-premium"
                                                onPointerDown={(e) => { e.stopPropagation(); }}
                                                onClick={(e) => { e.stopPropagation(); removePlacement(p.id); }}
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        )}

                                        {(selectedPlacementId === p.id) && (
                                            <div
                                                data-resize-handle
                                                className="pointer-events-auto absolute -bottom-3 -left-3 z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary bg-background shadow-premium transition-transform hover:scale-110 cursor-nw-resize"
                                                onPointerDown={(e) => handleResizePointerDown(e, p.id)}
                                                onPointerUp={handlePointerUp}
                                                onPointerCancel={handlePointerUp}
                                                onTouchStart={(e) => handleResizeTouchStart(e, p.id)}
                                                onTouchEnd={handleWindowTouchEnd}
                                                style={{ touchAction: 'none' }}
                                            >
                                                <svg className="h-3 w-3 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                                        <div className="rounded-full bg-foreground/85 px-4 py-2 text-sm text-background backdrop-blur-sm">
                                            Tap "Add Signature" to draw, then drag to place
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="self-center text-muted-foreground">No PDF Loaded</div>
                        )}
                    </div>

                    {/* Mobile Floating Action Button */}
                    <div className="sm:hidden fixed bottom-6 right-6">
                        <Button
                            className="h-14 w-14 rounded-full p-0 shadow-premium"
                            onClick={useLastSignature}
                        >
                            <PenTool className="w-6 h-6 text-white" />
                        </Button>
                    </div>

                    {error && (
                        <div className="border-t border-destructive/20 bg-destructive/10 p-4 text-center text-sm text-destructive">
                            {error}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}

export default DocumentSigningPage;
