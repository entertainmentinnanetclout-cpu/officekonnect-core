import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  Copy,
  FileDown,
  FileText,
  Loader2,
  Save,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeDocumentEditor } from "@/components/document/native-document-editor";
import { SpreadsheetEditor } from "@/components/spreadsheet/spreadsheet-editor";
import { UploadedDocumentWorkspace } from "@/components/document/uploaded-document-workspace";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  saveNativeDocumentAsDocx,
  saveNativeDocumentAsPdf,
} from "@/lib/document-save-as.functions";
import { duplicateNativeDocument } from "@/lib/documents.functions";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/dashboard/documents/$documentId")({
  component: DocumentDetail,
});

function DocumentDetail() {
  const { documentId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const saveAsPdfFn = useServerFn(saveNativeDocumentAsPdf);
  const saveAsDocxFn = useServerFn(saveNativeDocumentAsDocx);
  const duplicateFn = useServerFn(duplicateNativeDocument);

  const {
    data: document,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["document", documentId],
    queryFn: async () => {
      const { data, error: documentError } = await supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .single();
      if (documentError) throw documentError;
      return data;
    },
    retry: 1,
  });

  const saveAsPdfMutation = useMutation({
    mutationFn: () => saveAsPdfFn({ data: { documentId } }),
    onSuccess: async (saved) => {
      toast.success("PDF saved to Documents");
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      await navigate({ to: "/dashboard/documents/$documentId", params: { documentId: saved.id } });
    },
    onError: (saveError) => toastError(saveError, "Could not save PDF copy"),
  });

  const saveAsDocxMutation = useMutation({
    mutationFn: () => saveAsDocxFn({ data: { documentId } }),
    onSuccess: async (saved) => {
      toast.success("Word document saved to Documents");
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      await navigate({ to: "/dashboard/documents/$documentId", params: { documentId: saved.id } });
    },
    onError: (saveError) => toastError(saveError, "Could not save Word document"),
  });

  const saveEditableCopyMutation = useMutation({
    mutationFn: () => duplicateFn({ data: { documentId } }),
    onSuccess: async (saved) => {
      toast.success("Editable copy saved");
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      await navigate({ to: "/dashboard/documents/$documentId", params: { documentId: saved.id } });
    },
    onError: (saveError) => toastError(saveError, "Could not save editable copy"),
  });

  const updateCachedDocument = (next: Tables<"documents">) => {
    queryClient.setQueryData(["document", documentId], next);
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
    if (next.document_kind === "spreadsheet") {
      void queryClient.invalidateQueries({ queryKey: ["spreadsheets"] });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Opening document…
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-semibold">Document unavailable</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {error instanceof Error
            ? error.message
            : "The document could not be found in this workspace."}
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/dashboard/documents">
              <ChevronLeft className="mr-2 h-4 w-4" /> Documents
            </Link>
          </Button>
          <Button onClick={() => void refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (document.document_kind === "native") {
    const saving =
      saveAsPdfMutation.isPending ||
      saveAsDocxMutation.isPending ||
      saveEditableCopyMutation.isPending;
    return (
      <div className="flex h-[calc(100vh-5.5rem)] min-h-[620px] flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard/documents">
              <ChevronLeft className="mr-1 h-4 w-4" /> Documents
            </Link>
          </Button>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save as
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Choose saved format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => saveEditableCopyMutation.mutate()}>
                  <Copy className="mr-2 h-4 w-4" />
                  <div>
                    <p>OfficeKonnect editable copy</p>
                    <p className="text-xs text-muted-foreground">Keeps native editing features</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => saveAsDocxMutation.mutate()}>
                  <FileText className="mr-2 h-4 w-4" />
                  <div>
                    <p>Word document (.docx)</p>
                    <p className="text-xs text-muted-foreground">
                      Structured editable Office Open XML document
                    </p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => saveAsPdfMutation.mutate()}>
                  <FileDown className="mr-2 h-4 w-4" />
                  <div>
                    <p>PDF document</p>
                    <p className="text-xs text-muted-foreground">Saved permanently in Documents</p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <NativeDocumentEditor document={document} onDocumentUpdated={updateCachedDocument} />
      </div>
    );
  }

  if (document.document_kind === "spreadsheet") {
    return (
      <div className="flex h-[calc(100vh-5.5rem)] min-h-[620px] flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="flex h-10 shrink-0 items-center border-b px-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard/sheets">
              <ChevronLeft className="mr-1 h-4 w-4" /> Sheets
            </Link>
          </Button>
        </div>
        <SpreadsheetEditor document={document} onDocumentUpdated={updateCachedDocument} />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-5.5rem)] min-h-[620px] flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
      <div className="flex h-10 shrink-0 items-center border-b px-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/documents">
            <ChevronLeft className="mr-1 h-4 w-4" /> Documents
          </Link>
        </Button>
      </div>
      <UploadedDocumentWorkspace document={document} onDocumentUpdated={() => void refetch()} />
    </div>
  );
}
