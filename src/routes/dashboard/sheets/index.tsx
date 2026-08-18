import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  Copy,
  FileSpreadsheet,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { updateDocumentStatus } from "@/lib/documents.functions";
import { createSpreadsheet, duplicateSpreadsheet } from "@/lib/spreadsheets.functions";
import { workbookFromMatrices, type WorkbookContent } from "@/lib/spreadsheet";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/dashboard/sheets/")({
  component: SheetsIndex,
});

type Scope = "active" | "archived" | "trash";
type SortMode = "updated" | "created" | "title";
type SpreadsheetRow = Tables<"documents">;

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

function SheetsIndex() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const importRef = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState<Scope>("active");
  const [sort, setSort] = useState<SortMode>("updated");
  const [searchQuery, setSearchQuery] = useState("");

  const createFn = useServerFn(createSpreadsheet);
  const duplicateFn = useServerFn(duplicateSpreadsheet);
  const statusFn = useServerFn(updateDocumentStatus);

  const { data: workspaceId, isLoading: workspaceLoading } = useQuery({
    queryKey: ["active-workspace-id"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("default_workspace_id").maybeSingle();
      if (error) throw error;
      if (!data?.default_workspace_id) throw new Error("No active workspace is selected");
      return data.default_workspace_id;
    },
  });

  const {
    data: sheets,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["spreadsheets", workspaceId, scope, sort, searchQuery],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      let query = supabase
        .from("documents")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .eq("document_kind", "spreadsheet");
      if (scope === "active") query = query.neq("document_status", "archived").neq("document_status", "deleted");
      else if (scope === "archived") query = query.eq("document_status", "archived");
      else query = query.eq("document_status", "deleted");
      if (searchQuery.trim()) query = query.ilike("title", `%${searchQuery.trim()}%`);
      if (sort === "title") query = query.order("title", { ascending: true });
      else if (sort === "created") query = query.order("created_at", { ascending: false });
      else query = query.order("updated_at", { ascending: false });
      const { data, error: queryError } = await query;
      if (queryError) throw queryError;
      return data;
    },
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["spreadsheets"] }),
      queryClient.invalidateQueries({ queryKey: ["documents"] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (input?: { title?: string; content?: WorkbookContent }) => createFn({ data: input ?? {} }),
    onSuccess: async (document) => {
      await refresh();
      await navigate({ to: "/dashboard/sheets/$documentId", params: { documentId: document.id } });
    },
    onError: (mutationError) => toastError(mutationError, "Could not create spreadsheet"),
  });

  const duplicateMutation = useMutation({
    mutationFn: (documentId: string) => duplicateFn({ data: { documentId } }),
    onSuccess: async (copy) => {
      await refresh();
      toast.success("Spreadsheet duplicated");
      await navigate({ to: "/dashboard/sheets/$documentId", params: { documentId: copy.id } });
    },
    onError: (mutationError) => toastError(mutationError, "Duplicate failed"),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { documentId: string; status: "draft" | "archived" | "deleted" }) => statusFn({ data: input }),
    onSuccess: async (_, variables) => {
      await refresh();
      toast.success(
        variables.status === "archived"
          ? "Spreadsheet archived"
          : variables.status === "deleted"
            ? "Spreadsheet moved to Trash"
            : "Spreadsheet restored",
      );
    },
    onError: (mutationError) => toastError(mutationError, "Spreadsheet update failed"),
  });

  const importSpreadsheet = async (file?: globalThis.File | null) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error("Spreadsheet imports must be 20 MB or smaller");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["xlsx", "xls", "csv"].includes(extension)) {
      toast.error("Import an XLSX, XLS or CSV file");
      return;
    }
    try {
      const XLSX = await import("xlsx");
      const bytes = await file.arrayBuffer();
      const source = XLSX.read(bytes, { type: "array", cellDates: true, cellFormula: true, raw: true });
      const entries = source.SheetNames.map((name) => ({
        name,
        matrix: XLSX.utils.sheet_to_json<unknown[]>(source.Sheets[name]!, { header: 1, raw: true, defval: null }) as unknown[][],
      }));
      const workbook = workbookFromMatrices(entries);
      source.SheetNames.forEach((name, sheetIndex) => {
        const sourceSheet = source.Sheets[name];
        const targetSheet = workbook.sheets[sheetIndex];
        if (!sourceSheet || !targetSheet) return;
        for (const [address, xlsxCell] of Object.entries(sourceSheet)) {
          if (address.startsWith("!") || !xlsxCell || typeof xlsxCell !== "object") continue;
          const formula = "f" in xlsxCell && typeof xlsxCell.f === "string" ? xlsxCell.f : undefined;
          if (!formula) continue;
          const current = targetSheet.cells[address] ?? {};
          targetSheet.cells[address] = { ...current, formula: formula.startsWith("=") ? formula : `=${formula}` };
        }
        const ref = sourceSheet["!ref"] ? XLSX.utils.decode_range(sourceSheet["!ref"]) : null;
        if (ref) {
          targetSheet.rowCount = Math.max(targetSheet.rowCount, ref.e.r + 11);
          targetSheet.columnCount = Math.max(targetSheet.columnCount, ref.e.c + 4);
        }
      });
      createMutation.mutate({
        title: file.name.replace(/\.(xlsx?|csv)$/i, "") || "Imported spreadsheet",
        content: workbook,
      });
    } catch (importError) {
      toastError(importError, "Spreadsheet import failed");
    }
  };

  const handleImportInput = (event: ChangeEvent<HTMLInputElement>) => {
    void importSpreadsheet(event.target.files?.[0]);
    event.target.value = "";
  };

  const actions = (document: SpreadsheetRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${document.title}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Spreadsheet actions</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/dashboard/sheets/$documentId" params={{ documentId: document.id }}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Open
          </Link>
        </DropdownMenuItem>
        {scope === "active" && (
          <DropdownMenuItem onClick={() => duplicateMutation.mutate(document.id)}>
            <Copy className="mr-2 h-4 w-4" /> Duplicate
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {scope === "active" ? (
          <>
            <DropdownMenuItem onClick={() => statusMutation.mutate({ documentId: document.id, status: "archived" })}>
              <Archive className="mr-2 h-4 w-4" /> Archive
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => statusMutation.mutate({ documentId: document.id, status: "deleted" })}>
              <Trash2 className="mr-2 h-4 w-4" /> Move to Trash
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onClick={() => statusMutation.mutate({ documentId: document.id, status: "draft" })}>
            <RotateCcw className="mr-2 h-4 w-4" /> Restore
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const loading = workspaceLoading || isLoading;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">OfficeKonnect Sheets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create workbooks, calculate formulas, import Excel/CSV files and prepare print-ready PDFs from one secure workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={importRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleImportInput} />
          <Button variant="outline" disabled={createMutation.isPending} onClick={() => importRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Import XLSX / CSV
          </Button>
          <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate(undefined)}>
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            New spreadsheet
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-background p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search spreadsheet titles…" className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-lg bg-muted p-1">
              {(["active", "archived", "trash"] as const).map((value) => (
                <Button key={value} variant={scope === value ? "secondary" : "ghost"} size="sm" className="h-8 capitalize" onClick={() => setScope(value)}>{value}</Button>
              ))}
            </div>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {error instanceof Error ? error.message : "Spreadsheets could not be loaded."}
        </div>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-44 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : (sheets ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-background py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            <FileSpreadsheet className="h-7 w-7" />
          </div>
          <h2 className="mt-4 font-semibold">{scope === "active" ? "Create your first spreadsheet" : scope === "archived" ? "No archived spreadsheets" : "Spreadsheet Trash is empty"}</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {scope === "active" ? "Start a blank OfficeKonnect workbook or import an existing XLSX, XLS or CSV file. No sample production data is created." : "Spreadsheet lifecycle actions remain recoverable through the shared document model."}
          </p>
          {scope === "active" && (
            <div className="mt-5 flex gap-2">
              <Button variant="outline" onClick={() => importRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> Import</Button>
              <Button onClick={() => createMutation.mutate(undefined)}><Plus className="mr-2 h-4 w-4" /> New spreadsheet</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(sheets ?? []).map((document) => (
            <Card key={document.id} className="group overflow-hidden transition-shadow hover:shadow-md">
              <CardContent className="p-0">
                <Link to="/dashboard/sheets/$documentId" params={{ documentId: document.id }} className="flex h-28 items-center justify-center bg-emerald-50/70 dark:bg-emerald-950/20">
                  <FileSpreadsheet className="h-12 w-12 text-emerald-700/70 transition-transform group-hover:scale-105 dark:text-emerald-300/70" />
                </Link>
                <div className="p-4">
                  <div className="flex items-start gap-2">
                    <Link to="/dashboard/sheets/$documentId" params={{ documentId: document.id }} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{document.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {document.sheet_count.toLocaleString()} sheets · {document.cell_count.toLocaleString()} cells · {document.formula_count.toLocaleString()} formulas
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Updated {format(new Date(document.updated_at), "MMM d, yyyy")}</p>
                    </Link>
                    {actions(document)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
