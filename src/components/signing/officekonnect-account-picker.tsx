import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  searchOfficeKonnectDirectory,
  type OfficeKonnectDirectoryEntry,
} from "@/lib/signing-account.functions";

export function OfficeKonnectAccountPicker({
  open,
  onOpenChange,
  onSelect,
  excludeUserIds = [],
  title = "Choose an OfficeKonnect account",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (entry: OfficeKonnectDirectoryEntry) => void;
  excludeUserIds?: string[];
  title?: string;
}) {
  const searchFn = useServerFn(searchOfficeKonnectDirectory);
  const [query, setQuery] = useState("");
  const {
    data = [],
    isFetching,
    error,
  } = useQuery({
    queryKey: ["officekonnect-directory", query],
    enabled: open,
    queryFn: () => searchFn({ data: { query, limit: 30 } }),
    staleTime: 20_000,
  });

  const excluded = new Set(excludeUserIds);
  const visible = data.filter((entry) => !excluded.has(entry.user_id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Search every registered OfficeKonnect profile by name, email address or username.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email or @username"
              className="pl-9"
            />
            {isFetching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="mt-3 max-h-[360px] overflow-y-auto rounded-lg border">
            {error ? (
              <p className="p-4 text-sm text-destructive">
                {error instanceof Error
                  ? error.message
                  : "Could not search OfficeKonnect accounts."}
              </p>
            ) : visible.length === 0 && !isFetching ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No registered OfficeKonnect account matches this search.
              </div>
            ) : (
              visible.map((entry) => {
                const initials = (entry.full_name || entry.email)
                  .split(/\s+/)
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <button
                    key={entry.user_id}
                    type="button"
                    onClick={() => {
                      onSelect(entry);
                      onOpenChange(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-3 border-b p-3 text-left transition last:border-b-0 hover:bg-muted/60 focus:bg-muted focus:outline-none"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
                      {entry.avatar_url ? (
                        <img src={entry.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : initials ? (
                        initials
                      ) : (
                        <UserRound className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {entry.full_name?.trim() || entry.email}
                        </p>
                        {entry.username && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            @{entry.username}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{entry.email}</p>
                    </div>
                    <Check className="h-4 w-4 text-muted-foreground" />
                  </button>
                );
              })
            )}
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
