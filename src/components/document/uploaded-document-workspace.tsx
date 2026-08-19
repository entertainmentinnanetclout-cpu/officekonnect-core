import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, PenTool, Save, Check, X, AlertTriangle } from "lucide-react";
import { Rnd } from "@/components/resizable-draggable";
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

type PreviewFile = {
  bucket: string;
  blob: Blob;
  contentType: string;
};

export function UploadedDocumentWorkspace({
  document,
  onDocumentUpdated,
}: UploadedDocumentWorkspaceProps) {
  const queryClient = useQueryClient();
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [activeSig, setActiveSig] = useState<ToolboxSignature | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const applyFn = useServerFn(applySignatureToDocument);

  const {
    data: resolvedFile,
    isLoading: resolvingFile,
    error: previewError,
  } = useQuery<PreviewFile>({
    queryKey: ["document-file-preview", document.id, document.storage_path],
    queryFn: async () => {
      if (!document.storage_path) throw new Error("Document has no stored file path");

      const signedFile = await getDocumentSignedUrl(document.storage_path, 60 * 60);
      const response = await fetch(signedFile.url);
      if (!response.ok) {
        throw new Error(`Preview fetch failed (${response.status})`);
      }

      const blob = await response.blob();
      return {
        bucket: signedFile.bucket,
        blob,
        contentType: blob.type || document.file_type || "application/octet-stream",
      };
    },
    enabled: Boolean(document.storage_path),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (!resolvedFile?.blob) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(resolvedFile.blob);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [resolvedFile?.blob]);

  const previewType = (resolvedFile?.contentType || document.file_type || "").toLowerCase();

  const isPdf = useMemo(() => {
    return previewType.includes("pdf") || document.title.toLowerCase().endsWith(".pdf");
  }, [document.title, previewType]);

  const isImage = useMemo(() => {
    return (
      previewType.startsWith("image/") ||
      /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(document.title)
    );
  }, [document.title, previewType]);

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
        void queryClient.invalidateQueries({ queryKey: ["document-file-preview", document.id] });
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
            {(document.file_type ?? "File").toUpperCase()} •{" "}
            {document.file_size
              ? `${(document.file_size / 1024 / 1024).toFixed(2)} MB`
              : "Size unavailable"}{" "}
            • {document.document_status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeSig && (
            <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
              <Check className="h-3.5 w-3.5" /> Click the PDF to place “{activeSig.name}”
            </span>
          )}
          {placements.length > 0 && (
            <Button
              size="sm"
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
            >
              {confirmMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Confirm ({placements.length})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleDownload()}
            disabled={!document.storage_path}
          >
            <Download className="mr-2 h-4 w-4" /> Download
          </Button>
          {isPdf && (
            <Button
              size="sm"
              variant={toolboxOpen ? "secondary" : "default"}
              onClick={() => setToolboxOpen((open) => !open)}
            >
              <PenTool className="mr-2 h-4 w-4" />{" "}
              {toolboxOpen ? "Close toolbox" : "Apply my signature"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden bg-slate-100 dark:bg-slate-950">
        <div className="min-h-0 min-w-0 flex-1">
          {resolvingFile ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : previewError ? (
            <div className="mx-auto mt-12 flex max-w-xl flex-col items-center gap-4 rounded-xl border bg-background p-10 text-center shadow-sm">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-sm font-medium">Preview unavailable</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {previewError instanceof Error
                    ? previewError.message
                    : "The stored file could not be loaded for preview."}
                </p>
              </div>
              <Button onClick={() => void handleDownload()} disabled={!document.storage_path}>
                <Download className="mr-2 h-4 w-4" /> Download file
              </Button>
            </div>
          ) : previewUrl && isPdf ? (
            <PdfWorkspace
              key={previewUrl}
              url={previewUrl}
              onDownload={() => void handleDownload()}
              pageCursor={activeSig ? "crosshair" : undefined}
              onPageClick={handlePageClick}
              renderPageOverlay={(pageNumber, rect) => (
                <>
                  {placements
                    .filter((placement) => placement.page === pageNumber)
                    .map((placement) => (
                      <Rnd
                        key={placement.id}
                        bounds="parent"
                        size={{
                          width: placement.width * rect.width,
                          height: placement.height * rect.height,
                        }}
                        position={{ x: placement.x * rect.width, y: placement.y * rect.height }}
                        onDragStop={(_, position) =>
                          setPlacements((items) =>
                            items.map((item) =>
                              item.id === placement.id
                                ? {
                                    ...item,
                                    x: position.x / rect.width,
                                    y: position.y / rect.height,
                                  }
                                : item,
                            ),
                          )
                        }
                        onResizeStop={(_, __, ref, ___, position) =>
                          setPlacements((items) =>
                            items.map((item) =>
                              item.id === placement.id
                                ? {
                                    ...item,
                                    x: position.x / rect.width,
                                    y: position.y / rect.height,
                                    width: ref.offsetWidth / rect.width,
                                    height: ref.offsetHeight / rect.height,
                                  }
                                : item,
                            ),
                          )
                        }
                        className="group !border-2 !border-dashed !border-primary bg-primary/5"
                        onClick={(event: MouseEvent) => event.stopPropagation()}
                      >
                        <img
                          src={placement.imageUrl}
                          alt="Signature placement"
                          className="pointer-events-none h-full w-full object-contain"
                          draggable={false}
                        />
                        <button
                          type="button"
                          aria-label="Remove signature placement"
                          className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-white opacity-0 shadow group-hover:opacity-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPlacements((items) =>
                              items.filter((item) => item.id !== placement.id),
                            );
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Rnd>
                    ))}
                </>
              )}
            />
          ) : previewUrl && isImage ? (
            <div className="flex h-full min-h-0 items-center justify-center overflow-auto p-6">
              <img
                src={previewUrl}
                alt={document.title}
                className="max-h-full max-w-full rounded-md bg-background object-contain shadow-sm"
              />
            </div>
          ) : previewUrl ? (
            <div className="mx-auto mt-12 flex max-w-xl flex-col items-center gap-4 rounded-xl border bg-background p-10 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">
                This file type does not have an inline OfficeKonnect preview. The original file is
                preserved and available for download.
              </p>
              <Button asChild>
                <a href={previewUrl} download={document.title}>
                  <Download className="mr-2 h-4 w-4" /> Download file
                </a>
              </Button>
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
