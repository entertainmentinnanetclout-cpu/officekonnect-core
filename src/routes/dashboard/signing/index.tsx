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
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
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
import { createSigningDraft } from "@/lib/signing.functions";
import {
  participantDisplayName,
  signingStatusLabel,
  type ParticipantRole,
  type SigningParticipantInput,
} from "@/lib/signing";

export const Route = createFileRoute("/dashboard/signing/")({ component: SigningDashboard });

type RequestRow = Tables<"signing_requests">;
type ParticipantRow = Tables<"signing_participants">;

type DraftParticipant = SigningParticipantInput & { key: string };

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

function blankParticipant(index: number): DraftParticipant {
  return {
    key: `participant-${Date.now()}-${index}`,
    role: "signer",
    orderIndex: index,
    userId: null,
    email: "",
    fullName: "",
  };
}

function SigningDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createDraftFn = useServerFn(createSigningDraft);
  const [status, setStatus] = useState<(typeof statusTabs)[number]>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [documentId, setDocumentId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [order, setOrder] = useState<"parallel" | "sequential">("parallel");
  const [participants, setParticipants] = useState<DraftParticipant[]>([blankParticipant(0)]);

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
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("default_workspace_id")
        .eq("id", auth.user.id)
        .single();
      if (profileError) throw profileError;
      if (!profile.default_workspace_id) throw new Error("No active workspace selected");
      return { userId: auth.user.id, workspaceId: profile.default_workspace_id };
    },
  });

  const { data: requests, isLoading } = useQuery({
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

  const requestIds = (requests ?? []).map((request) => request.id);
  const { data: allParticipants } = useQuery({
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

  const { data: memberDirectory } = useQuery({
    queryKey: ["signing-member-directory", context?.workspaceId, createOpen],
    enabled: Boolean(context?.workspaceId && createOpen),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_workspace_member_directory", {
        p_workspace_id: context!.workspaceId,
      });
      if (error) throw error;
      return data;
    },
  });

  const { data: pdfDocuments } = useQuery({
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
    return (requests ?? []).filter((request) => {
      if (status !== "all" && request.status !== status) return false;
      if (!needle) return true;
      return (
        request.title.toLowerCase().includes(needle) ||
        request.message?.toLowerCase().includes(needle)
      );
    });
  }, [requests, query, status]);

  const counts = useMemo(() => {
    const rows = requests ?? [];
    return {
      drafts: rows.filter((row) => row.status === "draft").length,
      active: rows.filter((row) => row.status === "sent" || row.status === "in_progress").length,
      complete: rows.filter((row) => row.status === "completed").length,
      waitingOnMe: (allParticipants ?? []).filter(
        (participant) =>
          participant.user_id === context?.userId &&
          ["pending", "viewed"].includes(participant.status),
      ).length,
    };
  }, [requests, allParticipants, context?.userId]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const normalized = participants.map((participant, index) => ({
        ...participant,
        orderIndex: index,
      }));
      if (!documentId) throw new Error("Choose a PDF document");
      if (!title.trim()) throw new Error("Enter a request title");
      if (normalized.some((participant) => !participant.userId && !participant.email?.trim()))
        throw new Error("Every participant needs an account or email address");
      return createDraftFn({
        data: { documentId, title, message, signingOrder: order, participants: normalized },
      });
    },
    onSuccess: async (result) => {
      toast.success("Signing draft created");
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["signing-requests"] });
      await navigate({
        to: "/dashboard/signing/$requestId/prepare",
        params: { requestId: result.request.id },
      });
    },
    onError: (error) => toastError(error, "Could not create signing draft"),
  });

  const setParticipantMember = (key: string, value: string) => {
    setParticipants((current) =>
      current.map((participant) => {
        if (participant.key !== key) return participant;
        if (value === "external") return { ...participant, userId: null, email: "", fullName: "" };
        const member = memberDirectory?.find((candidate) => candidate.user_id === value);
        return {
          ...participant,
          userId: value,
          email: member?.email ?? "",
          fullName: member?.full_name ?? "",
        };
      }),
    );
  };

  const addParticipant = () =>
    setParticipants((current) => [...current, blankParticipant(current.length)]);
  const removeParticipant = (key: string) =>
    setParticipants((current) =>
      current.length === 1 ? current : current.filter((participant) => participant.key !== key),
    );

  const participantsFor = (requestId: string) =>
    (allParticipants ?? []).filter((participant) => participant.request_id === requestId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">E-signatures</h1>
          <p className="text-sm text-muted-foreground">
            Prepare, send, sign, finalize and audit legally traceable PDF signature requests.
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
        <div className="rounded-xl border border-dashed p-12 text-center">
          <FileSignature className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No signature requests match this view</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a request from a PDF signing copy or uploaded PDF.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((request: RequestRow) => {
            const requestParticipants = participantsFor(request.id);
            const myParticipant = requestParticipants.find(
              (participant) => participant.user_id === context?.userId,
            );
            return (
              <Link
                key={request.id}
                to="/dashboard/signing/$requestId"
                params={{ requestId: request.id }}
                className="block rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold">{request.title}</h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(request.status)}`}
                      >
                        {signingStatusLabel(request.status)}
                      </span>
                      {myParticipant && (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                          Assigned to you
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                      {request.message ||
                        `${requestParticipants.length} participant${requestParticipants.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-5 text-xs text-muted-foreground">
                    <span>{requestParticipants.length} participants</span>
                    <span>
                      {formatDistanceToNow(new Date(request.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                {requestParticipants.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {requestParticipants.slice(0, 5).map((participant: ParticipantRow) => (
                      <span
                        key={participant.id}
                        className="rounded-md bg-muted px-2 py-1 text-[11px]"
                      >
                        {participantDisplayName(participant)} · {participant.role}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New e-signature request</DialogTitle>
            <DialogDescription>
              Choose a PDF, configure participants, then place fields in the preparation workspace
              before sending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>PDF document</Label>
                <Select
                  value={documentId}
                  onValueChange={(value) => {
                    setDocumentId(value);
                    const doc = pdfDocuments?.find((item) => item.id === value);
                    if (doc && !title) setTitle(doc.title);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a PDF" />
                  </SelectTrigger>
                  <SelectContent>
                    {pdfDocuments?.map((document) => (
                      <SelectItem key={document.id} value={document.id}>
                        {document.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    <SelectItem value="parallel">Parallel — everyone can act now</SelectItem>
                    <SelectItem value="sequential">Sequential — one turn at a time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Request title</Label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Agreement for signature"
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Optional instructions for participants"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Participants</Label>
                <Button type="button" size="sm" variant="outline" onClick={addParticipant}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add
                </Button>
              </div>
              {participants.map((participant, index) => (
                <div
                  key={participant.key}
                  className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1.2fr_.8fr_1fr_auto]"
                >
                  <Select
                    value={participant.userId ?? "external"}
                    onValueChange={(value) => setParticipantMember(participant.key, value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="external">External email</SelectItem>
                      {memberDirectory?.map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.full_name || member.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={participant.role}
                    onValueChange={(value) =>
                      setParticipants((current) =>
                        current.map((row) =>
                          row.key === participant.key
                            ? { ...row, role: value as ParticipantRole }
                            : row,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="signer">Signer</SelectItem>
                      <SelectItem value="approver">Approver</SelectItem>
                      <SelectItem value="cc">CC</SelectItem>
                    </SelectContent>
                  </Select>
                  {participant.userId ? (
                    <div className="flex items-center rounded-md border px-3 text-sm text-muted-foreground">
                      {participant.email}
                    </div>
                  ) : (
                    <Input
                      placeholder="name@example.com"
                      value={participant.email ?? ""}
                      onChange={(event) =>
                        setParticipants((current) =>
                          current.map((row) =>
                            row.key === participant.key
                              ? { ...row, email: event.target.value }
                              : row,
                          ),
                        )
                      }
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={participants.length === 1}
                    onClick={() => removeParticipant(participant.key)}
                    aria-label={`Remove participant ${index + 1}`}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
              & prepare
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
