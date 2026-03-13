import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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
import { signatureCache, type LastSignature } from "../lib/signatureCache";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { PenTool, X } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const SIGNATURE_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

function normalizeText(value: string | undefined): string {
    return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

type ReusableSignatureState =
    | { canUse: true; entry: LastSignature }
    | { canUse: false; reason: string };

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


type PlacementOverlayProps = {
    placement: Placement;
    pageViewport: { width: number; height: number } | null;
    scale: number;
    isSelected: boolean;
    isActiveDrag: boolean;
    instructionsId: string;
    onPointerDown: (event: React.PointerEvent, id: string) => void;
    onTouchStart: (event: React.TouchEvent, id: string) => void;
    onResizePointerDown: (event: React.PointerEvent, id: string) => void;
    onResizeTouchStart: (event: React.TouchEvent, id: string) => void;
    onSelect: (id: string) => void;
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>, placement: Placement) => void;
    onRemove: (id: string) => void;
};

const PlacementOverlay = memo(function PlacementOverlay({
    placement,
    pageViewport,
    scale,
    isSelected,
    isActiveDrag,
    instructionsId,
    onPointerDown,
    onTouchStart,
    onResizePointerDown,
    onResizeTouchStart,
    onSelect,
    onKeyDown,
    onRemove,
}: PlacementOverlayProps) {
    const style = useMemo(() => {
        if (!pageViewport) return { display: 'none' } as const;

        const xPx = placement.x * scale;
        const yPx = (pageViewport.height - placement.y - placement.height) * scale;
        const wPx = placement.width * scale;
        const hPx = placement.height * scale;

        return {
            left: 0,
            top: 0,
            width: `${wPx}px`,
            height: `${hPx}px`,
            position: 'absolute' as const,
            transform: `translate3d(${xPx}px, ${yPx}px, 0)`,
            ...(isActiveDrag ? { willChange: 'transform' as const } : {}),
        };
    }, [isActiveDrag, pageViewport, placement, scale]);

    if (!pageViewport) {
        return null;
    }

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label="Signature placement"
            aria-describedby={instructionsId}
            className={`group cursor-move touch-none select-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-ring focus-visible:outline-offset-2 ${isSelected ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`}
            style={{
                ...style,
                touchAction: 'none',
            }}
            onPointerDown={(e) => {
                onSelect(placement.id);
                onPointerDown(e, placement.id);
            }}
            onTouchStart={(e) => {
                onSelect(placement.id);
                onTouchStart(e, placement.id);
            }}
            onKeyDown={(event) => onKeyDown(event, placement)}
        >
            <img
                src={placement.dataUrl}
                alt="Signature"
                className="h-full w-full object-contain pointer-events-none"
            />

            {isSelected && (
                <Button
                    type="button"
                    data-delete-button
                    variant="destructive"
                    size="icon"
                    aria-label="Remove signature"
                    className="pointer-events-auto absolute -right-3 -top-3 z-20 h-9 w-9 rounded-full p-0 shadow-premium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
                    onPointerDown={(e) => {
                        e.stopPropagation();
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove(placement.id);
                    }}
                >
                    <X className="h-4 w-4" />
                </Button>
            )}

            {isSelected && (
                <button
                    type="button"
                    aria-label="Resize signature"
                    data-resize-handle
                    className="pointer-events-auto absolute -bottom-4 -left-4 z-20 flex h-10 w-10 cursor-nw-resize items-center justify-center rounded-full border-2 border-primary bg-background shadow-premium transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    onPointerDown={(e) => onResizePointerDown(e, placement.id)}
                    onTouchStart={(e) => onResizeTouchStart(e, placement.id)}
                    style={{ touchAction: 'none' }}
                >
                    <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18" />
                        <path d="M12 6h6v6" />
                    </svg>
                </button>
            )}
        </div>
    );
});

