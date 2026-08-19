import { useEffect, useState, useRef } from "react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type ReactPdfModule = typeof import("react-pdf");

interface PdfViewerProps {
  url: string;
  zoom: number;
  page: number;
  onLoadPages?: (n: number) => void;
  onDownload?: () => void;
  overlay?: React.ReactNode;
}

export function PdfViewer({ url, zoom, page, onLoadPages, onDownload, overlay }: PdfViewerProps) {
  const [pdfModule, setPdfModule] = useState<ReactPdfModule | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    let active = true;

    void import("react-pdf")
      .then((module) => {
        // Keep pdf.js and its worker entirely on the browser side. Evaluating
        // react-pdf/pdfjs-dist in the TanStack Start SSR graph breaks CJS/ESM
        // interop for uploaded-document and signing routes.
        module.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${module.pdfjs.version}/build/pdf.worker.min.mjs`;
        if (active) setPdfModule(module);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load PDF preview engine");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  if (!pdfModule) {
    return (
      <div ref={containerRef} className="relative flex w-full justify-center">
        <div className="flex h-96 w-full flex-col items-center justify-center gap-3 text-center text-slate-500">
          {error ? (
            <>
              <AlertTriangle className="h-10 w-10 text-amber-500" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Preview unavailable</p>
              <p className="max-w-md text-xs text-slate-500">{error}</p>
              {onDownload && (
                <Button size="sm" variant="outline" onClick={onDownload}>
                  <Download className="mr-2 h-4 w-4" /> Download instead
                </Button>
              )}
            </>
          ) : (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading document preview…</span>
            </>
          )}
        </div>
      </div>
    );
  }

  const { Document, Page } = pdfModule;

  return (
    <div ref={containerRef} className="relative flex w-full justify-center">
      <Document
        file={url}
        onLoadSuccess={({ numPages: loadedPages }) => {
          setNumPages(loadedPages);
          onLoadPages?.(loadedPages);
        }}
        onLoadError={(loadError) => setError(loadError.message || "Failed to load PDF")}
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
