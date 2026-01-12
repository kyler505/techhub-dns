import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFPageProxy } from "pdfjs-dist";
// pdf-lib is used server-side for PDF bundling
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { ordersApi } from "../api/orders";
import { OrderDetail } from "../types/order";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

interface PdfEntry {
    name: string;
    filename: string;
    url: string;
}

const DEVICE_PIXEL_RATIO = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

function DocumentSigningPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [selectedPdf, setSelectedPdf] = useState<PdfEntry | null>(null);
    const [loadingOrder, setLoadingOrder] = useState(true);
    const [orderError, setOrderError] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number>();
    const [pageNumber, setPageNumber] = useState(1);
    const [pageViewport, setPageViewport] = useState<{ width: number; height: number } | null>(null);
    const [renderSize, setRenderSize] = useState<{ width: number; height: number } | null>(null);
    const [containerWidth, setContainerWidth] = useState<number | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);

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

                // Set up PDF entry for the order's picklist
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

    // Immediate fallback: Try to set containerWidth when viewerRef becomes available
    useEffect(() => {
        if (viewerRef.current && !containerWidth) {
            console.log('Immediate fallback: viewerRef available, trying to get container width');
            const rect = viewerRef.current.getBoundingClientRect();
            if (rect.width > 0) {
                console.log('Immediate fallback: Setting containerWidth to:', rect.width);
                setContainerWidth(rect.width);
            }
        }
    }, [containerWidth]); // Run whenever containerWidth changes (or initially)
    const [hasSignature, setHasSignature] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPageRendering, setIsPageRendering] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const viewerRef = useRef<HTMLDivElement | null>(null);
    const pointerIdRef = useRef<number | null>(null);

    const selectedPdfUrl = useMemo(() => (selectedPdf ? selectedPdf.url : null), [selectedPdf]);

    useEffect(() => {
        if (!viewerRef.current) {
            console.log('ResizeObserver: viewerRef.current is null');
            return undefined;
        }

        console.log('ResizeObserver: Setting up observer on element:', viewerRef.current);

        const observer = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            console.log('ResizeObserver fired, container width:', rect?.width, 'height:', rect?.height);
            if (rect && rect.width > 0) {
                console.log('Setting containerWidth to:', rect.width);
                setContainerWidth(rect.width);
            }
        });

        observer.observe(viewerRef.current);
        return () => {
            console.log('ResizeObserver: Disconnecting');
            observer.disconnect();
        };
    }, []);

    useEffect(() => {
        console.log('Debug - pageViewport:', pageViewport, 'containerWidth:', containerWidth, 'renderSize:', renderSize, 'selectedPdf:', !!selectedPdf);
        if (!pageViewport || containerWidth === null || containerWidth === 0) return;
        const nextScale = containerWidth / pageViewport.width;
        setRenderSize({
            width: pageViewport.width * nextScale,
            height: pageViewport.height * nextScale,
        });
    }, [containerWidth, pageViewport]);

    // Fallback: If we have viewport but no containerWidth, try to get it from the DOM
    useEffect(() => {
        if (pageViewport && !containerWidth && viewerRef.current && !loadingOrder) {
            console.log('Fallback: Trying to get container width from DOM');
            const rect = viewerRef.current.getBoundingClientRect();
            if (rect.width > 0) {
                console.log('Fallback: Got width from getBoundingClientRect:', rect.width);
                setContainerWidth(rect.width);
            }
        }
    }, [pageViewport, containerWidth, loadingOrder]);

    // Fallback: If we have a selected PDF but no renderSize after a delay, try to force it
    useEffect(() => {
        if (selectedPdf && !renderSize && !loadingOrder && pageViewport && containerWidth) {
            console.log('Fallback: Attempting to force renderSize calculation');
            const timer = setTimeout(() => {
                if (pageViewport && containerWidth && !renderSize) {
                    console.log('Fallback: Setting renderSize');
                    const nextScale = containerWidth / pageViewport.width;
                    setRenderSize({
                        width: pageViewport.width * nextScale,
                        height: pageViewport.height * nextScale,
                    });
                }
            }, 1000); // Reduced to 1 second since we have fallbacks now
            return () => clearTimeout(timer);
        }
    }, [selectedPdf, renderSize, pageViewport, containerWidth, loadingOrder]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !renderSize) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = renderSize.width * DEVICE_PIXEL_RATIO;
        canvas.height = renderSize.height * DEVICE_PIXEL_RATIO;
        canvas.style.width = `${renderSize.width}px`;
        canvas.style.height = `${renderSize.height}px`;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.scale(DEVICE_PIXEL_RATIO, DEVICE_PIXEL_RATIO);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.strokeStyle = "#111827";
        setHasSignature(false);
    }, [renderSize, pageNumber, selectedPdf]);

    const clearSignature = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !renderSize) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.scale(DEVICE_PIXEL_RATIO, DEVICE_PIXEL_RATIO);
        setHasSignature(false);
    }, [renderSize]);

    useEffect(() => {
        if (!selectedPdf) return;
        clearSignature();
        setIsPageRendering(true);
    }, [clearSignature, pageNumber, selectedPdf]);

    const handleLoadSuccess = useCallback(({ numPages: loadedPages }: { numPages: number }) => {
        console.log('PDF loaded successfully with', loadedPages, 'pages');
        setNumPages(loadedPages);
        setPageNumber(1);
        setError(null);
    }, []);

    const handlePageLoad = useCallback((page: PDFPageProxy) => {
        console.log('PDF page loaded, setting viewport');
        const viewport = page.getViewport({ scale: 1 });
        console.log('Viewport:', viewport.width, 'x', viewport.height);
        setPageViewport({ width: viewport.width, height: viewport.height });
        setIsPageRendering(false);
    }, []);

    const handlePageRender = useCallback(() => {
        setIsPageRendering(false);
    }, []);

    const pointerPosition = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
    }, []);

    const startDrawing = useCallback(
        (event: PointerEvent<HTMLCanvasElement>) => {
            if (!canvasRef.current || !renderSize || !selectedPdfUrl) return;
            event.preventDefault();
            const context = canvasRef.current.getContext("2d");
            if (!context) return;

            const { x, y } = pointerPosition(event);
            pointerIdRef.current = event.pointerId;
            canvasRef.current.setPointerCapture(event.pointerId);
            context.beginPath();
            context.moveTo(x, y);
            context.lineWidth = Math.max(2, 4 * (event.pressure || 0.5));
            setIsDrawing(true);
        },
        [pointerPosition, renderSize, selectedPdfUrl],
    );

    const drawStroke = useCallback(
        (event: PointerEvent<HTMLCanvasElement>) => {
            if (!isDrawing || !canvasRef.current) return;
            event.preventDefault();
            const context = canvasRef.current.getContext("2d");
            if (!context) return;

            const { x, y } = pointerPosition(event);
            context.lineWidth = Math.max(2, 4 * (event.pressure || 0.5));
            context.lineTo(x, y);
            context.stroke();
            setHasSignature(true);
        },
        [isDrawing, pointerPosition],
    );

    const finishDrawing = useCallback(
        (event: PointerEvent<HTMLCanvasElement>) => {
            if (!isDrawing || !canvasRef.current) return;
            event.preventDefault();
            drawStroke(event);

            const pointerId = pointerIdRef.current;
            if (pointerId !== null) {
                try {
                    canvasRef.current.releasePointerCapture(pointerId);
                } catch (releaseError) {
                    console.warn("Pointer capture release failed", releaseError);
                }
            }

            setIsDrawing(false);
            pointerIdRef.current = null;
        },
        [drawStroke, isDrawing],
    );

    const isCanvasReady = Boolean(renderSize && selectedPdfUrl);

    const saveSignedPdf = useCallback(async () => {
        if (!order || !canvasRef.current || !selectedPdfUrl) return;
        if (!hasSignature) {
            setError("Add a signature before saving.");
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            // Convert canvas to base64 for transmission
            const signatureImage = canvasRef.current.toDataURL('image/png');

            // Send signature data to backend for bundling
            await ordersApi.signOrder(order.id, {
                signature_image: signatureImage,
                page_number: pageNumber,
                position: { x: 50, y: 60 } // Approximate position of signature line
            });

            // Navigate back to the delivery run or order detail
            const returnTo = searchParams.get('returnTo') || `/orders/${order.id}`;
            navigate(returnTo, {
                state: { message: 'Document signed successfully! Bundled documents generated and order marked as delivered.' }
            });

        } catch (saveError) {
            console.error(saveError);
            setError("Unable to complete signing. Please try again.");
        } finally {
            setIsSaving(false);
        }
    }, [hasSignature, order, selectedPdfUrl, pageNumber, searchParams, navigate]);

    if (loadingOrder) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-sm text-muted-foreground">Loading order details...</div>
            </div>
        );
    }

    if (orderError || !order) {
        return (
            <div className="text-center py-12">
                <div className="text-red-600 mb-4">{orderError || "Order not found"}</div>
                <button
                    onClick={() => navigate(-1)}
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                    Go Back
                </button>
            </div>
        );
    }

    return (
        <div className="px-4 pb-8">
            <div className="max-w-6xl mx-auto">
                <header className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Sign Delivery Document</h1>
                    <p className="text-gray-600 mt-1">
                        Order {order.inflow_order_id || order.id.slice(0, 8)} - {order.recipient_name || 'Unknown Recipient'}
                    </p>
                </header>

                {!selectedPdf && (
                    <section className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div className="text-yellow-800">
                            <strong>No picklist available</strong> - This order doesn't have a generated picklist to sign.
                        </div>
                    </section>
                )}

                {selectedPdf && (
                    <section className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="text-blue-800">
                            <strong>Ready to sign:</strong> {selectedPdf.name}
                        </div>
                    </section>
                )}

                <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Document preview</h2>
                            <p className="text-sm text-gray-600">Switch pages and draw directly on top of the PDF.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="px-4 py-2 rounded-md bg-gray-100 text-gray-800 text-sm font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setPageNumber((prev) => Math.max(1, prev - 1))}
                                disabled={!numPages || pageNumber <= 1}
                            >
                                Previous
                            </button>
                            <div className="text-sm text-gray-700">
                                Page {pageNumber} {numPages ? `of ${numPages}` : ""}
                            </div>
                            <button
                                type="button"
                                className="px-4 py-2 rounded-md bg-gray-100 text-gray-800 text-sm font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setPageNumber((prev) => (numPages ? Math.min(numPages, prev + 1) : prev))}
                                disabled={!numPages || (numPages ? pageNumber >= numPages : true)}
                            >
                                Next
                            </button>
                        </div>
                    </div>

                    <div
                        className="mt-4 relative bg-gray-50 border border-dashed border-gray-300 rounded-lg min-h-[400px] flex items-center justify-center"
                        ref={viewerRef}
                    >
                        {selectedPdfUrl ? (
                            <div className="w-full flex justify-center py-4">
                                <div
                                    className={`relative ${isDrawing ? "ring-2 ring-[#800000] ring-offset-2" : ""}`}
                                    style={{ width: renderSize?.width ?? "100%" }}
                                >
                                    <Document
                                        key={selectedPdf?.filename ?? "pdf-document"}
                                        file={selectedPdfUrl}
                                        loading={<div className="text-gray-700">Loading PDF...</div>}
                                        onLoadSuccess={handleLoadSuccess}
                                        onLoadError={(loadError: Error) => setError(loadError.message)}
                                        className="border border-gray-200 rounded-lg overflow-hidden bg-white"
                                    >
                                        <Page
                                            key={`${selectedPdfUrl}-${pageNumber}`}
                                            pageNumber={pageNumber}
                                            width={renderSize?.width ?? containerWidth ?? undefined}
                                            renderMode="canvas"
                                            renderTextLayer={false}
                                            renderAnnotationLayer={false}
                                            loading={<div className="p-6 text-gray-700">Rendering page...</div>}
                                            onLoadSuccess={handlePageLoad}
                                            onRenderSuccess={handlePageRender}
                                            onRenderError={(renderError: Error) => setError(renderError.message)}
                                        />
                                    </Document>

                                    {renderSize && (
                                        <canvas
                                            ref={canvasRef}
                                            className={`absolute inset-0 z-20 ${selectedPdf ? "cursor-crosshair" : "cursor-not-allowed"}`}
                                            style={{ touchAction: "none" }}
                                            onPointerDown={startDrawing}
                                            onPointerMove={drawStroke}
                                            onPointerUp={finishDrawing}
                                            onPointerCancel={finishDrawing}
                                            onPointerLeave={finishDrawing}
                                        />
                                    )}

                                    {!isCanvasReady && (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="bg-white/80 border border-gray-200 rounded-md px-4 py-2 text-gray-700">
                                                Select a PDF to start signing.
                                            </div>
                                        </div>
                                    )}

                                    {isDrawing && (
                                        <span className="absolute top-2 right-2 bg-[#800000] text-white text-xs font-semibold px-3 py-1 rounded-full shadow">
                                            Drawing...
                                        </span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-gray-600 py-10">Choose a PDF above to begin.</div>
                        )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3 items-center justify-between">
                        {error && (
                            <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-md">{error}</div>
                        )}
                        <div className="flex gap-3 ml-auto">
                            <button
                                type="button"
                                className="px-4 py-2 rounded-md border border-gray-300 text-gray-800 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={clearSignature}
                                disabled={!isCanvasReady || !hasSignature}
                            >
                                Clear Signature
                            </button>
                            <button
                                type="button"
                                className="px-4 py-2 rounded-md bg-[#800000] text-white text-sm font-semibold hover:bg-[#660000] disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={saveSignedPdf}
                                disabled={!isCanvasReady || !hasSignature || isSaving || isPageRendering}
                            >
                                {isSaving ? "Saving..." : "Save Signed PDF"}
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

export default DocumentSigningPage;
