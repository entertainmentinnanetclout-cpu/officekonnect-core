import { createFileRoute } from "@tanstack/react-router";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { searchWorkspace } from "@/lib/search.functions";

export const Route = createFileRoute("/dashboard/search/")({ component: SearchPage });

const filters = ["all", "document", "template", "workflow", "signature", "task", "member"] as const;

function iconFor(type: string) {
  if (type === "workflow") return Workflow;
  if (type === "signature") return FileSignature;
  if (type === "task") return CheckSquare2;
  if (type === "template") return FolderKanban;
  if (type === "member") return UserRound;
  return FileText;
}

function SearchPage() {
  const searchFn = useServerFn(searchWorkspace);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data: results, isFetching, error } = useQuery({
    queryKey: ["workspace-search-page", debounced],
    queryFn: () => searchFn({ data: { query: debounced, limit: 100 } }),
    staleTime: 15_000,
  });

  const filtered = useMemo(
    () => (results ?? []).filter((result) => filter === "all" || result.object_type === filter),
    [results, filter],
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const result of results ?? []) map.set(result.object_type, (map.get(result.object_type) ?? 0) + 1);
    return map;
  }, [results]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground">
          Search permission-scoped OfficeKonnect objects across the active workspace.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              className="h-14 pl-12 text-base"
              placeholder="Search documents, sheets, templates, workflows, e-signatures, tasks and members"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {filters.map((item) => (
              <Button
                key={item}
                size="sm"
                variant={filter === item ? "default" : "outline"}
                onClick={() => setFilter(item)}
              >
                {item === "all" ? "All" : item === "signature" ? "E-signatures" : `${item[0].toUpperCase()}${item.slice(1)}s`}
                {item !== "all" && <span className="ml-1 opacity-70">{counts.get(item) ?? 0}</span>}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {isFetching ? (
        <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Searching workspace…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-6 text-sm text-red-700">
          {error instanceof Error ? error.message : "Search failed"}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No matching workspace objects</p>
          <p className="mt-1 text-sm text-muted-foreground">Try another query or result type.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map((result) => {
            const Icon = iconFor(result.object_type);
            return (
              <a
                key={`${result.object_type}-${result.object_id}`}
                href={result.route}
                className="flex items-center gap-4 rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted"><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{result.title}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">{result.object_type}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{result.subtitle}</p>
                </div>
                {result.occurred_at && <span className="hidden text-xs text-muted-foreground sm:block">{new Date(result.occurred_at).toLocaleString()}</span>}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
