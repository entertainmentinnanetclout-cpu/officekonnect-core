import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  ChevronRight,
  Copy,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Move,
  Pencil,
  RotateCcw,
  Search,
  Share2,
  Star,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/hooks/use-auth";
import {
  createDocumentRecord,
  createSignedUploadUrl,
  duplicateNativeDocument,
  exportNativeDocumentPdf,
  renameDocument,
  updateDocumentStatus,
} from "@/lib/documents.functions";
import { duplicateSpreadsheet, exportSpreadsheetPdf } from "@/lib/spreadsheets.functions";
import {
  createWorkspaceFolder,
  deleteWorkspaceFolder,
  duplicateUploadedFile,
  getWorkspaceMemberDirectory,
  moveDocumentToFolder,
  removeDocumentShare,
  renameWorkspaceFolder,
  setDocumentFavorite,
  shareDocumentWithMember,
} from "@/lib/files.functions";
import { downloadDocumentFromStorage } from "@/lib/download";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/dashboard/files/")({ component: FilesIndex });

type Scope = "files" | "favorites" | "shared" | "archived" | "trash";
type SortMode = "updated" | "created" | "title" | "size";
type DocumentRow = Tables<"documents">;
type FolderRow = Tables<"workspace_folders">;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx", "xls", "xlsx", "png", "jpg", "jpeg"]);

function iconFor(document: DocumentRow) {
  if (document.document_kind === "native") return FileText;
  if (document.document_kind === "spreadsheet") return FileSpreadsheet;
  return File;
}

function metaFor(document: DocumentRow) {
  if (document.document_kind === "native") return `${document.word_count.toLocaleString()} words`;
  if (document.document_kind === "spreadsheet") {
    return `${document.sheet_count.toLocaleString()} sheet${document.sheet_count === 1 ? "" : "s"}`;
  }
  return document.file_size
    ? `${(document.file_size / 1024 / 1024).toFixed(2)} MB`
    : "Uploaded file";
}

