import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  Copy,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  createDocumentFromTemplate,
  createTemplateFromDocument,
  duplicateDocumentTemplate,
  updateDocumentTemplate,
} from "@/lib/document-templates.functions";
import {
  normalizeTemplateCategory,
  normalizeTemplateKind,
  TEMPLATE_CATEGORIES,
  templateSummary,
} from "@/lib/templates";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";

export const Route = createFileRoute("/dashboard/templates/")({ component: TemplatesIndex });

type TemplateRow = Tables<"document_templates">;
type DocumentRow = Tables<"documents">;
type Scope = "active" | "archived";

function TemplatesIndex() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>("active");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [kind, setKind] = useState<"all" | "document" | "spreadsheet">("all");
  const [preview, setPreview] = useState<TemplateRow | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [sourceDocumentId, setSourceDocumentId] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveCategory, setSaveCategory] = useState<string>("General");
  const [editTarget, setEditTarget] = useState<TemplateRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<string>("General");

  const createTemplateFn = useServerFn(createTemplateFromDocument);
  const useTemplateFn = useServerFn(createDocumentFromTemplate);
  const duplicateTemplateFn = useServerFn(duplicateDocumentTemplate);
  const updateTemplateFn = useServerFn(updateDocumentTemplate);

  const { data: workspaceId, isLoading: workspaceLoading } = useQuery({
    queryKey: ["templates-workspace"],
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
    data: templates,
    isLoading,
    error: templatesError,
  } = useQuery({
    queryKey: ["document-templates", workspaceId, scope, search, category, kind],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      let query = supabase
        .from("document_templates")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .eq("is_archived", scope === "archived");
      if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
      if (category !== "All") query = query.eq("category", category);
      if (kind !== "all") query = query.eq("template_kind", kind);
      const { data, error } = await query.order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: sourceDocuments } = useQuery({
    queryKey: ["template-source-documents", workspaceId],
    enabled: Boolean(workspaceId && saveOpen),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .in("document_kind", ["native", "spreadsheet"])
        .neq("document_status", "deleted")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedSource = useMemo(
    () => (sourceDocuments ?? []).find((document) => document.id === sourceDocumentId) ?? null,
    [sourceDocumentId, sourceDocuments],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["document-templates"] });

  const useMutationTemplate = useMutation({
    mutationFn: (template: TemplateRow) => useTemplateFn({ data: { templateId: template.id } }),
    onSuccess: async (document) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents"] }),
        queryClient.invalidateQueries({ queryKey: ["sheets"] }),
        queryClient.invalidateQueries({ queryKey: ["files-documents"] }),
      ]);
      toast.success("Created from template");
      if (document.document_kind === "spreadsheet") {
        await navigate({
          to: "/dashboard/sheets/$documentId",
          params: { documentId: document.id },
        });
      } else {
        await navigate({
          to: "/dashboard/documents/$documentId",
          params: { documentId: document.id },
        });
      }
    },
    onError: (error) => toastError(error, "Template could not be used"),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!sourceDocumentId) throw new Error("Choose a source document or spreadsheet");
      return createTemplateFn({
        data: {
          documentId: sourceDocumentId,
          name: saveName || selectedSource?.title,
          description: saveDescription,
          category: saveCategory,
        },
      });
    },
    onSuccess: async () => {
      setSaveOpen(false);
      setSourceDocumentId("");
      setSaveName("");
      setSaveDescription("");
      setSaveCategory("General");
      await refresh();
      toast.success("Template saved");
    },
    onError: (error) => toastError(error, "Template could not be saved"),
  });

  const beginEdit = (template: TemplateRow) => {
    setEditTarget(template);
    setEditName(template.name);
    setEditDescription(template.description ?? "");
    setEditCategory(normalizeTemplateCategory(template.category));
  };

  const updateTemplate = async () => {
    if (!editTarget) return;
    try {
      await updateTemplateFn({
        data: {
          templateId: editTarget.id,
          name: editName,
          description: editDescription,
          category: editCategory,
        },
      });
      setEditTarget(null);
      await refresh();
      toast.success("Template updated");
    } catch (error) {
      toastError(error, "Template update failed");
    }
  };

  const archiveTemplate = async (template: TemplateRow, archived: boolean) => {
    try {
      await updateTemplateFn({ data: { templateId: template.id, isArchived: archived } });
      await refresh();
      toast.success(archived ? "Template archived" : "Template restored");
    } catch (error) {
      toastError(error, "Template status update failed");
    }
  };

  const loading = workspaceLoading || isLoading;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable OfficeKonnect documents and spreadsheets backed by the existing template table.
          </p>
        </div>
        <Button onClick={() => setSaveOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Save from existing
        </Button>
      </div>

      <div className="rounded-xl border bg-background p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search templates…"
              className="pl-9"
            />
          </div>
          <div className="flex rounded-lg bg-muted p-1">
            <Button
              variant={scope === "active" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setScope("active")}
            >
              Active
            </Button>
            <Button
              variant={scope === "archived" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setScope("archived")}
            >
              Archived
            </Button>
          </div>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="All">All categories</option>
            {TEMPLATE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All types</option>
            <option value="document">Documents</option>
            <option value="spreadsheet">Spreadsheets</option>
          </select>
        </div>
      </div>

      {templatesError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {templatesError instanceof Error
            ? templatesError.message
            : "Templates could not be loaded."}
        </div>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-48 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (templates ?? []).length === 0 ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed bg-background p-8 text-center">
          <Sparkles className="h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">
            {scope === "archived" ? "No archived templates" : "Create your first reusable template"}
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {scope === "active"
              ? "Save an existing OfficeKonnect document or spreadsheet. No sample templates are injected into production."
              : "Archived templates remain recoverable here."}
          </p>
          {scope === "active" && (
            <Button className="mt-5" onClick={() => setSaveOpen(true)}>
              <FilePlus2 className="mr-2 h-4 w-4" />
              Save from existing
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(templates ?? []).map((template) => {
            const templateKind = normalizeTemplateKind(template.template_kind);
            const Icon = templateKind === "spreadsheet" ? FileSpreadsheet : FileText;
            const summary = templateSummary(template.template_kind, template.content);
            return (
              <Card key={template.id} className="overflow-hidden transition-shadow hover:shadow-md">
                <CardContent className="p-0">
                  <button
                    className="flex h-28 w-full items-center justify-center bg-muted/40"
                    onClick={() => setPreview(template)}
                  >
                    <Icon className="h-10 w-10 text-muted-foreground/60" />
                  </button>
                  <div className="p-4">
                    <div className="flex items-start gap-2">
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setPreview(template)}
                      >
                        <p className="truncate text-sm font-semibold">{template.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {normalizeTemplateCategory(template.category)} ·{" "}
                          {templateKind === "spreadsheet" ? "Spreadsheet" : "Document"}
                        </p>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setPreview(template)}>
                            Preview
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => beginEdit(template)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                await duplicateTemplateFn({ data: { templateId: template.id } });
                                await refresh();
                                toast.success("Template duplicated");
                              } catch (error) {
                                toastError(error, "Duplicate failed");
                              }
                            }}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {scope === "active" ? (
                            <DropdownMenuItem onClick={() => void archiveTemplate(template, true)}>
                              <Archive className="mr-2 h-4 w-4" />
                              Archive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => void archiveTemplate(template, false)}>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Restore
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="mt-3 line-clamp-2 min-h-10 text-xs text-muted-foreground">
                      {template.description || summary.detail}
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-muted-foreground">
                        {summary.label} · {format(new Date(template.updated_at), "MMM d")}
                      </span>
                      {scope === "active" && (
                        <Button
                          size="sm"
                          disabled={useMutationTemplate.isPending}
                          onClick={() => useMutationTemplate.mutate(template)}
                        >
                          Use template
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Capture the current persisted content of an existing native document or spreadsheet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Source</Label>
              <select
                value={sourceDocumentId}
                onChange={(event) => {
                  const id = event.target.value;
                  setSourceDocumentId(id);
                  const source = (sourceDocuments ?? []).find((document) => document.id === id);
                  if (source) {
                    setSaveName(source.title);
                    setSaveCategory(
                      source.document_kind === "spreadsheet" ? "Spreadsheets" : "General",
                    );
                  }
                }}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select a document or spreadsheet</option>
                {(sourceDocuments ?? []).map((document: DocumentRow) => (
                  <option key={document.id} value={document.id}>
                    {document.title} ·{" "}
                    {document.document_kind === "spreadsheet" ? "Spreadsheet" : "Document"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                placeholder="Template name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select
                value={saveCategory}
                onChange={(event) => setSaveCategory(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {TEMPLATE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={saveDescription}
                onChange={(event) => setSaveDescription(event.target.value)}
                placeholder="When should this template be used?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!sourceDocumentId || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
              template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
            <DialogDescription>
              {preview
                ? `${normalizeTemplateCategory(preview.category)} · ${normalizeTemplateKind(preview.template_kind) === "spreadsheet" ? "Spreadsheet" : "Document"}`
                : "Template preview"}
            </DialogDescription>
          </DialogHeader>
          {preview &&
            (() => {
              const summary = templateSummary(preview.template_kind, preview.content);
              return (
                <div className="space-y-4">
                  <div className="rounded-xl border bg-muted/20 p-5">
                    <p className="text-sm font-medium">{summary.label}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {summary.detail}
                    </p>
                  </div>
                  {preview.description && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Purpose
                      </p>
                      <p className="mt-1 text-sm">{preview.description}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          <DialogFooter>
            {preview && scope === "active" && (
              <Button
                disabled={useMutationTemplate.isPending}
                onClick={() => useMutationTemplate.mutate(preview)}
              >
                {useMutationTemplate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Use template
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit template</DialogTitle>
            <DialogDescription>
              Update template metadata without changing its captured content.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select
                value={editCategory}
                onChange={(event) => setEditCategory(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {TEMPLATE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button disabled={!editName.trim()} onClick={() => void updateTemplate()}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
