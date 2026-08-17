import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, PenTool, Save, Check, X } from "lucide-react";
import { Rnd } from "react-rnd";
import { Button } from "@/components/ui/button";
import { PdfWorkspace } from "@/components/document/pdf-workspace";
import { SignatureToolbox, type ToolboxSignature } from "@/components/document/signature-toolbox";
import type { Tables } from "@/integrations/supabase/types";
import { applySignatureToDocument } from "@/lib/signatures.functions";
import { downloadDocumentFromStorage, getDocumentSignedUrl } from "@/lib/download";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";

interface UploadedDocumentWorkspaceProps {
  document: Tables<"documents">;
  onDocumentUpdated?: () => void;
}

type Placement = {
  id: string;
  signatureId: string;
  imageUrl: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function UploadedDocumentWorkspace({ document, onDocumentUpdated }: UploadedDocumentWorkspaceProps) {
  const queryClient = useQueryClient();
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [activeSig, setActiveSig] = useState<ToolboxSignature | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const applyFn = useServerFn(applySignatureToDocument);

  const { data: resolvedFile, isLoading: resolvingFile } = useQuery({
    queryKey: ["document-file-url", document.id, document.storage_path],
    queryFn: () => getDocumentSignedUrl(document.storage_path!, 60 * 60),
    enabled: Boolean(document.storage_path),
    refetchInterval: 45 * 60 * 1000,
  });

  const isPdf = useMemo(() => {
    const type = (document.file_type ?? "").toLowerCase();
    return type.includes("pdf") || document.title.toLowerCase().endsWith(".pdf");
  }, [document.file_type, document.title]);

  const handleDownload = async () => {
    if (!document.storage_path) return;
    try {
      await downloadDocumentFromStorage(document.storage_path, document.title);
    } catch (error) {
      toastError(error, "Download failed");
    }
  };

  const handlePageClick = (pageNumber: number, xPct: number, yPct: number) => {
    if (!activeSig) return;
    const widthPct = 0.2;
    const heightPct = 0.08;
    setPlacements((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        signatureId: activeSig.id,
        imageUrl: activeSig.signature_image_url,
        page: pageNumber,
        x: Math.max(0, Math.min(1 - widthPct, xPct - widthPct / 2)),
        y: Math.max(0, Math.min(1 - heightPct, yPct - heightPct / 2)),
        width: widthPct,
        height: heightPct,
      },
    ]);
    setActiveSig(null);
  };

  const confirmMutation = useMutation({
    mutationFn: async () => {
      for (const placement of placements) {
        await applyFn({
          data: {
            documentId: document.id,
            signatureId: placement.signatureId,
            page: placement.page,
            x: placement.x,
            y: placement.y,
            width: placement.width,
            height: placement.height,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Signature placement queued for flattening");
      setPlacements([]);
      setToolboxOpen(false);
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["document", document.id] });
        void queryClient.invalidateQueries({ queryKey: ["document-file-url", document.id] });
        onDocumentUpdated?.();
      }, 3500);
    },
    onError: (error) => toastError(error, "Failed to apply signature"),
  });

  useEffect(() => {
    setPlacements([]);
    setActiveSig(null);
  }, [document.id, document.storage_path]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{document.title}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {(document.file_type ?? "File").toUpperCase()} • {document.file_size ? `${(document.file_size / 1024 / 1024).toFixed(2)} MB` : "Size unavailable"} • {document.document_status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeSig && (
            <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
              <Check className="h-3.5 w-3.5" /> Click the PDF to place “{activeSig.name}”
            </span>
          )}
          {placements.length > 0 && (
            <Button size="sm" onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
              {confirmMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Confirm ({placements.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void handleDownload()} disabled={!document.storage_path}>
            <Download className="mr-2 h-4 w-4" /> Download
          </Button>
          {isPdf && (
            <Button size="sm" variant={toolboxOpen ? "secondary" : "default"} onClick={() => setToolboxOpen((open) => !open)}>
              <PenTool className="mr-2 h-4 w-4" /> {toolboxOpen ? "Close toolbox" : "Apply my signature"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden bg-slate-100 dark:bg-slate-950">
        <div className="min-h-0 min-w-0 flex-1">
          {resolvingFile ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
          ) : resolvedFile?.url && isPdf ? (
            <PdfWorkspace
              url={resolvedFile.url}
              onDownload={() => void handleDownload()}
              pageCursor={activeSig ? "crosshair" : undefined}
              onPageClick={handlePageClick}
              renderPageOverlay={(pageNumber, rect) => (
                <>
                  {placements.filter((placement) => placement.page === pageNumber).map((placement) => (
                    <Rnd
                      key={placement.id}
                      bounds="parent"
                      size={{ width: placement.width * rect.width, height: placement.height * rect.height }}
                      position={{ x: placement.x * rect.width, y: placement.y * rect.height }}
                      onDragStop={(_, position) => setPlacements((items) => items.map((item) => item.id === placement.id ? { ...item, x: position.x / rect.width, y: position.y / rect.height } : item))}
                      onResizeStop={(_, __, ref, ___, position) => setPlacements((items) => items.map((item) => item.id === placement.id ? { ...item, x: position.x / rect.width, y: position.y / rect.height, width: ref.offsetWidth / rect.width, height: ref.offsetHeight / rect.height } : item))}
                      className="group !border-2 !border-dashed !border-primary bg-primary/5"
                      onClick={(event: React.MouseEvent) => event.stopPropagation()}
                    >
                      <img src={placement.imageUrl} alt="Signature placement" className="pointer-events-none h-full w-full object-contain" draggable={false} />
                      <button
                        type="button"
                        aria-label="Remove signature placement"
                        className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-white opacity-0 shadow group-hover:opacity-100"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPlacements((items) => items.filter((item) => item.id !== placement.id));
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Rnd>
                  ))}
                </>
              )}
            />
          ) : resolvedFile?.url ? (
            <div className="mx-auto mt-12 flex max-w-xl flex-col items-center gap-4 rounded-xl border bg-background p-10 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">This file type does not have an inline OfficeKonnect preview yet. The original file is preserved and available for download.</p>
              <Button onClick={() => void handleDownload()}><Download className="mr-2 h-4 w-4" /> Download file</Button>
            </div>
          ) : (
            <div className="mx-auto mt-12 max-w-xl rounded-xl border border-dashed bg-background p-10 text-center text-sm text-muted-foreground">
              This document has no stored binary file to preview.
            </div>
          )}
        </div>

        {toolboxOpen && isPdf && (
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
