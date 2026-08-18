import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpreadsheetEditor } from "@/components/spreadsheet/spreadsheet-editor";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/dashboard/sheets/$documentId")({
  component: SpreadsheetDetail,
});

function SpreadsheetDetail() {
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
      if (data.document_kind !== "spreadsheet") throw new Error("This item is not an OfficeKonnect spreadsheet");
      return data;
    },
    retry: 1,
  });

  const updateCachedDocument = (next: Tables<"documents">) => {
    queryClient.setQueryData(["document", documentId], next);
    void queryClient.invalidateQueries({ queryKey: ["spreadsheets"] });
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Opening spreadsheet…
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-semibold">Spreadsheet unavailable</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "The spreadsheet could not be found in this workspace."}
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/dashboard/sheets">
              <ChevronLeft className="mr-2 h-4 w-4" /> Sheets
            </Link>
          </Button>
          <Button onClick={() => void refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
      </div>
    );
  }

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