function FilesIndex() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState<Scope>("files");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("updated");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renameDocumentTarget, setRenameDocumentTarget] = useState<DocumentRow | null>(null);
  const [renameFolderTarget, setRenameFolderTarget] = useState<FolderRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveTarget, setMoveTarget] = useState<DocumentRow | null>(null);
  const [shareTarget, setShareTarget] = useState<DocumentRow | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState("");

  const uploadUrlFn = useServerFn(createSignedUploadUrl);
  const createRecordFn = useServerFn(createDocumentRecord);
  const createFolderFn = useServerFn(createWorkspaceFolder);
  const renameFolderFn = useServerFn(renameWorkspaceFolder);
  const deleteFolderFn = useServerFn(deleteWorkspaceFolder);
  const moveDocumentFn = useServerFn(moveDocumentToFolder);
  const favoriteFn = useServerFn(setDocumentFavorite);
  const shareFn = useServerFn(shareDocumentWithMember);
  const unshareFn = useServerFn(removeDocumentShare);
  const directoryFn = useServerFn(getWorkspaceMemberDirectory);
  const duplicateFileFn = useServerFn(duplicateUploadedFile);
  const duplicateNativeFn = useServerFn(duplicateNativeDocument);
  const duplicateSheetFn = useServerFn(duplicateSpreadsheet);
  const renameDocumentFn = useServerFn(renameDocument);
  const statusFn = useServerFn(updateDocumentStatus);
  const exportNativeFn = useServerFn(exportNativeDocumentPdf);
  const exportSheetFn = useServerFn(exportSpreadsheetPdf);

  const { data: workspaceContext, isLoading: workspaceLoading } = useQuery({
    queryKey: ["files-workspace-context", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("default_workspace_id")
        .eq("id", user!.id)
        .single();
      if (profileError) throw profileError;
      if (!profile.default_workspace_id) throw new Error("No active workspace is selected");
      const { data: membership, error: membershipError } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", profile.default_workspace_id)
        .eq("user_id", user!.id)
        .single();
      if (membershipError) throw membershipError;
      return { id: profile.default_workspace_id, role: String(membership.role) };
    },
  });
  const workspaceId = workspaceContext?.id;
  const isAdmin = workspaceContext?.role === "owner" || workspaceContext?.role === "admin";

  const { data: folders, isLoading: foldersLoading } = useQuery({
    queryKey: ["files-folders", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_folders")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: folderItems } = useQuery({
    queryKey: ["files-folder-items", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_folder_items")
        .select("document_id,folder_id")
        .eq("workspace_id", workspaceId!);
      if (error) throw error;
      return data;
    },
  });

  const { data: favorites } = useQuery({
    queryKey: ["files-favorites", workspaceId, user?.id],
    enabled: Boolean(workspaceId && user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_favorites")
        .select("document_id")
        .eq("workspace_id", workspaceId!)
        .eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
  });

  const { data: receivedShares } = useQuery({
    queryKey: ["files-received-shares", workspaceId, user?.id],
    enabled: Boolean(workspaceId && user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_shares")
        .select("document_id,shared_by,shared_with,created_at")
        .eq("workspace_id", workspaceId!)
        .eq("shared_with", user!.id);
      if (error) throw error;
      return data;
    },
  });

  const {
    data: documents,
    isLoading: documentsLoading,
    error: documentsError,
  } = useQuery({
    queryKey: ["files-documents", workspaceId, scope, search, sort],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      let query = supabase.from("documents").select("*").eq("workspace_id", workspaceId!);
      if (scope === "archived") query = query.eq("document_status", "archived");
      else if (scope === "trash") query = query.eq("document_status", "deleted");
      else query = query.neq("document_status", "archived").neq("document_status", "deleted");
      if (search.trim()) query = query.ilike("title", `%${search.trim()}%`);
      if (sort === "title") query = query.order("title", { ascending: true });
      else if (sort === "created") query = query.order("created_at", { ascending: false });
      else if (sort === "size")
        query = query.order("file_size", { ascending: false, nullsFirst: false });
      else query = query.order("updated_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: memberDirectory } = useQuery({
    queryKey: ["files-member-directory", workspaceId],
    enabled: Boolean(workspaceId && shareTarget),
    queryFn: () => directoryFn(),
  });

  const { data: targetShares } = useQuery({
    queryKey: ["files-target-shares", shareTarget?.id],
    enabled: Boolean(shareTarget),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_shares")
        .select("id,shared_with,permission")
        .eq("document_id", shareTarget!.id);
      if (error) throw error;
      return data;
    },
  });

  const folderByDocument = useMemo(
    () => new Map((folderItems ?? []).map((item) => [item.document_id, item.folder_id])),
    [folderItems],
  );
  const favoriteIds = useMemo(
    () => new Set((favorites ?? []).map((row) => row.document_id)),
    [favorites],
  );
  const sharedIds = useMemo(
    () => new Set((receivedShares ?? []).map((row) => row.document_id)),
    [receivedShares],
  );
  const currentFolder = (folders ?? []).find((folder) => folder.id === currentFolderId) ?? null;
  const childFolders = (folders ?? []).filter((folder) => folder.parent_id === currentFolderId);

  const visibleDocuments = useMemo(() => {
    const rows = documents ?? [];
    if (scope === "favorites") return rows.filter((document) => favoriteIds.has(document.id));
    if (scope === "shared") return rows.filter((document) => sharedIds.has(document.id));
    if (scope === "files") {
      return rows.filter(
        (document) => (folderByDocument.get(document.id) ?? null) === currentFolderId,
      );
    }
    return rows;
  }, [documents, favoriteIds, folderByDocument, currentFolderId, scope, sharedIds]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["files-documents"] }),
      queryClient.invalidateQueries({ queryKey: ["files-folders"] }),
      queryClient.invalidateQueries({ queryKey: ["files-folder-items"] }),
      queryClient.invalidateQueries({ queryKey: ["files-favorites"] }),
      queryClient.invalidateQueries({ queryKey: ["files-received-shares"] }),
      queryClient.invalidateQueries({ queryKey: ["documents"] }),
      queryClient.invalidateQueries({ queryKey: ["sheets"] }),
    ]);
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: globalThis.File) => {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("Files must be 10 MB or smaller");
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ALLOWED_EXTENSIONS.has(extension))
        throw new Error("Supported uploads: PDF, DOC/DOCX, XLS/XLSX, PNG and JPG");
      const signed = await uploadUrlFn({
        data: { bucket: "documents", path: `${crypto.randomUUID()}.${extension || "bin"}` },
      });
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .uploadToSignedUrl(signed.path, signed.token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (uploadError) throw uploadError;
      try {
        const document = await createRecordFn({
          data: {
            title: file.name,
            storagePath: signed.path,
            fileType: file.type || "application/octet-stream",
            fileSize: file.size,
          },
        });
        if (scope === "files" && currentFolderId) {
          await moveDocumentFn({ data: { documentId: document.id, folderId: currentFolderId } });
        }
        return document;
      } catch (error) {
        await supabase.storage.from("documents").remove([signed.path]);
        throw error;
      }
    },
    onSuccess: async () => {
      setUploadOpen(false);
      await invalidate();
      toast.success("File uploaded");
    },
    onError: (error) => toastError(error, "Upload failed"),
  });

  const createFolderMutation = useMutation({
    mutationFn: () => createFolderFn({ data: { name: folderName, parentId: currentFolderId } }),
    onSuccess: async () => {
      setFolderOpen(false);
      setFolderName("");
      await invalidate();
      toast.success("Folder created");
    },
    onError: (error) => toastError(error, "Folder could not be created"),
  });

  const favoriteMutation = useMutation({
    mutationFn: ({ documentId, favorite }: { documentId: string; favorite: boolean }) =>
      favoriteFn({ data: { documentId, favorite } }),
    onSuccess: invalidate,
    onError: (error) => toastError(error, "Favourite update failed"),
  });

  const statusMutation = useMutation({
    mutationFn: ({
      documentId,
      status,
    }: {
      documentId: string;
      status: "draft" | "archived" | "deleted";
    }) => statusFn({ data: { documentId, status } }),
    onSuccess: invalidate,
    onError: (error) => toastError(error, "File status update failed"),
  });

  const canManage = (document: DocumentRow) =>
    Boolean(user && (document.created_by === user.id || isAdmin));
  const canManageFolder = (folder: FolderRow) =>
    Boolean(user && (folder.created_by === user.id || isAdmin));

  const handleDownload = async (document: DocumentRow) => {
    try {
      if (document.document_kind === "native") {
        const result = await exportNativeFn({ data: { documentId: document.id } });
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else if (document.document_kind === "spreadsheet") {
        const result = await exportSheetFn({ data: { documentId: document.id } });
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else if (document.storage_path) {
        await downloadDocumentFromStorage(document.storage_path, document.title);
      }
    } catch (error) {
      toastError(error, "Download failed");
    }
  };

  const duplicate = async (document: DocumentRow) => {
    try {
      if (document.document_kind === "native")
        await duplicateNativeFn({ data: { documentId: document.id } });
      else if (document.document_kind === "spreadsheet")
        await duplicateSheetFn({ data: { documentId: document.id } });
      else await duplicateFileFn({ data: { documentId: document.id } });
      await invalidate();
      toast.success("Copy created");
    } catch (error) {
      toastError(error, "Duplicate failed");
    }
  };

  const submitUpload = (file?: globalThis.File | null) => {
    if (file && !uploadMutation.isPending) uploadMutation.mutate(file);
  };
  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    submitUpload(event.target.files?.[0]);
    event.target.value = "";
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    submitUpload(event.dataTransfer.files?.[0]);
  };

  const beginRenameDocument = (document: DocumentRow) => {
    setRenameDocumentTarget(document);
    setRenameValue(document.title);
  };
  const beginRenameFolder = (folder: FolderRow) => {
    setRenameFolderTarget(folder);
    setRenameValue(folder.name);
  };

  const folderPath = useMemo(() => {
    const result: FolderRow[] = [];
    let cursor = currentFolder;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      result.unshift(cursor);
      seen.add(cursor.id);
      cursor = (folders ?? []).find((folder) => folder.id === cursor!.parent_id) ?? null;
    }
    return result;
  }, [currentFolder, folders]);

  const loading = workspaceLoading || foldersLoading || documentsLoading;
  const scopes: Array<{ value: Scope; label: string; icon: typeof Folder }> = [
    { value: "files", label: "All files", icon: Folder },
    { value: "favorites", label: "Favourites", icon: Star },
    { value: "shared", label: "Shared with me", icon: Users },
    { value: "archived", label: "Archive", icon: Archive },
    { value: "trash", label: "Trash", icon: Trash2 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Files</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize OfficeKonnect documents, sheets and uploaded files without moving their private
            Storage objects.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setFolderOpen(true)}
            disabled={scope !== "files"}
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            New folder
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Upload file
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="rounded-xl border bg-background p-2 shadow-sm">
          <nav className="space-y-1">
            {scopes.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.value}
                  variant={scope === item.value ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => {
                    setScope(item.value);
                    if (item.value !== "files") setCurrentFolderId(null);
                  }}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </nav>
          <div className="my-3 border-t" />
          <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Folders
          </p>
          <div className="space-y-1">
            {(folders ?? [])
              .filter((folder) => folder.parent_id === null)
              .map((folder) => (
                <Button
                  key={folder.id}
                  variant={
                    scope === "files" && currentFolderId === folder.id ? "secondary" : "ghost"
                  }
                  className="w-full justify-start overflow-hidden"
                  onClick={() => {
                    setScope("files");
                    setCurrentFolderId(folder.id);
                  }}
                >
                  <Folder className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">{folder.name}</span>
                </Button>
              ))}
            {(folders ?? []).length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                Create folders to group working files.
              </p>
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-3">
          <div className="rounded-xl border bg-background p-3 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="flex min-w-0 items-center gap-1 text-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setScope("files");
                    setCurrentFolderId(null);
                  }}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Files
                </Button>
                {scope === "files" &&
                  folderPath.map((folder) => (
                    <span key={folder.id} className="flex min-w-0 items-center">
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-w-0"
                        onClick={() => setCurrentFolderId(folder.id)}
                      >
                        <span className="truncate">{folder.name}</span>
                      </Button>
                    </span>
                  ))}
                {scope !== "files" && (
                  <>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    <span className="px-2 font-medium">
                      {scopes.find((item) => item.value === scope)?.label}
                    </span>
                  </>
                )}
              </div>
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search files…"
                  className="pl-9"
                />
              </div>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="updated">Recently updated</option>
                <option value="created">Recently created</option>
                <option value="title">Name A–Z</option>
                <option value="size">Largest files</option>
              </select>
            </div>
          </div>

          {scope === "files" && childFolders.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {childFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center gap-2 rounded-xl border bg-background p-3 shadow-sm"
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => setCurrentFolderId(folder.id)}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                      <Folder className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-medium">{folder.name}</span>
                  </button>
                  {canManageFolder(folder) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => beginRenameFolder(folder)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={async () => {
                            if (
                              !window.confirm(
                                `Delete “${folder.name}” and its subfolders? Documents will remain in Files.`,
                              )
                            )
                              return;
                            try {
                              await deleteFolderFn({ data: { folderId: folder.id } });
                              if (currentFolderId === folder.id) setCurrentFolderId(null);
                              await invalidate();
                              toast.success("Folder deleted");
                            } catch (error) {
                              toastError(error, "Folder delete failed");
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete folder
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          )}

          {documentsError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
              {documentsError instanceof Error
                ? documentsError.message
                : "Files could not be loaded."}
            </div>
          ) : loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-14 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : visibleDocuments.length === 0 && childFolders.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed bg-background p-8 text-center">
              <FolderOpen className="h-10 w-10 text-muted-foreground" />
              <h2 className="mt-4 font-semibold">
                {scope === "favorites"
                  ? "No favourites yet"
                  : scope === "shared"
                    ? "Nothing has been explicitly shared with you"
                    : scope === "archived"
                      ? "Archive is empty"
                      : scope === "trash"
                        ? "Trash is empty"
                        : currentFolder
                          ? "This folder is empty"
                          : "Your file workspace is ready"}
              </h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {scope === "files"
                  ? "Upload a real file or create a folder. Native documents and sheets also appear here automatically."
                  : "Items will appear here when they match this view."}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleDocuments.map((document) => {
                    const Icon = iconFor(document);
                    const favourite = favoriteIds.has(document.id);
                    const manageable = canManage(document);
                    const openTo =
                      document.document_kind === "spreadsheet"
                        ? "/dashboard/sheets/$documentId"
                        : "/dashboard/documents/$documentId";
                    return (
                      <TableRow key={document.id}>
                        <TableCell>
                          <Link
                            to={openTo}
                            params={{ documentId: document.id }}
                            className="flex min-w-0 items-center gap-3 font-medium hover:underline"
                          >
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="truncate">{document.title}</span>
                            {favourite && (
                              <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
                            )}
                          </Link>
                        </TableCell>
                        <TableCell className="capitalize text-muted-foreground">
                          {document.document_kind === "native"
                            ? "Document"
                            : document.document_kind}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(document.updated_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{metaFor(document)}</TableCell>
                        <TableCell>
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
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel>File actions</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() =>
                                  favoriteMutation.mutate({
                                    documentId: document.id,
                                    favorite: !favourite,
                                  })
                                }
                              >
                                <Star className="mr-2 h-4 w-4" />
                                {favourite ? "Remove favourite" : "Add to favourites"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handleDownload(document)}>
                                <Download className="mr-2 h-4 w-4" />
                                {document.document_kind === "file" ? "Download" : "Export PDF"}
                              </DropdownMenuItem>
                              {manageable && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => beginRenameDocument(document)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setMoveTarget(document)}>
                                    <Move className="mr-2 h-4 w-4" />
                                    Move
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setShareTarget(document);
                                      setSelectedMemberId("");
                                    }}
                                  >
                                    <Share2 className="mr-2 h-4 w-4" />
                                    Share
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => void duplicate(document)}>
                                    <Copy className="mr-2 h-4 w-4" />
                                    Duplicate
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {scope === "archived" || scope === "trash" ? (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        statusMutation.mutate({
                                          documentId: document.id,
                                          status: "draft",
                                        })
                                      }
                                    >
                                      <RotateCcw className="mr-2 h-4 w-4" />
                                      Restore
                                    </DropdownMenuItem>
                                  ) : (
                                    <>
                                      <DropdownMenuItem
                                        onClick={() =>
                                          statusMutation.mutate({
                                            documentId: document.id,
                                            status: "archived",
                                          })
                                        }
                                      >
                                        <Archive className="mr-2 h-4 w-4" />
                                        Archive
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="text-red-600 focus:text-red-600"
                                        onClick={() =>
                                          statusMutation.mutate({
                                            documentId: document.id,
                                            status: "deleted",
                                          })
                                        }
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Move to Trash
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload file</DialogTitle>
            <DialogDescription>
              The binary stays in the private documents bucket. Maximum size is 10 MB.
            </DialogDescription>
          </DialogHeader>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !uploadMutation.isPending && inputRef.current?.click()}
            className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center hover:bg-muted/30"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin" />
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
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              onChange={handleInput}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              {currentFolder
                ? `Create inside ${currentFolder.name}.`
                : "Create at the workspace root."}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            autoFocus
            onKeyDown={(event) =>
              event.key === "Enter" && folderName.trim() && createFolderMutation.mutate()
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!folderName.trim() || createFolderMutation.isPending}
              onClick={() => createFolderMutation.mutate()}
            >
              {createFolderMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renameDocumentTarget || renameFolderTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRenameDocumentTarget(null);
            setRenameFolderTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename {renameFolderTarget ? "folder" : "file"}</DialogTitle>
            <DialogDescription>
              Change the display name without changing the private Storage object.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameDocumentTarget(null);
                setRenameFolderTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!renameValue.trim()}
              onClick={async () => {
                try {
                  if (renameFolderTarget)
                    await renameFolderFn({
                      data: { folderId: renameFolderTarget.id, name: renameValue },
                    });
                  else if (renameDocumentTarget)
                    await renameDocumentFn({
                      data: { documentId: renameDocumentTarget.id, title: renameValue },
                    });
                  setRenameDocumentTarget(null);
                  setRenameFolderTarget(null);
                  await invalidate();
                  toast.success("Renamed");
                } catch (error) {
                  toastError(error, "Rename failed");
                }
              }}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moveTarget)} onOpenChange={(open) => !open && setMoveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move file</DialogTitle>
            <DialogDescription>
              Folders organize records only; the private Storage path remains stable.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={async () => {
                if (!moveTarget) return;
                try {
                  await moveDocumentFn({ data: { documentId: moveTarget.id, folderId: null } });
                  setMoveTarget(null);
                  await invalidate();
                  toast.success("Moved to Files root");
                } catch (error) {
                  toastError(error, "Move failed");
                }
              }}
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              Files root
            </Button>
            {(folders ?? []).map((folder) => (
              <Button
                key={folder.id}
                variant="ghost"
                className="w-full justify-start"
                onClick={async () => {
                  if (!moveTarget) return;
                  try {
                    await moveDocumentFn({
                      data: { documentId: moveTarget.id, folderId: folder.id },
                    });
                    setMoveTarget(null);
                    await invalidate();
                    toast.success(`Moved to ${folder.name}`);
                  } catch (error) {
                    toastError(error, "Move failed");
                  }
                }}
              >
                <Folder className="mr-2 h-4 w-4" />
                {folder.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(shareTarget)} onOpenChange={(open) => !open && setShareTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share {shareTarget?.title}</DialogTitle>
            <DialogDescription>
              Explicit shares are view-only and limited to members of this workspace. Existing
              workspace visibility and RLS are not weakened.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <select
                value={selectedMemberId}
                onChange={(event) => setSelectedMemberId(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select workspace member</option>
                {(memberDirectory ?? [])
                  .filter(
                    (member) =>
                      !(targetShares ?? []).some((share) => share.shared_with === member.user_id),
                  )
                  .map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name || member.email} · {member.role}
                    </option>
                  ))}
              </select>
              <Button
                disabled={!selectedMemberId}
                onClick={async () => {
                  if (!shareTarget || !selectedMemberId) return;
                  try {
                    await shareFn({
                      data: { documentId: shareTarget.id, userId: selectedMemberId },
                    });
                    setSelectedMemberId("");
                    await queryClient.invalidateQueries({ queryKey: ["files-target-shares"] });
                    toast.success("View access recorded");
                  } catch (error) {
                    toastError(error, "Share failed");
                  }
                }}
              >
                Share
              </Button>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                People with explicit access
              </p>
              {(targetShares ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                  No explicit shares yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {(targetShares ?? []).map((share) => {
                    const member = (memberDirectory ?? []).find(
                      (item) => item.user_id === share.shared_with,
                    );
                    return (
                      <div key={share.id} className="flex items-center gap-3 rounded-lg border p-3">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {member?.full_name || member?.email || "Workspace member"}
                          </p>
                          <p className="text-xs text-muted-foreground">View only</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (!shareTarget) return;
                            try {
                              await unshareFn({
                                data: { documentId: shareTarget.id, userId: share.shared_with },
                              });
                              await queryClient.invalidateQueries({
                                queryKey: ["files-target-shares"],
                              });
                              toast.success("Explicit share removed");
                            } catch (error) {
                              toastError(error, "Could not remove share");
                            }
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
