import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import {
  FileSignature,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { OfficeKonnectAccountPicker } from "@/components/signing/officekonnect-account-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toastError } from "@/lib/errors";
import type { OfficeKonnectDirectoryEntry } from "@/lib/signing-account.functions";
import { createSigningDraft } from "@/lib/signing.functions";
import { signingStatusLabel, type ParticipantRole } from "@/lib/signing";

export const Route = createFileRoute("/dashboard/signing/")({ component: SigningDashboard });

type RequestRow = Tables<"signing_requests">;
type ParticipantRow = Tables<"signing_participants">;

type DraftParticipant = {
  key: string;
  entry: OfficeKonnectDirectoryEntry;
  role: ParticipantRole;
};

const statusTabs = [
  "all",
  "draft",
  "sent",
  "in_progress",
  "completed",
  "declined",
  "cancelled",
] as const;

function statusClass(status: string) {
  if (status === "completed")
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "declined" || status === "cancelled")
    return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (status === "sent" || status === "in_progress")
    return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function SigningDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createDraftFn = useServerFn(createSigningDraft);
  const [status, setStatus] = useState<(typeof statusTabs)[number]>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRole, setPickerRole] = useState<ParticipantRole>("signer");
  const [documentId, setDocumentId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [order, setOrder] = useState<"parallel" | "sequential">("parallel");
  const [participants, setParticipants] = useState<DraftParticipant[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") !== "1") return;
    const nextDocumentId = params.get("document");
    const nextTitle = params.get("title");
    if (nextDocumentId) setDocumentId(nextDocumentId);
    if (nextTitle) setTitle(nextTitle);
    setCreateOpen(true);
    window.history.replaceState({}, "", "/dashboard/signing");
  }, []);

  const { data: context } = useQuery({
    queryKey: ["signing-context"],
    queryFn: async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Authentication required");
      if (auth.user.is_anonymous || !auth.user.email) {
        throw new Error("Sign in with an OfficeKonnect account to use secure e-signatures");
      }
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("default_workspace_id,full_name,email,username,avatar_url")
        .eq("id", auth.user.id)
        .single();
      if (profileError) throw profileError;
      if (!profile.default_workspace_id) throw new Error("No active workspace selected");
      return {
        userId: auth.user.id,
        workspaceId: profile.default_workspace_id,
        ownEntry: {
          user_id: auth.user.id,
          full_name: profile.full_name,
          email: profile.email || auth.user.email,
          username: profile.username,
          avatar_url: profile.avatar_url,
        } as OfficeKonnectDirectoryEntry,
      };
    },
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["signing-requests", context?.workspaceId],
    enabled: Boolean(context?.workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signing_requests")
        .select("*")
        .eq("workspace_id", context!.workspaceId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const requestIds = requests.map((request) => request.id);
  const { data: allParticipants = [] } = useQuery({
    queryKey: ["signing-participants-dashboard", requestIds.join(",")],
    enabled: requestIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signing_participants")
        .select("*")
        .in("request_id", requestIds)
        .order("order_index");
      if (error) throw error;
      return data;
    },
  });

  const { data: pdfDocuments = [] } = useQuery({
    queryKey: ["signing-pdf-documents", context?.workspaceId, createOpen],
    enabled: Boolean(context?.workspaceId && createOpen),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id,title,file_type,storage_path,current_file_url,document_status")
        .eq("workspace_id", context!.workspaceId)
        .eq("document_kind", "file")
        .neq("document_status", "deleted")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter(
        (document) =>
          document.file_type?.toLowerCase() === "application/pdf" ||
          document.file_type?.toLowerCase() === "pdf" ||
          document.storage_path?.toLowerCase().endsWith(".pdf") ||
          document.current_file_url?.toLowerCase().includes(".pdf"),
      );
    },
  });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter((request) => {
      if (status !== "all" && request.status !== status) return false;
      if (!needle) return true;
      return (
        request.title.toLowerCase().includes(needle) ||
        request.message?.toLowerCase().includes(needle)
      );
    });
  }, [requests, query, status]);

  const counts = useMemo(
    () => ({
      drafts: requests.filter((row) => row.status === "draft").length,
      active: requests.filter((row) => row.status === "sent" || row.status === "in_progress")
        .length,
      complete: requests.filter((row) => row.status === "completed").length,
      waitingOnMe: allParticipants.filter(
        (participant) =>
          participant.user_id === context?.userId &&
          ["pending", "viewed"].includes(participant.status),
      ).length,
    }),
    [requests, allParticipants, context?.userId],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!documentId) throw new Error("Choose a PDF document");
      if (!title.trim()) throw new Error("Enter a request title");
      if (!participants.some((participant) => participant.role !== "cc")) {
        throw new Error("Add at least one registered signer or approver");
      }
      return createDraftFn({
        data: {
          documentId,
          title,
          message,
          signingOrder: order,
          participants: participants.map((participant, index) => ({
            userId: participant.entry.user_id,
            email: participant.entry.email,
            fullName: participant.entry.full_name,
            role: participant.role,
            orderIndex: index,
          })),
        },
      });
    },
    onSuccess: async (result) => {
      toast.success("Signing draft created");
      setCreateOpen(false);
      setParticipants([]);
      await queryClient.invalidateQueries({ queryKey: ["signing-requests"] });
      await navigate({
        to: "/dashboard/signing/$requestId/prepare",
        params: { requestId: result.request.id },
      });
    },
    onError: (error) => toastError(error, "Could not create signing draft"),
  });

  const addEntry = (entry: OfficeKonnectDirectoryEntry, role: ParticipantRole) => {
    setParticipants((current) => {
      if (current.some((participant) => participant.entry.user_id === entry.user_id))
        return current;
      return [...current, { key: crypto.randomUUID(), entry, role }];
    });
  };

  const participantsFor = (requestId: string) =>
    allParticipants.filter((participant) => participant.request_id === requestId);

  const resetCreate = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setDocumentId("");
      setTitle("");
      setMessage("");
      setOrder("parallel");
      setParticipants([]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">E-signatures</h1>
          <p className="text-sm text-muted-foreground">
            Prepare, pre-sign, send and audit PDF requests between registered OfficeKonnect
            accounts.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New request
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            { label: "Drafts", value: counts.drafts, icon: FileSignature },
            { label: "Active", value: counts.active, icon: Users },
            { label: "Waiting on me", value: counts.waitingOnMe, icon: ShieldCheck },
            { label: "Completed", value: counts.complete, icon: ShieldCheck },
          ] satisfies Array<{ label: string; value: number; icon: LucideIcon }>
        ).map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
              </div>
              <Icon className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {statusTabs.map((tab) => (
            <Button
              key={tab}
              size="sm"
              variant={status === tab ? "default" : "outline"}
              onClick={() => setStatus(tab)}
            >
              {tab === "all" ? "All" : signingStatusLabel(tab)}
            </Button>
          ))}
        </div>
        <div className="relative w-full lg:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search signature requests"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <FileSignature className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No signing requests here</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a request from a saved PDF document.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((request: RequestRow) => {
            const people = participantsFor(request.id);
            return (
              <Link
                key={request.id}
                to="/dashboard/signing/$requestId"
                params={{ requestId: request.id }}
                className="rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold">{request.title}</h2>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${statusClass(request.status)}`}
                      >
                        {signingStatusLabel(request.status)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {request.message ||
                        `${people.length} participant${people.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(request.updated_at), { addSuffix: true })}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={resetCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New signing request</DialogTitle>
            <DialogDescription>
              Choose a saved PDF and registered OfficeKonnect accounts. You can add yourself as a
              signer and sign before sending.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>PDF document</Label>
              <Select value={documentId} onValueChange={setDocumentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a saved PDF" />
                </SelectTrigger>
                <SelectContent>
                  {pdfDocuments.map((document) => (
                    <SelectItem key={document.id} value={document.id}>
                      {document.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {pdfDocuments.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No saved PDFs found. Open a native document and use Save as → PDF document first.
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Request title</Label>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Service agreement"
                />
              </div>
              <div className="space-y-2">
                <Label>Signing order</Label>
                <Select
                  value={order}
                  onValueChange={(value) => setOrder(value as "parallel" | "sequential")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parallel">Parallel</SelectItem>
                    <SelectItem value="sequential">Sequential</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Optional instructions for signers"
              />
            </div>

            <div className="rounded-xl border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Participants</p>
                  <p className="text-xs text-muted-foreground">
                    Only registered OfficeKonnect profiles can be selected.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {context?.ownEntry &&
                    !participants.some(
                      (participant) => participant.entry.user_id === context.userId,
                    ) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addEntry(context.ownEntry, "signer")}
                      >
                        <UserPlus className="mr-2 h-4 w-4" /> Add myself
                      </Button>
                    )}
                  {(["signer", "approver", "cc"] as ParticipantRole[]).map((role) => (
                    <Button
                      key={role}
                      size="sm"
                      variant="outline"
                      className="capitalize"
                      onClick={() => {
                        setPickerRole(role);
                        setPickerOpen(true);
                      }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> {role}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {participants.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Add at least one signer or approver.
                  </div>
                ) : (
                  participants.map((participant, index) => (
                    <div
                      key={participant.key}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
                        {participant.entry.avatar_url ? (
                          <img
                            src={participant.entry.avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          (participant.entry.full_name || participant.entry.email)
                            .slice(0, 2)
                            .toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {participant.entry.full_name || participant.entry.email}
                          {participant.entry.username ? ` · @${participant.entry.username}` : ""}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {participant.entry.email}
                        </p>
                      </div>
                      <Select
                        value={participant.role}
                        onValueChange={(value) =>
                          setParticipants((current) =>
                            current.map((item) =>
                              item.key === participant.key
                                ? { ...item, role: value as ParticipantRole }
                                : item,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="signer">Signer</SelectItem>
                          <SelectItem value="approver">Approver</SelectItem>
                          <SelectItem value="cc">CC</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="w-5 text-center text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() =>
                          setParticipants((current) =>
                            current.filter((item) => item.key !== participant.key),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => resetCreate(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create and prepare
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OfficeKonnectAccountPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludeUserIds={participants.map((participant) => participant.entry.user_id)}
        title={`Add ${pickerRole}`}
        onSelect={(entry) => addEntry(entry, pickerRole)}
      />
    </div>
  );
}
