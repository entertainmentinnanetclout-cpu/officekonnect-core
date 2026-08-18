import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  Check,
  Clipboard,
  FileSignature,
  Loader2,
  Minus,
  Plus,
  Send,
  Type,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SigningPdfFields } from "@/components/signing/signing-pdf-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  addSigningParticipant,
  createSigningField,
  getSigningRequestAssetLinks,
  removeSigningField,
  removeSigningParticipant,
  sendSigningRequest,
  updateSigningDraft,
  updateSigningField,
  updateSigningParticipant,
} from "@/lib/signing.functions";
import {
  fieldTypeLabel,
  participantDisplayName,
  validateSigningDraftConfiguration,
  type ParticipantRole,
  type SigningFieldType,
} from "@/lib/signing";

export const Route = createFileRoute("/dashboard/signing/$requestId/prepare")({
  component: SigningPrepare,
});

type Participant = Tables<"signing_participants">;
type Field = Tables<"signing_fields">;

const palette: Array<{
  type: SigningFieldType;
  label: string;
  icon: typeof FileSignature;
  w: number;
  h: number;
}> = [
  { type: "signature", label: "Signature", icon: FileSignature, w: 0.28, h: 0.09 },
  { type: "initial", label: "Initial", icon: Check, w: 0.14, h: 0.08 },
  { type: "text", label: "Text", icon: Type, w: 0.24, h: 0.07 },
  { type: "date", label: "Date signed", icon: CalendarDays, w: 0.2, h: 0.07 },
];

