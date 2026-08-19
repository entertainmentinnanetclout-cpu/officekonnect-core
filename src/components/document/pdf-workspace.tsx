import { useEffect, useRef, useState, useCallback, ReactNode } from "react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  Loader2,
  AlertTriangle,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Sidebar as SidebarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ReactPdfModule = typeof import("react-pdf");
type ReactPdfPage = ReactPdfModule["Page"];

export type PageRect = { width: number; height: number };

export interface PdfWorkspaceProps {
  url: string;
  onDownload?: () => void;
  /** Render an overlay per page. Receives 1-indexed page number and displayed rect (px). */
  renderPageOverlay?: (pageNumber: number, rect: PageRect) => ReactNode;
  /** Fires when a user clicks anywhere on a page (page coords normalized 0..1). */
  onPageClick?: (pageNumber: number, x: number, y: number) => void;
  /** Cursor style for the page surface (e.g. "crosshair" when placing). */
  pageCursor?: string;
}

export function PdfWorkspace({
  url,
  onDownload,
  renderPageOverlay,
  onPageClick,
  pageCursor,
}: PdfWorkspaceProps) {
  const [pdfModule, setPdfModule] = useState<ReactPdfModule | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [fitMode, setFitMode] = useState<"width" | "page" | "custom">("width");
  const [rotation, setRotation] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [showThumbs, setShowThumbs] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [containerWidth, setContainerWidth] = useState(800);
  const [containerHeight, setContainerHeight] = useState(1000);

  // react-pdf/pdfjs-dist must never be evaluated by the TanStack Start SSR graph.
  // Load it only after browser mount so uploaded previews and signing routes share
  // the same SSR-safe PDF boundary.
  useEffect(() => {
    let active = true;

    void import("react-pdf")
      .then((module) => {
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

  // Track container dims
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      setContainerWidth(el.clientWidth);
      setContainerHeight(el.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fullscreen sync
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen().catch(() => void 0);
    } else {
      document.exitFullscreen().catch(() => void 0);
    }
  };

  // Compute page width from fit / zoom
  const contentWidth = Math.max(320, containerWidth - (showThumbs ? 176 : 24));
  const pageWidth =
    fitMode === "width"
      ? contentWidth - 24
      : fitMode === "page"
        ? Math.min(contentWidth - 24, (containerHeight - 24) * 0.75)
        : ((contentWidth - 24) * zoom) / 100;

  // Detect active page while scrolling
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      let best = 1;
      let bestDist = Infinity;
      const midpoint = el.scrollTop + el.clientHeight / 2;
      pageRefs.current.forEach((node, page) => {
        const mid = node.offsetTop + node.offsetHeight / 2;
        const dist = Math.abs(mid - midpoint);
        if (dist < bestDist) {
          bestDist = dist;
          best = page;
        }
      });
      setActivePage(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [numPages]);

  const jumpToPage = useCallback((page: number) => {
    const node = pageRefs.current.get(page);
    if (node && scrollRef.current) {
      scrollRef.current.scrollTo({ top: node.offsetTop - 12, behavior: "smooth" });
    }
  }, []);

  const setZoomCustom = (next: number) => {
    setFitMode("custom");
    setZoom(Math.max(50, Math.min(300, next)));
  };

  const moduleLoading = !pdfModule && !error;
  const Document = pdfModule?.Document;
  const Page = pdfModule?.Page;

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-100 dark:bg-slate-950/50",
        fullscreen && "bg-slate-950",
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setShowThumbs((s) => !s)}
          title="Toggle thumbnails"
        >
          <SidebarIcon className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          disabled={activePage <= 1}
          onClick={() => jumpToPage(activePage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1 text-xs">
          <Input
            type="number"
            min={1}
            max={numPages ?? 1}
            value={activePage}
            onChange={(e) => {
              const p = Math.max(1, Math.min(numPages ?? 1, Number(e.target.value) || 1));
              setActivePage(p);
              jumpToPage(p);
            }}
            className="h-7 w-14 text-center"
          />
          <span className="text-slate-500">/ {numPages ?? "–"}</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          disabled={numPages ? activePage >= numPages : true}
          onClick={() => jumpToPage(activePage + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setZoomCustom((fitMode === "custom" ? zoom : 100) - 10)}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums">
          {fitMode === "width" ? "Fit W" : fitMode === "page" ? "Fit P" : `${zoom}%`}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setZoomCustom((fitMode === "custom" ? zoom : 100) + 10)}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant={fitMode === "width" ? "secondary" : "ghost"}
          className="h-8 px-2 text-xs"
          onClick={() => setFitMode("width")}
        >
          Fit width
        </Button>
        <Button
          size="sm"
          variant={fitMode === "page" ? "secondary" : "ghost"}
          className="h-8 px-2 text-xs"
          onClick={() => setFitMode("page")}
        >
          Fit page
        </Button>
        <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setRotation((r) => (r + 90) % 360)}
          title="Rotate"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {onDownload && (
            <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={onDownload}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Download</span>
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {moduleLoading && (
          <div className="flex min-h-96 flex-1 items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading document preview…
          </div>
        )}

        {!moduleLoading && error && !pdfModule && (
          <div className="flex min-h-96 flex-1 flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <p className="text-sm font-medium">Preview unavailable</p>
            <p className="max-w-md text-xs text-slate-500">{error}</p>
            {onDownload && (
              <Button size="sm" variant="outline" onClick={onDownload}>
                <Download className="mr-2 h-4 w-4" /> Download instead
              </Button>
            )}
          </div>
        )}

        {Document && Page && (
          <>
            {/* Thumbnails */}
            {showThumbs && (
              <div className="hidden w-40 shrink-0 overflow-auto border-r border-slate-200 bg-white/60 p-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/60 md:block">
                <Document
                  file={url}
                  loading={<div className="p-2 text-xs text-slate-500">…</div>}
                  error={<div className="p-2 text-xs text-red-500">Failed</div>}
                >
                  {numPages !== null &&
                    Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => jumpToPage(p)}
                        className={cn(
                          "mb-2 block w-full overflow-hidden rounded-md border-2 bg-white text-xs shadow-sm transition dark:bg-slate-800",
                          activePage === p
                            ? "border-primary"
                            : "border-transparent hover:border-primary/50",
                        )}
                      >
                        <Page
                          pageNumber={p}
                          width={128}
                          renderAnnotationLayer={false}
                          renderTextLayer={false}
                          rotate={rotation}
                        />
                        <div className="py-0.5 text-center text-[10px] text-slate-500">Page {p}</div>
                      </button>
                    ))}
                </Document>
              </div>
            )}

            {/* Pages scroll area */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-3">
              <Document
                file={url}
                onLoadSuccess={({ numPages: loadedPages }) => setNumPages(loadedPages)}
                onLoadError={(loadError) =>
                  setError(loadError.message || "Failed to load PDF. The file may be corrupt or missing.")
                }
                loading={
                  <div className="flex h-96 items-center justify-center text-slate-500">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading document…
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
                {numPages !== null &&
                  Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                    <PageWrapper
                      key={p}
                      PageComponent={Page}
                      pageNumber={p}
                      width={pageWidth}
                      rotation={rotation}
                      cursor={pageCursor}
                      onClick={onPageClick}
                      overlay={renderPageOverlay}
                      onMount={(node) => {
                        if (node) pageRefs.current.set(p, node);
                        else pageRefs.current.delete(p);
                      }}
                    />
                  ))}
              </Document>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PageWrapper({
  PageComponent,
  pageNumber,
  width,
  rotation,
  cursor,
  onClick,
  overlay,
  onMount,
}: {
  PageComponent: ReactPdfPage;
  pageNumber: number;
  width: number;
  rotation: number;
  cursor?: string;
  onClick?: (pageNumber: number, x: number, y: number) => void;
  overlay?: (pageNumber: number, rect: PageRect) => ReactNode;
  onMount: (node: HTMLDivElement | null) => void;
}) {
  const [rect, setRect] = useState<PageRect | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onMount(wrapRef.current);
    return () => onMount(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onClick) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    onClick(pageNumber, x, y);
  };

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto mb-4 bg-white shadow-lg dark:shadow-black/40"
      style={{ width, cursor }}
      onClick={handleClick}
      data-page={pageNumber}
    >
      <PageComponent
        pageNumber={pageNumber}
        width={width}
        rotate={rotation}
        renderAnnotationLayer={false}
        renderTextLayer
        onRenderSuccess={(pageProxy) => {
          setRect({ width: pageProxy.width, height: pageProxy.height });
        }}
      />
      {rect && overlay && (
        <div className="pointer-events-none absolute inset-0">
          <div className="pointer-events-auto absolute inset-0">{overlay(pageNumber, rect)}</div>
        </div>
      )}
      <div className="absolute -left-8 top-2 hidden text-[10px] text-slate-400 md:block">
        {pageNumber}
      </div>
    </div>
  );
}
