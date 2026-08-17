import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeDocumentEditor } from "@/components/document/native-document-editor";
import { UploadedDocumentWorkspace } from "@/components/document/uploaded-document-workspace";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/dashboard/documents/$documentId")({
  component: DocumentDetail,
});

function DocumentDetail() {
  const { documentId } = Route.useParams();
  const queryClient = useQueryClient();

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

  const updateCachedDocument = (next: Tables<"documents">) => {
    queryClient.setQueryData(["document", documentId], next);
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
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
    return (
      <div className="flex h-[calc(100vh-5.5rem)] min-h-[620px] flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="flex h-10 shrink-0 items-center border-b px-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard/documents">
              <ChevronLeft className="mr-1 h-4 w-4" /> Documents
            </Link>
          </Button>
        </div>
        <NativeDocumentEditor document={document} onDocumentUpdated={updateCachedDocument} />
      </div>
    );
  }

  if (document.document_kind === "spreadsheet") {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center rounded-xl border bg-background px-6 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          <FileSpreadsheet className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">OfficeKonnect Sheet</h1>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          The workbook is preserved in the existing structured document backend. Its production
          spreadsheet editor is activated in Phase 3, so this route is intentionally non-editable
          rather than exposing a broken or competing editor.
        </p>
        <Button variant="outline" className="mt-5" asChild>
          <Link to="/dashboard/documents">
            <ChevronLeft className="mr-2 h-4 w-4" /> Back to documents
          </Link>
        </Button>
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
