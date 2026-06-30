import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  Download,
  PenTool,
  Share2,
  ZoomIn,
  ZoomOut,
  ChevronRight,
  ChevronLeft as ChevLeft,
  Loader2,
  X,
  Save,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { PdfViewer } from "@/components/document/pdf-viewer";
import { SignatureToolbox, type ToolboxSignature } from "@/components/document/signature-toolbox";
import { useServerFn } from "@tanstack/react-start";
import { applySignatureToDocument } from "@/lib/signatures.functions";
import { getSignedUrl, downloadFromStorage } from "@/lib/download";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/dashboard/documents/$documentId")({
  component: DocumentDetail,
});

type Placement = {
  id: string;
  signatureId: string;
  imageUrl: string;
  page: number;
  // Normalized 0..1 coordinates relative to the page
  x: number;
  y: number;
  width: number;
  height: number;
};

function DocumentDetail() {
  const { documentId } = Route.useParams();
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [activeSig, setActiveSig] = useState<ToolboxSignature | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const applyFn = useServerFn(applySignatureToDocument);

  const { data: document, isLoading, error: docError, refetch } = useQuery({
    queryKey: ["document", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .single();
      if (error) throw error;
      return data;
    },
    retry: 1,
  });

  const { data: signedUrl } = useQuery({
    queryKey: ["document-url", documentId, document?.storage_path],
    queryFn: () => getSignedUrl("documents", document!.storage_path!, 60 * 60),
    enabled: !!document?.storage_path,
  });

  const isPdf = useMemo(() => {
    const t = document?.file_type ?? "";
    return t.includes("pdf") || (document?.title?.toLowerCase().endsWith(".pdf") ?? false);
  }, [document]);

  const handleDownload = async () => {
    if (!document?.storage_path) return;
    try {
      await downloadFromStorage("documents", document.storage_path, document.title);
    } catch (e) {
      toastError(e, "Download failed");
    }
  };

  const handlePagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeSig) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;
    const widthPct = 0.2;
    const heightPct = 0.08;
    setPlacements((p) => [
      ...p,
      {
        id: crypto.randomUUID(),
        signatureId: activeSig.id,
        imageUrl: activeSig.signature_image_url,
        page,
        x: Math.max(0, xPct - widthPct / 2),
        y: Math.max(0, yPct - heightPct / 2),
        width: widthPct,
        height: heightPct,
      },
    ]);
    setActiveSig(null);
  };

  const confirmMutation = useMutation({
    mutationFn: async () => {
      for (const p of placements) {
        await applyFn({
          data: {
            documentId,
            signatureId: p.signatureId,
            page: p.page,
            x: p.x,
            y: p.y,
            width: p.width,
            height: p.height,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Signature placement saved — processing");
      setPlacements([]);
      setToolboxOpen(false);
    },
    onError: (e) => toastError(e, "Failed to apply signature"),
  });

  useEffect(() => {
    setPage(1);
  }, [documentId]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-12rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (docError || !document) {
    return (
      <div className="flex h-[calc(100vh-12rem)] flex-col items-center justify-center text-center">
        <h2 className="text-2xl font-bold">Document unavailable</h2>
        <p className="mt-2 text-slate-500">{docError ? (docError as Error).message : "Not found"}</p>
        <div className="mt-6 flex gap-2">
          <Button onClick={() => refetch()}>Retry</Button>
          <Button variant="outline" onClick={() => navigate({ to: "/dashboard/documents" })}>Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/dashboard/documents"><ChevronLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h1 className="max-w-[260px] truncate text-lg font-semibold sm:max-w-md">{document.title}</h1>
            <p className="text-xs text-slate-500">
              {(document.file_type ?? "").split("/")[1]?.toUpperCase() || "FILE"} •{" "}
              {((document.file_size ?? 0) / 1024 / 1024).toFixed(2)} MB •{" "}
              <span className="font-medium uppercase text-primary">{document.document_status}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />Download
          </Button>
          <Button variant="outline" size="sm" className="hidden sm:flex">
            <Share2 className="mr-2 h-4 w-4" />Share
          </Button>
          <Button
            size="sm"
            onClick={() => setToolboxOpen((o) => !o)}
            variant={toolboxOpen ? "secondary" : "default"}
          >
            <PenTool className="mr-2 h-4 w-4" />
            {toolboxOpen ? "Close Toolbox" : "Sign Document"}
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-100 px-1 py-2 dark:border-slate-800">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.max(50, z - 10))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs">{zoom}%</span>
          <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.min(200, z + 10))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="mx-2 h-4" />
          <Button variant="ghost" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs">Page {page} / {numPages}</span>
          <Button variant="ghost" size="icon" disabled={page >= numPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {placements.length > 0 && (
          <Button size="sm" onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
            {confirmMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Confirm placement ({placements.length})
          </Button>
        )}
        {activeSig && (
          <span className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
            <Check className="h-3 w-3" /> Click on page to place “{activeSig.name}”
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <div className="flex-1 overflow-auto bg-slate-100 p-6 dark:bg-slate-950/50">
          {signedUrl && isPdf ? (
            <div
              className="relative mx-auto max-w-4xl cursor-crosshair"
              onPointerDown={handlePagePointerDown}
              style={{ cursor: activeSig ? "crosshair" : "default" }}
            >
              <PdfViewer
                url={signedUrl}
                zoom={zoom}
                page={page}
                onLoadPages={setNumPages}
                onDownload={handleDownload}
                overlay={
                  <>
                    {placements
                      .filter((p) => p.page === page)
                      .map((p) => (
                        <div
                          key={p.id}
                          className="absolute border-2 border-dashed border-primary bg-primary/5"
                          style={{
                            left: `${p.x * 100}%`,
                            top: `${p.y * 100}%`,
                            width: `${p.width * 100}%`,
                            height: `${p.height * 100}%`,
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <img src={p.imageUrl} alt="sig" className="h-full w-full object-contain" />
                          <button
                            className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-white"
                            onClick={() => setPlacements((arr) => arr.filter((x) => x.id !== p.id))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                  </>
                }
              />
            </div>
          ) : signedUrl ? (
            <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-xl border bg-white p-12 text-center dark:bg-slate-900">
              <p className="text-sm text-slate-500">Inline preview is only available for PDFs.</p>
              <Button onClick={handleDownload}><Download className="mr-2 h-4 w-4" />Download to view</Button>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          )}
        </div>

        {toolboxOpen && (
          <SignatureToolbox
            selectedId={activeSig?.id ?? null}
            onSelect={setActiveSig}
            onClose={() => {
              setToolboxOpen(false);
              setActiveSig(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
