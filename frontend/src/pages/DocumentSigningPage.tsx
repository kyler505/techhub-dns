import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFPageProxy } from "pdfjs-dist";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

interface PdfEntry {
  name: string;
  filename: string;
  url: string;
}

const PDF_FILES: PdfEntry[] = Object.entries(
  import.meta.glob("../../public/pdfs/*.pdf", { eager: true, query: "?url", import: "default" })
).map(([path, url]) => {
  const normalizedPath = path.replace(/\\/g, "/");
  const filename = normalizedPath.split("/").pop() || "document.pdf";
  const name = filename.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");
  const normalizedUrl = (url as string).replace("/public/", "/");
  return {
    name: name || filename,
    filename,
    url: normalizedUrl,
  };
});

const DEVICE_PIXEL_RATIO = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

function DocumentSigningPage() {
  const [selectedPdf, setSelectedPdf] = useState<PdfEntry | null>(PDF_FILES[0] ?? null);
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState(1);
  const [pageViewport, setPageViewport] = useState<{ width: number; height: number } | null>(null);
  const [renderSize, setRenderSize] = useState<{ width: number; height: number } | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPageRendering, setIsPageRendering] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const availablePdfs = useMemo(() => PDF_FILES, []);
  const selectedPdfUrl = useMemo(() => (selectedPdf ? selectedPdf.url : null), [selectedPdf]);

  useEffect(() => {
    if (!viewerRef.current) return undefined;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setContainerWidth(rect.width);
    });

    observer.observe(viewerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pageViewport || containerWidth === null || containerWidth === 0) return;
    const nextScale = containerWidth / pageViewport.width;
    setRenderSize({
      width: pageViewport.width * nextScale,
      height: pageViewport.height * nextScale,
    });
  }, [containerWidth, pageViewport]);

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
    setNumPages(loadedPages);
    setPageNumber(1);
    setError(null);
  }, []);

  const handlePageLoad = useCallback((page: PDFPageProxy) => {
    const viewport = page.getViewport({ scale: 1 });
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
    if (!selectedPdf || !canvasRef.current || !selectedPdfUrl) return;
    if (!hasSignature) {
      setError("Add a signature before saving.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const canvas = canvasRef.current;
      const [pdfBytes, pngBytes] = await Promise.all([
        fetch(selectedPdfUrl).then((response) => {
          if (!response.ok) throw new Error("Failed to fetch PDF file.");
          return response.arrayBuffer();
        }),
        fetch(canvas.toDataURL("image/png")).then((res) => res.arrayBuffer()),
      ]);

      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pngImage = await pdfDoc.embedPng(pngBytes);
      const page = pdfDoc.getPage(pageNumber - 1);
      const { width: pageWidth, height: pageHeight } = page.getSize();

      page.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });

      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const signedText = `Signed ${new Date().toLocaleDateString()}`;
      page.drawText(signedText, {
        x: pageWidth - 170,
        y: 24,
        size: 12,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      });

      const signedPdfBytes = await pdfDoc.save();
      const signedPdfArray = Uint8Array.from(signedPdfBytes);
      const blob = new Blob([signedPdfArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      const fileName = selectedPdf.filename.replace(/\.pdf$/i, "");
      downloadLink.href = url;
      downloadLink.download = `${fileName}-SIGNED.pdf`;
      downloadLink.click();
      URL.revokeObjectURL(url);
    } catch (saveError) {
      console.error(saveError);
      setError("Unable to save the signed PDF. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [hasSignature, pageNumber, selectedPdf, selectedPdfUrl]);

  return (
    <div className="px-4 pb-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Document Signing</h1>
          <p className="text-gray-600 mt-1">
            Select a PDF placed in <code className="bg-gray-100 px-1 py-0.5 rounded">frontend/public/pdfs</code>, sign
            with your Apple Pencil, and download a flattened copy.
          </p>
        </header>

        <section className="mb-6 bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Available PDFs</h2>
              <p className="text-sm text-gray-600">
                Drop additional files into <span className="font-semibold">frontend/public/pdfs</span> to see them listed
                here.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-md bg-gray-100 text-gray-800 text-sm font-medium hover:bg-gray-200"
                onClick={() => {
                  setSelectedPdf(null);
                  setNumPages(undefined);
                  setPageNumber(1);
                  setPageViewport(null);
                  setRenderSize(null);
                  setError(null);
                  setIsPageRendering(false);
                  clearSignature();
                }}
              >
                Clear selection
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-md bg-gray-100 text-gray-800 text-sm font-medium hover:bg-gray-200"
                onClick={clearSignature}
                disabled={!isCanvasReady || !hasSignature}
              >
                Clear signature
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {availablePdfs.map((pdf) => {
              const isSelected = selectedPdf?.filename === pdf.filename;
              return (
                <button
                  key={pdf.filename}
                  type="button"
                  onClick={() => {
                    setSelectedPdf(pdf);
                    setPageNumber(1);
                    setIsPageRendering(true);
                    setError(null);
                    clearSignature();
                  }}
                  className={`w-full text-left rounded-lg border px-4 py-3 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#800000] ${
                    isSelected ? "border-[#800000] bg-[#800000]/10" : "border-gray-200 hover:border-[#800000]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">{pdf.name}</p>
                      <p className="text-sm text-gray-600">{pdf.filename}</p>
                    </div>
                    {isSelected && (
                      <span className="inline-flex items-center px-2 py-1 text-xs font-semibold text-[#800000] bg-white border border-[#800000]/30 rounded-full">
                        Selected
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {!availablePdfs.length && (
              <p className="col-span-full text-gray-600">
                No PDFs found. Add files to <span className="font-semibold">frontend/public/pdfs</span> to start signing.
              </p>
            )}
          </div>
        </section>

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
