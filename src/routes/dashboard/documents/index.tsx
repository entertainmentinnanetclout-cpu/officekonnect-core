import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  Copy,
  Download,
  File,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Grid3X3,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  duplicateNativeDocument,
  exportNativeDocumentPdf,
  renameDocument,
  updateDocumentStatus,
} from "@/lib/documents.functions";
import { createNativeDocumentClient, uploadDocumentClient } from "@/lib/document-client";
import { downloadDocumentFromStorage } from "@/lib/download";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/dashboard/documents/")({
  component: DocumentsIndex,
});

type LibraryView = "table" | "grid";
type LibraryScope = "active" | "archived" | "trash";
type KindFilter = "all" | "native" | "file" | "spreadsheet";
type SortMode = "updated" | "created" | "title";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "png", "jpg", "jpeg"]);

type DocumentRow = Tables<"documents">;

function documentIcon(document: DocumentRow) {
  if (document.document_kind === "native") return FileText;
  if (document.document_kind === "spreadsheet") return FileSpreadsheet;
  return File;
}

function documentMeta(document: DocumentRow) {
  if (document.document_kind === "native") {
    return `${document.word_count.toLocaleString()} words`;
  }
  if (document.document_kind === "spreadsheet") {
    return `${document.sheet_count.toLocaleString()} sheet${document.sheet_count === 1 ? "" : "s"}`;
  }
  return document.file_size
    ? `${(document.file_size / 1024 / 1024).toFixed(2)} MB`
    : "Uploaded file";
}

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function DocumentsIndex() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<LibraryView>("table");
  const [scope, setScope] = useState<LibraryScope>("active");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortMode>("updated");
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DocumentRow | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const renameFn = useServerFn(renameDocument);
  const duplicateFn = useServerFn(duplicateNativeDocument);
  const statusFn = useServerFn(updateDocumentStatus);
  const exportFn = useServerFn(exportNativeDocumentPdf);

  const { data: workspaceId, isLoading: workspaceLoading } = useQuery({
    queryKey: ["active-workspace-id"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("default_workspace_id")
        .maybeSingle();
      if (error) throw error;
      if (!data?.default_workspace_id) throw new Error("No active workspace is selected");
      return data.default_workspace_id;
    },
  });

  const {
    data: documents,
    isLoading,
    error: documentsError,
  } = useQuery({
    queryKey: ["documents", workspaceId, scope, kind, sort, searchQuery],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      let query = supabase.from("documents").select("*").eq("workspace_id", workspaceId!);

      if (scope === "active") {
        query = query.neq("document_status", "archived").neq("document_status", "deleted");
      } else if (scope === "archived") {
        query = query.eq("document_status", "archived");
      } else {
        query = query.eq("document_status", "deleted");
      }

      if (kind !== "all") query = query.eq("document_kind", kind);
      if (searchQuery.trim()) query = query.ilike("title", `%${searchQuery.trim()}%`);

      if (sort === "title") query = query.order("title", { ascending: true });
      else if (sort === "created") query = query.order("created_at", { ascending: false });
      else query = query.order("updated_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const refreshLibrary = () => queryClient.invalidateQueries({ queryKey: ["documents"] });

  const createMutation = useMutation({
    mutationFn: () => createNativeDocumentClient("Untitled document"),
    onSuccess: async (document) => {
      await refreshLibrary();
      toast.success("Document created");
      await navigate({
        to: "/dashboard/documents/$documentId",
        params: { documentId: document.id },
      });
    },
    onError: (error) => toastError(error, "Could not create document"),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: globalThis.File) => {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("Files must be 10 MB or smaller");
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        throw new Error("Supported uploads: PDF, DOC/DOCX, XLS/XLSX, PNG and JPG");
      }
      return uploadDocumentClient(file);
    },
    onSuccess: async () => {
      setUploadOpen(false);
      await refreshLibrary();
      toast.success("File uploaded");
    },
    onError: (error) => toastError(error, "Upload failed"),
  });

  const renameMutation = useMutation({
    mutationFn: () => {
      if (!renameTarget) throw new Error("No document selected");
      return renameFn({ data: { documentId: renameTarget.id, title: renameValue } });
    },
    onSuccess: async () => {
      setRenameTarget(null);
      setRenameValue("");
      await refreshLibrary();
      toast.success("Document renamed");
    },
    onError: (error) => toastError(error, "Rename failed"),
  });

  const duplicateMutation = useMutation({
    mutationFn: (documentId: string) => duplicateFn({ data: { documentId } }),
    onSuccess: async (copy) => {
      await refreshLibrary();
      toast.success("Document duplicated");
      await navigate({ to: "/dashboard/documents/$documentId", params: { documentId: copy.id } });
    },
    onError: (error) => toastError(error, "Duplicate failed"),
  });

  const statusMutation = useMutation({
    mutationFn: ({
      documentId,
      status,
    }: {
      documentId: string;
      status: "draft" | "archived" | "deleted";
    }) => statusFn({ data: { documentId, status } }),
    onSuccess: async (_, variables) => {
      await refreshLibrary();
      toast.success(
        variables.status === "archived"
          ? "Document archived"
          : variables.status === "deleted"
            ? "Document moved to Trash"
            : "Document restored",
      );
    },
    onError: (error) => toastError(error, "Document update failed"),
  });

  const handleDownload = async (document: DocumentRow) => {
    try {
      if (document.document_kind === "native") {
        const result = await exportFn({ data: { documentId: document.id } });
        const anchor = window.document.createElement("a");
        anchor.href = result.url;
        anchor.download = result.fileName;
        anchor.rel = "noopener noreferrer";
        window.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        return;
      }
      if (document.document_kind === "file" && document.storage_path) {
        await downloadDocumentFromStorage(document.storage_path, document.title);
      }
    } catch (error) {
      toastError(error, "Download failed");
    }
  };

  const submitFile = (file?: globalThis.File | null) => {
    if (file && !uploadMutation.isPending) uploadMutation.mutate(file);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    submitFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    submitFile(event.dataTransfer.files?.[0]);
  };

  const beginRename = (document: DocumentRow) => {
    setRenameTarget(document);
    setRenameValue(document.title);
  };

  const renderActions = (document: DocumentRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Actions for ${document.title}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Document actions</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/dashboard/documents/$documentId" params={{ documentId: document.id }}>
            <FileText className="mr-2 h-4 w-4" /> Open
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => beginRename(document)}>
          <Pencil className="mr-2 h-4 w-4" /> Rename
        </DropdownMenuItem>
        {document.document_kind === "native" && scope === "active" && (
          <DropdownMenuItem onClick={() => duplicateMutation.mutate(document.id)}>
            <Copy className="mr-2 h-4 w-4" /> Duplicate
          </DropdownMenuItem>
        )}
        {document.document_kind !== "spreadsheet" && (
          <DropdownMenuItem onClick={() => void handleDownload(document)}>
            <Download className="mr-2 h-4 w-4" />
            {document.document_kind === "native" ? "Export PDF" : "Download"}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {scope === "active" ? (
          <>
            <DropdownMenuItem
              onClick={() => statusMutation.mutate({ documentId: document.id, status: "archived" })}
            >
              <Archive className="mr-2 h-4 w-4" /> Archive
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={() => statusMutation.mutate({ documentId: document.id, status: "deleted" })}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Move to Trash
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            onClick={() => statusMutation.mutate({ documentId: document.id, status: "draft" })}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Restore to Documents
          </DropdownMenuItem>
        )}
        {scope === "archived" && (
          <DropdownMenuItem
            className="text-red-600 focus:text-red-600"
            onClick={() => statusMutation.mutate({ documentId: document.id, status: "deleted" })}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Move to Trash
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
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create native office documents, preserve uploaded files, and manage their lifecycle.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Upload file
          </Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FilePlus2 className="mr-2 h-4 w-4" />
            )}
            New document
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-background p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search document titles…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-lg bg-muted p-1">
              {(["active", "archived", "trash"] as const).map((value) => (
                <Button
                  key={value}
                  variant={scope === value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 capitalize"
                  onClick={() => setScope(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as KindFilter)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">All types</option>
              <option value="native">Documents</option>
              <option value="file">Uploaded files</option>
              <option value="spreadsheet">Sheets</option>
            </select>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="title">Title A–Z</option>
            </select>
            <div className="flex rounded-lg border bg-background p-1">
              <Button
                variant={view === "table" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setView("table")}
                aria-label="Table view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-7 w-7"
                onClick={() => setView("grid")}
                aria-label="Grid view"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {documentsError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {documentsError instanceof Error
            ? documentsError.message
            : "Documents could not be loaded."}
        </div>
      ) : loading ? (
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (documents ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-background py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <FileText className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="mt-4 font-semibold">
            {scope === "active"
              ? "No documents here yet"
              : scope === "archived"
                ? "Archive is empty"
                : "Trash is empty"}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {scope === "active"
              ? "Create an OfficeKonnect document or upload a file. Real data will appear here—no sample documents are generated."
              : "Items moved here remain recoverable until a future retention policy is intentionally implemented."}
          </p>
          {scope === "active" && (
            <div className="mt-5 flex gap-2">
              <Button variant="outline" onClick={() => setUploadOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Upload
              </Button>
              <Button onClick={() => createMutation.mutate()}>
                <Plus className="mr-2 h-4 w-4" /> New document
              </Button>
            </div>
          )}
        </div>
      ) : view === "table" ? (
        <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(documents ?? []).map((document) => {
                const Icon = documentIcon(document);
                return (
                  <TableRow key={document.id}>
                    <TableCell>
                      <Link
                        to="/dashboard/documents/$documentId"
                        params={{ documentId: document.id }}
                        className="flex min-w-0 items-center gap-3 font-medium hover:underline"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="truncate">{document.title}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {document.document_kind === "native" ? "Document" : document.document_kind}
                    </TableCell>
                    <TableCell>
                      <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">
                        {statusLabel(document.document_status)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(document.updated_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {documentMeta(document)}
                    </TableCell>
                    <TableCell>{renderActions(document)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(documents ?? []).map((document) => {
            const Icon = documentIcon(document);
            return (
              <Card
                key={document.id}
                className="group overflow-hidden transition-shadow hover:shadow-md"
              >
                <CardContent className="p-0">
                  <Link
                    to="/dashboard/documents/$documentId"
                    params={{ documentId: document.id }}
                    className="flex h-32 items-center justify-center bg-muted/50"
                  >
                    <Icon className="h-12 w-12 text-muted-foreground/50 transition-transform group-hover:scale-105" />
                  </Link>
                  <div className="p-4">
                    <div className="flex items-start gap-2">
                      <Link
                        to="/dashboard/documents/$documentId"
                        params={{ documentId: document.id }}
                        className="min-w-0 flex-1"
                      >
                        <p className="truncate text-sm font-medium">{document.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {documentMeta(document)} •{" "}
                          {format(new Date(document.updated_at), "MMM d")}
                        </p>
                      </Link>
                      {renderActions(document)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload a file</DialogTitle>
            <DialogDescription>
              The original binary is stored privately under the active workspace. Maximum size: 10
              MB.
            </DialogDescription>
          </DialogHeader>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !uploadMutation.isPending && fileInputRef.current?.click()}
            className="relative flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center hover:bg-muted/30"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-3 text-sm font-medium">Uploading securely…</p>
              </>
            ) : (
              <>
                <Upload className="h-9 w-9 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Drop a file here or click to browse</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF, DOC/DOCX, XLS/XLSX, PNG, JPG
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              onChange={handleFileInput}
              disabled={uploadMutation.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>
              Change the display title without altering the underlying file or version history.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && renameValue.trim()) renameMutation.mutate();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => renameMutation.mutate()}
              disabled={!renameValue.trim() || renameMutation.isPending}
            >
              {renameMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
