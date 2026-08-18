import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckSquare2,
  FileSignature,
  FileText,
  FolderKanban,
  Loader2,
  Search,
  UserRound,
  Workflow,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchWorkspace, type WorkspaceSearchResult } from "@/lib/search.functions";

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function resultIcon(type: string) {
  if (type === "workflow") return Workflow;
  if (type === "signature") return FileSignature;
  if (type === "task") return CheckSquare2;
  if (type === "template") return FolderKanban;
  if (type === "member") return UserRound;
  return FileText;
}

function groupLabel(type: string) {
  if (type === "signature") return "E-signatures";
  return `${type[0]?.toUpperCase() ?? ""}${type.slice(1)}s`;
}

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const searchFn = useServerFn(searchWorkspace);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const {
    data: results,
    isFetching,
    error,
  } = useQuery({
    queryKey: ["global-workspace-search", debounced],
    enabled: open,
    queryFn: () => searchFn({ data: { query: debounced, limit: 40 } }),
    staleTime: 15_000,
  });

  const groups = useMemo(() => {
    const map = new Map<string, WorkspaceSearchResult[]>();
    for (const result of results ?? []) {
      const current = map.get(result.object_type) ?? [];
      current.push(result);
      map.set(result.object_type, current);
    }
    return Array.from(map.entries());
  }, [results]);

  const openResult = (result: WorkspaceSearchResult) => {
    onOpenChange(false);
    window.location.assign(result.route);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Search workspace</DialogTitle>
          <DialogDescription>
            Search OfficeKonnect documents, templates, workflows, signatures, tasks and members.
          </DialogDescription>
        </DialogHeader>
        <div className="relative border-b p-4">
          <Search className="absolute left-7 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="h-12 border-0 bg-transparent pl-11 text-base shadow-none focus-visible:ring-0"
            placeholder="Search documents, workflows, signatures, tasks, people…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="absolute right-6 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Esc
          </span>
        </div>
        <div className="max-h-[65vh] overflow-y-auto p-2">
          {isFetching && (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching workspace…
            </div>
          )}
          {!isFetching && error && (
            <div className="p-8 text-center text-sm text-red-600">
              {error instanceof Error ? error.message : "Search failed"}
            </div>
          )}
          {!isFetching && !error && (results ?? []).length === 0 && (
            <div className="p-10 text-center">
              <Search className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No matching workspace objects</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Search is permission-scoped to the active workspace.
              </p>
            </div>
          )}
          {!isFetching &&
            groups.map(([type, rows]) => {
              const Icon = resultIcon(type);
              return (
                <section key={type} className="mb-3">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {groupLabel(type)}
                  </p>
                  <div className="space-y-1">
                    {rows.map((result) => (
                      <button
                        type="button"
                        key={`${result.object_type}-${result.object_id}`}
                        onClick={() => openResult(result)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted"
                      >
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{result.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {result.subtitle}
                          </p>
                        </div>
                        {result.occurred_at && (
                          <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:block">
                            {new Date(result.occurred_at).toLocaleDateString()}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
        </div>
        <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2 text-[10px] text-muted-foreground">
          <span>
            Enter opens the selected result by click · Results come from live workspace data
          </span>
          <a href="/dashboard/search" className="font-medium text-foreground hover:underline">
            Full search
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