type PdfPaneProps = {
    fileUrl: string;
    containerWidth: number | null;
    onPageLoad: (page: PDFPageProxy) => void;
};

const PdfPane = memo(function PdfPane({ fileUrl, containerWidth, onPageLoad }: PdfPaneProps) {
    return (
        <Document
            file={fileUrl}
            loading={<div className="p-10 text-muted-foreground">Loading PDF...</div>}
            error={<div className="p-10 text-destructive">Failed to load PDF</div>}
        >
            <Page
                pageNumber={1}
                width={containerWidth || undefined}
                onLoadSuccess={onPageLoad}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                className="bg-background"
            />
        </Document>
    );
});



const PLACEMENT_INSTRUCTIONS_ID = "signature-placement-instructions";
const MIN_PLACEMENT_SIZE_PT = 32;

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
    const [activeInteraction, setActiveInteraction] = useState<{ id: string; mode: 'drag' | 'resize' } | null>(null);
    const viewerRef = useRef<HTMLDivElement | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cachedSignature, setCachedSignature] = useState<LastSignature | null>(null);

    const refreshCachedSignature = useCallback(() => {
        setCachedSignature(signatureCache.load());
    }, []);

    useEffect(() => {
        refreshCachedSignature();
    }, [refreshCachedSignature]);

    const orderRecipientNormalized = useMemo(
        () => normalizeText(order?.recipient_name),
        [order?.recipient_name]
    );

    const orderLocationNormalized = useMemo(
        () => normalizeText(order?.delivery_location),
        [order?.delivery_location]
    );

    const reusableSignature = useMemo<ReusableSignatureState>(() => {
        if (!cachedSignature) {
            return { canUse: false, reason: "No saved signature available." };
        }

        const ageMs = Date.now() - cachedSignature.createdAt;
        if (ageMs > SIGNATURE_CACHE_TTL_MS) {
            return { canUse: false, reason: "Saved signature expired. Capture a new one." };
        }

        if (!cachedSignature.recipientNameNormalized || !cachedSignature.deliveryLocationNormalized) {
            return { canUse: false, reason: "Saved signature is missing recipient/location context." };
        }

        if (
            cachedSignature.recipientNameNormalized !== orderRecipientNormalized ||
            cachedSignature.deliveryLocationNormalized !== orderLocationNormalized
        ) {
            return {
                canUse: false,
                reason: "Saved signature belongs to a different recipient or location.",
            };
        }

        return { canUse: true, entry: cachedSignature };
    }, [cachedSignature, orderLocationNormalized, orderRecipientNormalized]);

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
        if (order) {
            signatureCache.save(dataUrl, w, h, {
                recipientNameNormalized: normalizeText(order.recipient_name),
                deliveryLocationNormalized: normalizeText(order.delivery_location),
                sourceOrderId: order.id,
            });
            refreshCachedSignature();
        }

        const placed = addPlacement(dataUrl, w, h);
        if (placed) {
            setModalOpen(false);
        }
        return placed;
    };

    const openSignatureModal = () => {
        setError(null);
        setModalOpen(true);
    };

    const useLastSignature = () => {
        if (!reusableSignature.canUse) {
            setError(reusableSignature.reason);
            return;
        }

        const placed = addPlacement(
            reusableSignature.entry.dataUrl,
            reusableSignature.entry.width,
            reusableSignature.entry.height
        );

        if (!placed) {
            return;
        }

        setError(null);
    };

    const removePlacement = useCallback((id: string) => {
        setPlacements((prev) => prev.filter((p) => p.id !== id));
        setSelectedPlacementId((prev) => (prev === id ? null : prev));
    }, []);

    const pxToPoints = useCallback((px: number) => {
        const effectiveScale = scale && scale > 0 ? scale : 1;
        return px / effectiveScale;
    }, [scale]);

    const movePlacement = useCallback((id: string, deltaX: number, deltaY: number) => {
        setPlacements((prev) => prev.map((placement) => {
            if (placement.id !== id) return placement;
            return {
                ...placement,
                x: placement.x + deltaX,
                y: placement.y + deltaY,
            };
        }));
    }, []);

    const resizePlacement = useCallback((id: string, delta: number) => {
        setPlacements((prev) => prev.map((placement) => {
            if (placement.id !== id) return placement;

            const aspectRatio = placement.width / Math.max(placement.height, 0.1);
            let nextWidth = placement.width + delta;
            nextWidth = Math.max(nextWidth, MIN_PLACEMENT_SIZE_PT);
            const nextHeight = Math.max(nextWidth / aspectRatio, MIN_PLACEMENT_SIZE_PT);

            return {
                ...placement,
                width: nextWidth,
                height: nextHeight,
            };
        }));
    }, []);

    const handlePlacementKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>, placement: Placement) => {
        const key = event.key;
        const moveStepPx = 8;
        const movementStep = pxToPoints(moveStepPx);
        const resizeStep = pxToPoints(moveStepPx);

        if (key === "Delete" || key === "Backspace") {
            event.preventDefault();
            removePlacement(placement.id);
            return;
        }

        const arrowMoves: Record<string, { dx: number; dy: number }> = {
            ArrowLeft: { dx: -movementStep, dy: 0 },
            ArrowRight: { dx: movementStep, dy: 0 },
            ArrowUp: { dx: 0, dy: movementStep },
            ArrowDown: { dx: 0, dy: -movementStep },
        };

        if (key in arrowMoves) {
            event.preventDefault();
            const { dx, dy } = arrowMoves[key];
            if (event.shiftKey) {
                const direction = key === "ArrowLeft" || key === "ArrowDown" ? -resizeStep : resizeStep;
                resizePlacement(placement.id, direction);
            } else {
                movePlacement(placement.id, dx, dy);
            }
        }
    }, [movePlacement, pxToPoints, removePlacement, resizePlacement]);

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

    const latestClientPosRef = useRef<{ x: number; y: number } | null>(null);
    const pendingRafRef = useRef<number | null>(null);

    const windowPointerListenersRef = useRef(false);
    const windowTouchListenersRef = useRef(false);
    const touchListenerOptions = useRef<AddEventListenerOptions>({ passive: false });

    const attachPointerListeners = () => {
        if (windowPointerListenersRef.current) return;
        window.addEventListener('pointermove', handlePointerMove as unknown as EventListener);
        window.addEventListener('pointerup', handleWindowPointerUp);
        window.addEventListener('pointercancel', handleWindowPointerUp);
        windowPointerListenersRef.current = true;
    };

    const detachPointerListeners = () => {
        if (!windowPointerListenersRef.current) return;
        window.removeEventListener('pointermove', handlePointerMove as unknown as EventListener);
        window.removeEventListener('pointerup', handleWindowPointerUp);
        window.removeEventListener('pointercancel', handleWindowPointerUp);
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
    };

    const cancelPendingMove = () => {
        latestClientPosRef.current = null;
        if (pendingRafRef.current !== null) {
            cancelAnimationFrame(pendingRafRef.current);
            pendingRafRef.current = null;
        }
    };

    const applyLatestMove = (clientX: number, clientY: number) => {
        if (interactionModeRef.current === 'resize') {
            updateResize(clientX, clientY);
            return;
        }
        updateDrag(clientX, clientY);
    };

    const scheduleLatestMove = (clientX: number, clientY: number) => {
        latestClientPosRef.current = { x: clientX, y: clientY };
        if (pendingRafRef.current !== null) return;

        pendingRafRef.current = requestAnimationFrame(() => {
            pendingRafRef.current = null;
            const pos = latestClientPosRef.current;
            if (!pos) return;
            applyLatestMove(pos.x, pos.y);
        });
    };

    const handlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('[data-resize-handle], [data-delete-button]')) return;
        e.stopPropagation(); // Prevent PDF scrolling if possible? Or maybe just capture
        const placement = placements.find(p => p.id === id);
        if (!placement) return;

        interactionTypeRef.current = 'pointer';
        interactionModeRef.current = 'drag';
        setActiveInteraction({ id, mode: 'drag' });
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
    }, [placements]);

    const handlePointerMove = useCallback((e: React.PointerEvent | PointerEvent) => {
        if (interactionTypeRef.current !== 'pointer') return;
        if (!dragStartRef.current && !resizeStartRef.current) return;
        if ('preventDefault' in e) {
            e.preventDefault();
        }

        scheduleLatestMove(e.clientX, e.clientY);
    }, []);

    const handleTouchStart = useCallback((e: React.TouchEvent, id: string) => {
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
        setActiveInteraction({ id, mode: 'drag' });
        setSelectedPlacementId(id);
        attachTouchListeners();

        dragStartRef.current = {
            id,
            startX: touch.clientX,
            startY: touch.clientY,
            initX: placement.x,
            initY: placement.y
        };
    }, [placements]);

    const handleTouchMove = useCallback((e: TouchEvent | React.TouchEvent) => {
        if (interactionTypeRef.current !== 'touch') return;
        const touch = 'touches' in e ? (e.touches[0] || e.changedTouches[0]) : null;
        if (!touch) return;
        if ('preventDefault' in e) {
            e.preventDefault();
        }

        scheduleLatestMove(touch.clientX, touch.clientY);
    }, []);

    const endInteraction = () => {
        dragStartRef.current = null;
        resizeStartRef.current = null;
        interactionTypeRef.current = null;
        interactionModeRef.current = null;
        cancelPendingMove();
        setActiveInteraction(null);
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
        const target = e.target as (Element | null);
        const releasable = target as unknown as { hasPointerCapture?: (pointerId: number) => boolean; releasePointerCapture?: (pointerId: number) => void };
        if (releasable?.hasPointerCapture?.(e.pointerId)) {
            releasable.releasePointerCapture?.(e.pointerId);
        }

        endInteraction();
        detachPointerListeners();
    };

    const handleWindowTouchEnd = () => {
        endInteraction();
        detachTouchListeners();
    };

    const handleResizePointerDown = useCallback((e: React.PointerEvent, id: string) => {
        e.stopPropagation();
        const placement = placements.find(p => p.id === id);
        if (!placement) return;

        interactionTypeRef.current = 'pointer';
        interactionModeRef.current = 'resize';
        setActiveInteraction({ id, mode: 'resize' });
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
    }, [placements]);

    const handleResizeTouchStart = useCallback((e: React.TouchEvent, id: string) => {
        if (interactionTypeRef.current === 'pointer') return;
        const placement = placements.find(p => p.id === id);
        const touch = e.touches[0];
        if (!placement || !touch) return;

        e.stopPropagation();
        e.preventDefault();
        interactionTypeRef.current = 'touch';
        interactionModeRef.current = 'resize';
        setActiveInteraction({ id, mode: 'resize' });
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
    }, [placements]);

    useEffect(() => {
        return () => {
            cancelPendingMove();
            detachPointerListeners();
            detachTouchListeners();
        };
    }, []);

    const placementOverlays = useMemo(() => {
        if (!pageViewport) return null;
        return placements.map((p) => {
            const isActiveDrag = activeInteraction?.id === p.id && activeInteraction.mode === 'drag';
            return (
                <PlacementOverlay
                    key={p.id}
                    placement={p}
                    pageViewport={pageViewport}
                    scale={scale}
                    isSelected={selectedPlacementId === p.id}
                    isActiveDrag={isActiveDrag}
                    onPointerDown={handlePointerDown}
                    onTouchStart={handleTouchStart}
                    onResizePointerDown={handleResizePointerDown}
                    onResizeTouchStart={handleResizeTouchStart}
                    onRemove={removePlacement}
                />
            );
        });
    }, [activeInteraction?.id, activeInteraction?.mode, handlePointerDown, handleResizePointerDown, handleResizeTouchStart, handleTouchStart, pageViewport, placements, removePlacement, scale, selectedPlacementId]);

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
                })),
                expected_updated_at: order.updated_at,
            };

            await ordersApi.signOrder(order.id, payload);

            const returnTo = searchParams.get('returnTo') || `/orders/${order.id}`;
            navigate(returnTo, {
                state: { message: 'Document signed successfully!' }
            });

        } catch (saveError: any) {
            console.error(saveError);
            if (saveError?.response?.status === 409) {
                setError("This order changed while you were signing. Reloaded the latest order data; review and sign again.");
                const refreshedOrder = await ordersApi.getOrder(order.id);
                setOrder(refreshedOrder);
                return;
            }
            setError("Unable to complete signing. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    // --- Render ---

    if (loadingOrder) {
        return <div className="p-8 text-center text-muted-foreground">Loading document...</div>;
    }

    if (orderError || !order) {
        return <div className="p-8 text-center text-destructive">{orderError || "Order not found"}</div>;
    }

    return (
        <div className="min-h-[100dvh] bg-gradient-to-b from-white/70 via-muted/20 to-background px-4 pb-8">
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
                        {reusableSignature.canUse && (
                            <p className="text-xs text-muted-foreground">
                                Last signature from order {reusableSignature.entry.sourceOrderId?.slice(0, 8) || "unknown"} is available for this recipient/location.
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={openSignatureModal}
                            className="hidden sm:flex"
                        >
                            <PenTool className="w-4 h-4 mr-2" />
                            Add Signature
                        </Button>
                        <Button
                            variant="outline"
                            onClick={useLastSignature}
                            className="hidden sm:flex"
                            disabled={!reusableSignature.canUse}
                            title={reusableSignature.canUse ? "Apply last saved signature" : reusableSignature.reason}
                        >
                            Use Last Signature
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
                    <p id={PLACEMENT_INSTRUCTIONS_ID} className="sr-only">
                        Focus a signature placement, use arrow keys to move, hold shift plus arrow to resize, delete/backspace removes.
                    </p>
                    <div
                        className="relative flex min-h-[500px] justify-center overflow-hidden bg-muted/30 p-4 select-none"
                        ref={viewerRef}
                    >
                         {selectedPdfUrl ? (
                             <div className="relative shadow-premium ring-1 ring-border/50">
                                 <PdfPane
                                     fileUrl={selectedPdfUrl}
                                     containerWidth={containerWidth}
                                     onPageLoad={handlePageLoad}
                                 />

                                  {/* Overlay Layer */}
                                  {placementOverlays}

                                 {/* Empty State Hint */}
                                 {placements.length === 0 && (
                                     <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                                         <div className="rounded-full bg-foreground/85 px-4 py-2 text-sm text-background backdrop-blur-sm">
                                             Tap "Add Signature" to draw or "Use Last Signature", then drag to place
                                         </div>
                                     </div>
                                 )}
                             </div>
                         ) : (
                             <div className="self-center text-muted-foreground">No PDF Loaded</div>
                         )}
                    </div>

                    {/* Mobile Floating Action Button */}
                    <div className="sm:hidden fixed bottom-4 right-4 flex flex-col items-end gap-3">
                        <Button
                            variant="outline"
                            onClick={useLastSignature}
                            disabled={!reusableSignature.canUse}
                            title={reusableSignature.canUse ? "Apply last saved signature" : reusableSignature.reason}
                            className="min-h-[44px] min-w-[160px] text-xs font-semibold"
                        >
                            Use Last Signature
                        </Button>
                        <Button
                            className="h-14 w-14 rounded-full p-0 shadow-premium"
                            onClick={openSignatureModal}
                            aria-label="Add new signature"
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
