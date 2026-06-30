import { useEffect, useState, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

// pdf.js worker via CDN — bundling the worker from pdfjs-dist breaks in Workers SSR.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  zoom: number;
  page: number;
  onLoadPages?: (n: number) => void;
  onDownload?: () => void;
  overlay?: React.ReactNode;
}

export function PdfViewer({ url, zoom, page, onLoadPages, onDownload, overlay }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative flex w-full justify-center">
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => {
          setNumPages(numPages);
          onLoadPages?.(numPages);
        }}
        onLoadError={(e) => setError(e.message || "Failed to load PDF")}
        loading={
          <div className="flex h-96 items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading document…
          </div>
        }
        error={
          <div className="flex h-96 flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <p className="text-sm font-medium">Preview unavailable</p>
            {error && <p className="max-w-md text-xs text-slate-500">{error}</p>}
            {onDownload && (
              <Button size="sm" variant="outline" onClick={onDownload}>
                <Download className="mr-2 h-4 w-4" /> Download instead
              </Button>
            )}
          </div>
        }
      >
        {numPages !== null && (
          <div className="relative">
            <Page
              pageNumber={Math.min(Math.max(page, 1), numPages)}
              width={containerWidth * (zoom / 100)}
              renderAnnotationLayer={false}
              renderTextLayer
            />
            {overlay}
          </div>
        )}
      </Document>
    </div>
  );
}