function SigningPrepare() {
  const { requestId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addParticipantFn = useServerFn(addSigningParticipant);
  const updateParticipantFn = useServerFn(updateSigningParticipant);
  const removeParticipantFn = useServerFn(removeSigningParticipant);
  const createFieldFn = useServerFn(createSigningField);
  const updateFieldFn = useServerFn(updateSigningField);
  const removeFieldFn = useServerFn(removeSigningField);
  const updateDraftFn = useServerFn(updateSigningDraft);
  const sendFn = useServerFn(sendSigningRequest);
  const assetsFn = useServerFn(getSigningRequestAssetLinks);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(85);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
  const [participantOpen, setParticipantOpen] = useState(false);
  const [participantMode, setParticipantMode] = useState("external");
  const [participantEmail, setParticipantEmail] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [participantRole, setParticipantRole] = useState<ParticipantRole>("signer");
  const [sendOpen, setSendOpen] = useState(false);
  const [expiryDays, setExpiryDays] = useState("7");
  const [invitations, setInvitations] = useState<
    Array<{ participantId: string; email?: string; token: string; expiresAt?: string }>
  >([]);

  const { data: request, isLoading } = useQuery({
    queryKey: ["signing-request", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signing_requests")
        .select("*")
        .eq("id", requestId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const { data: participants } = useQuery({
    queryKey: ["signing-participants", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signing_participants")
        .select("*")
        .eq("request_id", requestId)
        .order("order_index");
      if (error) throw error;
      return data;
    },
  });
  const { data: fields } = useQuery({
    queryKey: ["signing-fields", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signing_fields")
        .select("*")
        .eq("request_id", requestId)
        .order("page");
      if (error) throw error;
      return data;
    },
  });
  const { data: assets } = useQuery({
    queryKey: ["signing-assets", requestId],
    queryFn: () => assetsFn({ data: { requestId } }),
  });
  const { data: directory } = useQuery({
    queryKey: ["signing-prepare-directory"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Authentication required");
      const { data: profile } = await supabase
        .from("profiles")
        .select("default_workspace_id")
        .eq("id", auth.user.id)
        .single();
      if (!profile?.default_workspace_id) throw new Error("No active workspace selected");
      const { data, error } = await supabase.rpc("list_workspace_member_directory", {
        p_workspace_id: profile.default_workspace_id,
      });
      if (error) throw error;
      return data;
    },
  });

  const selectedField = (fields ?? []).find((field) => field.id === selectedFieldId) ?? null;
  const actionParticipants = (participants ?? []).filter(
    (participant) => participant.role !== "cc",
  );
  const activeParticipantId = selectedParticipantId || actionParticipants[0]?.id || "";
  const configurationError = validateSigningDraftConfiguration(participants ?? [], fields ?? []);
  const locked = request?.status !== "draft" || Boolean(request?.locked_at);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["signing-request", requestId] }),
      queryClient.invalidateQueries({ queryKey: ["signing-participants", requestId] }),
      queryClient.invalidateQueries({ queryKey: ["signing-fields", requestId] }),
    ]);
  };

  const addFieldMutation = useMutation({
    mutationFn: async (definition: (typeof palette)[number]) => {
      if (!activeParticipantId) throw new Error("Add or select a signer/approver first");
      return createFieldFn({
        data: {
          requestId,
          field: {
            participantId: activeParticipantId,
            type: definition.type,
            page,
            x: 0.1 + ((fields?.length ?? 0) % 4) * 0.03,
            y: 0.12 + ((fields?.length ?? 0) % 7) * 0.08,
            w: definition.w,
            h: definition.h,
            required: definition.type !== "text" ? true : false,
            label: definition.label,
          },
        },
      });
    },
    onSuccess: async (field) => {
      setSelectedFieldId(field.id);
      await invalidate();
    },
    onError: (error) => toastError(error, "Could not add field"),
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({ field, patch }: { field: Field; patch: Partial<Field> }) =>
      updateFieldFn({
        data: {
          fieldId: field.id,
          field: {
            participantId: patch.participant_id ?? field.participant_id,
            type: (patch.type ?? field.type) as SigningFieldType,
            page: patch.page ?? field.page,
            x: patch.x ?? field.x,
            y: patch.y ?? field.y,
            w: patch.w ?? field.w,
            h: patch.h ?? field.h,
            rotation: patch.rotation ?? field.rotation,
            required: patch.required ?? field.required,
            label: patch.label ?? field.label,
            validation: (patch.validation ?? field.validation) as Record<string, unknown>,
          },
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["signing-fields", requestId] }),
    onError: (error) => toastError(error, "Could not update field"),
  });

  const removeFieldMutation = useMutation({
    mutationFn: (fieldId: string) => removeFieldFn({ data: { fieldId } }),
    onSuccess: async () => {
      setSelectedFieldId(null);
      await invalidate();
    },
    onError: (error) => toastError(error, "Could not remove field"),
  });

  const addParticipantMutation = useMutation({
    mutationFn: () => {
      const member = directory?.find((item) => item.user_id === participantMode);
      return addParticipantFn({
        data: {
          requestId,
          participant: {
            userId: member?.user_id ?? null,
            email: member?.email ?? participantEmail,
            fullName: member?.full_name ?? participantName,
            role: participantRole,
            orderIndex: participants?.length ?? 0,
          },
        },
      });
    },
    onSuccess: async (participant) => {
      setParticipantOpen(false);
      setSelectedParticipantId(participant.id);
      setParticipantEmail("");
      setParticipantName("");
      await invalidate();
    },
    onError: (error) => toastError(error, "Could not add participant"),
  });

  const moveParticipant = async (participant: Participant, direction: -1 | 1) => {
    const ordered = [...(participants ?? [])].sort((a, b) => a.order_index - b.order_index);
    const index = ordered.findIndex((item) => item.id === participant.id);
    const swap = ordered[index + direction];
    if (!swap) return;
    try {
      await updateParticipantFn({
        data: {
          participantId: participant.id,
          role: participant.role,
          orderIndex: swap.order_index,
          fullName: participant.full_name,
          email: participant.email,
        },
      });
      await updateParticipantFn({
        data: {
          participantId: swap.id,
          role: swap.role,
          orderIndex: participant.order_index,
          fullName: swap.full_name,
          email: swap.email,
        },
      });
      await invalidate();
    } catch (error) {
      toastError(error, "Could not reorder participants");
    }
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (configurationError) throw new Error(configurationError);
      const days = Math.max(1, Math.min(30, Number(expiryDays) || 7));
      const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
      return sendFn({ data: { requestId, expiresAt } });
    },
    onSuccess: async (result) => {
      const links = Array.isArray(result?.invitations) ? result.invitations : [];
      setInvitations(links);
      await invalidate();
      if (links.length === 0) {
        toast.success("Signature request sent");
        setSendOpen(false);
        await navigate({ to: "/dashboard/signing/$requestId", params: { requestId } });
      }
    },
    onError: (error) => toastError(error, "Could not send signature request"),
  });

  const copyInvite = async (token: string) => {
    const link = `${window.location.origin}/sign/${token}`;
    await navigator.clipboard.writeText(link);
    toast.success("Secure invitation link copied");
  };

  if (isLoading || !request)
    return (
      <div className="flex h-72 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (locked)
    return (
      <div className="mx-auto max-w-xl rounded-xl border p-8 text-center">
        <FileSignature className="mx-auto h-8 w-8" />
        <h1 className="mt-3 text-xl font-semibold">This request is already locked</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sent signing configurations are immutable. Review the active request instead.
        </p>
        <Button className="mt-5" asChild>
          <Link to="/dashboard/signing/$requestId" params={{ requestId }}>
            Open request
          </Link>
        </Button>
      </div>
    );

  return (
    <div className="-m-4 flex min-h-[calc(100dvh-8rem)] flex-col sm:-m-6 lg:-m-8">
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/signing">
            <ArrowLeft className="mr-2 h-4 w-4" />
            E-signatures
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{request.title}</p>
          <p className="text-xs text-muted-foreground">
            Draft preparation · fields use normalized PDF coordinates
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setZoom((value) => Math.max(50, value - 10))}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="text-xs">{zoom}%</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setZoom((value) => Math.min(160, value + 10))}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button onClick={() => setSendOpen(true)}>
          <Send className="mr-2 h-4 w-4" />
          Review & send
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="border-r bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Participants</h2>
            <Button size="icon" variant="ghost" onClick={() => setParticipantOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {(participants ?? []).map((participant, index) => (
              <button
                key={participant.id}
                type="button"
                onClick={() =>
                  participant.role !== "cc" && setSelectedParticipantId(participant.id)
                }
                className={`w-full rounded-lg border p-2 text-left text-xs ${activeParticipantId === participant.id ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "bg-background"}`}
              >
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {participantDisplayName(participant)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      void moveParticipant(participant, -1);
                    }}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === (participants?.length ?? 0) - 1}
                    onClick={(event) => {
                      event.stopPropagation();
                      void moveParticipant(participant, 1);
                    }}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (confirm("Remove this participant and their fields?"))
                        removeParticipantFn({ data: { participantId: participant.id } })
                          .then(invalidate)
                          .catch((error) => toastError(error));
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="mt-1 flex gap-2 text-muted-foreground">
                  <span>{participant.role}</span>
                  {request.signing_order === "sequential" && participant.role !== "cc" && (
                    <span>Turn {participant.order_index + 1}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
          <h2 className="mt-6 text-sm font-semibold">Fields</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Select a signer or approver, then add fields to the current page.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {palette.map((definition) => {
              const Icon = definition.icon;
              return (
                <Button
                  key={definition.type}
                  variant="outline"
                  className="h-20 flex-col gap-1"
                  disabled={!activeParticipantId || addFieldMutation.isPending}
                  onClick={() => addFieldMutation.mutate(definition)}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs">{definition.label}</span>
                </Button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 overflow-auto bg-slate-100 p-4 dark:bg-slate-900">
          <div className="mx-auto max-w-5xl">
            <div className="mb-3 flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
            {assets?.sourceUrl ? (
              <SigningPdfFields
                url={assets.sourceUrl}
                page={page}
                zoom={zoom}
                fields={fields ?? []}
                selectedFieldId={selectedFieldId}
                editable
                onSelectField={(id) => setSelectedFieldId(id || null)}
                onFieldGeometryChange={(fieldId, geometry) => {
                  const field = fields?.find((item) => item.id === fieldId);
                  if (field) updateFieldMutation.mutate({ field, patch: geometry });
                }}
                participantLabel={(participantId) =>
                  participantDisplayName(
                    (participants ?? []).find((item) => item.id === participantId) ??
                      ({ full_name: null, email: null, user_id: null } as Participant),
                  )
                }
                onLoadPages={setPages}
              />
            ) : (
              <div className="flex h-96 items-center justify-center rounded-xl bg-background text-sm text-muted-foreground">
                Preparing PDF preview…
              </div>
            )}
          </div>
        </main>

        <aside className="border-l bg-background p-4">
          <h2 className="text-sm font-semibold">Field properties</h2>
          {selectedField ? (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={selectedField.type}
                  onValueChange={(value) =>
                    updateFieldMutation.mutate({
                      field: selectedField,
                      patch: { type: value as SigningFieldType },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {palette.map((item) => (
                      <SelectItem key={item.type} value={item.type}>
                        {fieldTypeLabel(item.type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assigned participant</Label>
                <Select
                  value={selectedField.participant_id}
                  onValueChange={(value) =>
                    updateFieldMutation.mutate({
                      field: selectedField,
                      patch: { participant_id: value },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {actionParticipants.map((participant) => (
                      <SelectItem key={participant.id} value={participant.id}>
                        {participantDisplayName(participant)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  key={`${selectedField.id}-${selectedField.label ?? ""}`}
                  defaultValue={selectedField.label ?? ""}
                  onBlur={(event) =>
                    updateFieldMutation.mutate({
                      field: selectedField,
                      patch: { label: event.target.value },
                    })
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selectedField.required}
                  onCheckedChange={(value) =>
                    updateFieldMutation.mutate({
                      field: selectedField,
                      patch: { required: Boolean(value) },
                    })
                  }
                />
                Required
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>X {(selectedField.x * 100).toFixed(1)}%</span>
                <span>Y {(selectedField.y * 100).toFixed(1)}%</span>
                <span>W {(selectedField.w * 100).toFixed(1)}%</span>
                <span>H {(selectedField.h * 100).toFixed(1)}%</span>
              </div>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => removeFieldMutation.mutate(selectedField.id)}
              >
                Remove field
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Select a field on the PDF to edit its assignment, type, required state and geometry.
            </p>
          )}
          <div className="mt-8 border-t pt-4">
            <h3 className="text-sm font-semibold">Request settings</h3>
            <div className="mt-3 space-y-3">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input
                  defaultValue={request.title}
                  onBlur={(event) =>
                    updateDraftFn({
                      data: {
                        requestId,
                        title: event.target.value,
                        message: request.message,
                        signingOrder: request.signing_order as "parallel" | "sequential",
                      },
                    })
                      .then(invalidate)
                      .catch((error) => toastError(error))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Signing order</Label>
                <Select
                  value={request.signing_order}
                  onValueChange={(value) =>
                    updateDraftFn({
                      data: {
                        requestId,
                        title: request.title,
                        message: request.message,
                        signingOrder: value as "parallel" | "sequential",
                      },
                    })
                      .then(invalidate)
                      .catch((error) => toastError(error))
                  }
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
          </div>
        </aside>
      </div>

      <Dialog open={participantOpen} onOpenChange={setParticipantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add participant</DialogTitle>
            <DialogDescription>
              Use a workspace identity or invite an external email address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Identity</Label>
              <Select value={participantMode} onValueChange={setParticipantMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="external">External email</SelectItem>
                  {directory?.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.full_name || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {participantMode === "external" && (
              <>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={participantName}
                    onChange={(event) => setParticipantName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={participantEmail}
                    onChange={(event) => setParticipantEmail(event.target.value)}
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={participantRole}
                onValueChange={(value) => setParticipantRole(value as ParticipantRole)}
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParticipantOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addParticipantMutation.mutate()}
              disabled={addParticipantMutation.isPending}
            >
              Add participant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Review & send</DialogTitle>
            <DialogDescription>
              Sending locks the exact participant/field configuration and creates an immutable
              source PDF version.
            </DialogDescription>
          </DialogHeader>
          {invitations.length === 0 ? (
            <div className="space-y-4">
              <div
                className={`rounded-lg border p-3 text-sm ${configurationError ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}
              >
                {configurationError ||
                  `Ready: ${participants?.length ?? 0} participants and ${fields?.length ?? 0} fields.`}
              </div>
              <div className="space-y-2">
                <Label>Expires in days</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={expiryDays}
                  onChange={(event) => setExpiryDays(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Allowed range: 15 minutes to 30 days. OfficeKonnect defaults to seven days.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSendOpen(false)}>
                  Back
                </Button>
                <Button
                  disabled={Boolean(configurationError) || sendMutation.isPending}
                  onClick={() => sendMutation.mutate()}
                >
                  {sendMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send
                  request
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                Request sent and configuration locked. External invitation tokens are shown once for
                secure delivery.
              </div>
              {invitations.map((invite) => (
                <div
                  key={invite.participantId}
                  className="flex items-center gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {invite.email || "External participant"}
                    </p>
                    <p className="text-xs text-muted-foreground">Secure invitation link</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void copyInvite(invite.token)}>
                    <Clipboard className="mr-2 h-3 w-3" />
                    Copy
                  </Button>
                </div>
              ))}
              <Button
                className="w-full"
                onClick={() =>
                  navigate({ to: "/dashboard/signing/$requestId", params: { requestId } })
                }
              >
                Open active request
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
