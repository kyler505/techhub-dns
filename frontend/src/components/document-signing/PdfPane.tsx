import { Document, Page, pdfjs } from "react-pdf";
import type { PDFPageProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

interface PdfPaneProps {
  fileUrl: string;
  containerWidth: number | null;
  onPageLoad: (page: PDFPageProxy) => void;
}

export default function PdfPane({ fileUrl, containerWidth, onPageLoad }: PdfPaneProps) {
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
}
