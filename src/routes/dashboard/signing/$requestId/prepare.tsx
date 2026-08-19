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
  FileSignature,
  Loader2,
  PenLine,
  Plus,
  Send,
  Trash2,
  Type,
  UserRoundPlus,
} from "lucide-react";
import { toast } from "sonner";
import { OfficeKonnectAccountPicker } from "@/components/signing/officekonnect-account-picker";
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
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toastError } from "@/lib/errors";
import type { OfficeKonnectDirectoryEntry } from "@/lib/signing-account.functions";
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

type PaletteItem = {
  type: SigningFieldType;
  label: string;
  icon: typeof FileSignature;
  w: number;
  h: number;
};

const palette: PaletteItem[] = [
  { type: "signature", label: "Signature", icon: FileSignature, w: 0.28, h: 0.09 },
  { type: "initial", label: "Initial", icon: Check, w: 0.14, h: 0.08 },
  { type: "text", label: "Text", icon: Type, w: 0.24, h: 0.07 },
  { type: "date", label: "Date signed", icon: CalendarDays, w: 0.2, h: 0.07 },
];

function SigningPrepare() {
  const { requestId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

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
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRole, setPickerRole] = useState<ParticipantRole>("signer");
  const [sendOpen, setSendOpen] = useState(false);
  const [expiryDays, setExpiryDays] = useState("7");

  const { data: request, isLoading: loadingRequest } = useQuery({
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

  const { data: participants = [], isLoading: loadingParticipants } = useQuery({
    queryKey: ["signing-participants", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signing_participants")
        .select("*")
        .eq("request_id", requestId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: fields = [], isLoading: loadingFields } = useQuery({
    queryKey: ["signing-fields", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signing_fields")
        .select("*")
        .eq("request_id", requestId)
        .order("page", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: assets } = useQuery({
    queryKey: ["signing-assets", requestId],
    queryFn: () => assetsFn({ data: { requestId } }),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["signing-request", requestId] }),
      queryClient.invalidateQueries({ queryKey: ["signing-participants", requestId] }),
      queryClient.invalidateQueries({ queryKey: ["signing-fields", requestId] }),
      queryClient.invalidateQueries({ queryKey: ["signing-assets", requestId] }),
      queryClient.invalidateQueries({ queryKey: ["signing-requests"] }),
    ]);
  };

  const selectedField = fields.find((field) => field.id === selectedFieldId) ?? null;
  const activeParticipant =
    participants.find((participant) => participant.id === selectedParticipantId) ??
    participants.find((participant) => participant.role !== "cc") ??
    null;
  const myParticipant = participants.find((participant) => participant.user_id === user?.id) ?? null;
  const excludedUserIds = participants.flatMap((participant) =>
    participant.user_id ? [participant.user_id] : [],
  );
  const validationError = useMemo(
    () => validateSigningDraftConfiguration(participants, fields),
    [participants, fields],
  );
  const canPreSign = Boolean(
    request?.status === "draft" &&
      request?.sender_id === user?.id &&
      myParticipant?.role === "signer" &&
      ["pending", "viewed"].includes(myParticipant.status) &&
      fields.some(
        (field) =>
          field.participant_id === myParticipant.id &&
          field.required &&
          (field.type === "signature" || field.type === "initial"),
      ),
  );

  const addParticipant = useMutation({
    mutationFn: async ({ entry, role }: { entry: OfficeKonnectDirectoryEntry; role: ParticipantRole }) =>
      addParticipantFn({
        data: {
          requestId,
          participant: {
            userId: entry.user_id,
            email: entry.email,
            fullName: entry.full_name,
            role,
            orderIndex: participants.length,
          },
        },
      }),
    onSuccess: async (participant) => {
      setSelectedParticipantId(participant.id);
      toast.success("OfficeKonnect account added");
      await refresh();
    },
    onError: (error) => toastError(error, "Could not add participant"),
  });

  const updateParticipant = useMutation({
    mutationFn: ({ participant, role, orderIndex }: { participant: Participant; role?: ParticipantRole; orderIndex?: number }) =>
      updateParticipantFn({
        data: {
          participantId: participant.id,
          role: role ?? (participant.role as ParticipantRole),
          orderIndex: orderIndex ?? participant.order_index,
          fullName: participant.full_name,
          email: participant.email,
        },
      }),
    onSuccess: refresh,
    onError: (error) => toastError(error, "Could not update participant"),
  });

  const removeParticipant = useMutation({
    mutationFn: (participantId: string) => removeParticipantFn({ data: { participantId } }),
    onSuccess: async () => {
      setSelectedParticipantId("");
      toast.success("Participant removed");
      await refresh();
    },
    onError: (error) => toastError(error, "Could not remove participant"),
  });

  const createField = useMutation({
    mutationFn: (item: PaletteItem) => {
      if (!activeParticipant) throw new Error("Choose a signer or approver first");
      if (activeParticipant.role === "cc") throw new Error("CC recipients cannot own fields");
      return createFieldFn({
        data: {
          requestId,
          field: {
            participantId: activeParticipant.id,
            type: item.type,
            page,
            x: 0.12,
            y: 0.14,
            w: item.w,
            h: item.h,
            required: true,
            label: item.label,
          },
        },
      });
    },
    onSuccess: async (field) => {
      setSelectedFieldId(field.id);
      await refresh();
    },
    onError: (error) => toastError(error, "Could not add field"),
  });

  const updateField = useMutation({
    mutationFn: ({ field, patch }: { field: Field; patch: Partial<Field> }) =>
      updateFieldFn({
        data: {
          fieldId: field.id,
          field: {
            participantId: (patch.participant_id ?? field.participant_id) as string,
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
    onSuccess: refresh,
    onError: (error) => toastError(error, "Could not update field"),
  });

  const removeField = useMutation({
    mutationFn: (fieldId: string) => removeFieldFn({ data: { fieldId } }),
    onSuccess: async () => {
      setSelectedFieldId(null);
      await refresh();
    },
    onError: (error) => toastError(error, "Could not remove field"),
  });

  const saveSettings = useMutation({
    mutationFn: (input: { title: string; message: string; signingOrder: "parallel" | "sequential" }) =>
      updateDraftFn({ data: { requestId, ...input } }),
    onSuccess: async () => {
      toast.success("Request settings saved");
      await refresh();
    },
    onError: (error) => toastError(error, "Could not save request settings"),
  });

  const send = useMutation({
    mutationFn: async () => {
      const days = Math.max(1, Math.min(30, Number(expiryDays) || 7));
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      return sendFn({ data: { requestId, expiresAt } });
    },
    onSuccess: async () => {
      toast.success("Signing request sent to registered OfficeKonnect accounts");
      await refresh();
      setSendOpen(false);
      await navigate({ to: "/dashboard/signing/$requestId", params: { requestId } });
    },
    onError: (error) => toastError(error, "Could not send signing request"),
  });

  const loading = loadingRequest || loadingParticipants || loadingFields;
  if (loading || !request) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (request.status !== "draft") {
    return (
      <div className="mx-auto max-w-xl rounded-xl border p-6 text-center">
        <h1 className="text-xl font-semibold">This request is locked</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Participants and fields cannot be changed after the request is sent.
        </p>
        <Button className="mt-5" asChild>
          <Link to="/dashboard/signing/$requestId" params={{ requestId }}>
            Open request
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-3" asChild>
            <Link to="/dashboard/signing/$requestId" params={{ requestId }}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Signing request
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">Prepare signing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose registered OfficeKonnect accounts, assign their fields, optionally sign your own
            fields first, then send.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPreSign && (
            <Button variant="outline" asChild>
              <Link to="/dashboard/signing/$requestId/pre-sign" params={{ requestId }}>
                <PenLine className="mr-2 h-4 w-4" />
                Sign yourself first
              </Link>
            </Button>
          )}
          <Button onClick={() => setSendOpen(true)} disabled={Boolean(validationError)}>
            <Send className="mr-2 h-4 w-4" />
            Send for signing
          </Button>
        </div>
      </div>

      {validationError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {validationError}
        </div>
      )}

      <RequestSettings request={request} onSave={(input) => saveSettings.mutate(input)} saving={saveSettings.isPending} />

      <div className="grid gap-5 xl:grid-cols-[290px_minmax(0,1fr)_300px]">
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div>
            <h2 className="font-semibold">People</h2>
            <p className="text-xs text-muted-foreground">
              Registered OfficeKonnect accounts only. Search is global, not limited to this workspace.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["signer", "approver", "cc"] as ParticipantRole[]).map((role) => (
              <Button
                key={role}
                variant="outline"
                size="sm"
                className="px-2 text-xs capitalize"
                onClick={() => {
                  setPickerRole(role);
                  setPickerOpen(true);
                }}
              >
                <UserRoundPlus className="mr-1 h-3.5 w-3.5" />
                {role}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            {participants.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                Add the sender and each recipient who must sign, approve or receive a copy.
              </div>
            ) : (
              participants.map((participant, index) => (
                <div
                  key={participant.id}
                  className={`rounded-lg border p-3 ${
                    activeParticipant?.id === participant.id ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setSelectedParticipantId(participant.id)}
                  >
                    <p className="truncate text-sm font-medium">{participantDisplayName(participant)}</p>
                    <p className="truncate text-xs text-muted-foreground">{participant.email}</p>
                  </button>
                  <div className="mt-2 flex items-center gap-1">
                    <Select
                      value={participant.role}
                      onValueChange={(value) =>
                        updateParticipant.mutate({ participant, role: value as ParticipantRole })
                      }
                      disabled={participant.status === "signed"}
                    >
                      <SelectTrigger className="h-8 flex-1 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="signer">Signer</SelectItem>
                        <SelectItem value="approver">Approver</SelectItem>
                        <SelectItem value="cc">CC</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      disabled={index === 0 || participant.status === "signed"}
                      onClick={() =>
                        updateParticipant.mutate({ participant, orderIndex: participant.order_index - 1 })
                      }
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      disabled={index === participants.length - 1 || participant.status === "signed"}
                      onClick={() =>
                        updateParticipant.mutate({ participant, orderIndex: participant.order_index + 1 })
                      }
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      disabled={participant.status === "signed"}
                      onClick={() => removeParticipant.mutate(participant.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {participant.status === "signed" && (
                    <p className="mt-2 text-xs font-medium text-emerald-600">Signed before send</p>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="border-t pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Add field for {activeParticipant ? participantDisplayName(activeParticipant) : "participant"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {palette.map((item) => (
                <Button
                  key={item.type}
                  variant="outline"
                  size="sm"
                  disabled={!activeParticipant || activeParticipant.role === "cc" || activeParticipant.status === "signed"}
                  onClick={() => createField.mutate(item)}
                >
                  <item.icon className="mr-2 h-3.5 w-3.5" />
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="min-w-0 rounded-xl border bg-slate-100 p-3 dark:bg-slate-950">
          <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
              Previous
            </Button>
            <span className="text-xs">Page {page} / {pages}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>
              Next
            </Button>
            <Select value={String(zoom)} onValueChange={(value) => setZoom(Number(value))}>
              <SelectTrigger className="w-24 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[60, 75, 85, 100, 125].map((value) => (
                  <SelectItem key={value} value={String(value)}>{value}%</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {assets?.sourceUrl ? (
            <div className="mx-auto max-w-5xl overflow-auto">
              <SigningPdfFields
                url={assets.sourceUrl}
                page={page}
                zoom={zoom}
                fields={fields}
                editable
                selectedFieldId={selectedFieldId}
                onSelectField={(fieldId) => setSelectedFieldId(fieldId || null)}
                onLoadPages={setPages}
                participantLabel={(participantId) =>
                  participantDisplayName(
                    participants.find((participant) => participant.id === participantId) ?? {
                      full_name: null,
                      email: null,
                      user_id: null,
                    },
                  )
                }
                onFieldGeometryChange={(fieldId, geometry) => {
                  const field = fields.find((candidate) => candidate.id === fieldId);
                  if (field && field.signed_at === null) updateField.mutate({ field, patch: geometry });
                }}
              />
            </div>
          ) : (
            <div className="grid min-h-[520px] place-items-center text-sm text-muted-foreground">
              Could not load the PDF signing copy.
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Field properties</h2>
          {!selectedField ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Select a field on the PDF to edit assignment, label and requirement.
            </p>
          ) : selectedField.signed_at ? (
            <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
              This field is signed and immutable.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>Assigned account</Label>
                <Select
                  value={selectedField.participant_id}
                  onValueChange={(value) => updateField.mutate({ field: selectedField, patch: { participant_id: value } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {participants
                      .filter((participant) => participant.role !== "cc" && participant.status !== "signed")
                      .map((participant) => (
                        <SelectItem key={participant.id} value={participant.id}>
                          {participantDisplayName(participant)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Field type</Label>
                <Select
                  value={selectedField.type}
                  onValueChange={(value) => updateField.mutate({ field: selectedField, patch: { type: value as SigningFieldType } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {palette.map((item) => (
                      <SelectItem key={item.type} value={item.type}>{fieldTypeLabel(item.type)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  defaultValue={selectedField.label ?? ""}
                  onBlur={(event) =>
                    updateField.mutate({ field: selectedField, patch: { label: event.target.value } })
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selectedField.required}
                  onCheckedChange={(value) =>
                    updateField.mutate({ field: selectedField, patch: { required: Boolean(value) } })
                  }
                />
                Required field
              </label>
              <Button
                variant="outline"
                className="w-full text-destructive"
                onClick={() => removeField.mutate(selectedField.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove field
              </Button>
            </div>
          )}
        </section>
      </div>

      <OfficeKonnectAccountPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludeUserIds={excludedUserIds}
        title={`Add ${pickerRole}`}
        onSelect={(entry) => addParticipant.mutate({ entry, role: pickerRole })}
      />

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send signing request</DialogTitle>
            <DialogDescription>
              OfficeKonnect will notify the selected registered accounts. External signing links are
              not created for new requests.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Expires after</Label>
            <Select value={expiryDays} onValueChange={setExpiryDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="3">3 days</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button onClick={() => send.mutate()} disabled={send.isPending || Boolean(validationError)}>
              {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RequestSettings({
  request,
  onSave,
  saving,
}: {
  request: Tables<"signing_requests">;
  onSave: (input: { title: string; message: string; signingOrder: "parallel" | "sequential" }) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(request.title);
  const [message, setMessage] = useState(request.message ?? "");
  const [signingOrder, setSigningOrder] = useState<"parallel" | "sequential">(
    request.signing_order === "sequential" ? "sequential" : "parallel",
  );

  return (
    <section className="grid gap-4 rounded-xl border bg-card p-4 lg:grid-cols-[1fr_1fr_180px_auto] lg:items-end">
      <div className="space-y-2">
        <Label>Request title</Label>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Message</Label>
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={1}
          className="min-h-10"
        />
      </div>
      <div className="space-y-2">
        <Label>Signing order</Label>
        <Select value={signingOrder} onValueChange={(value) => setSigningOrder(value as "parallel" | "sequential")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="parallel">Parallel</SelectItem>
            <SelectItem value="sequential">Sequential</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={() => onSave({ title, message, signingOrder })} disabled={saving || !title.trim()}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        Save settings
      </Button>
    </section>
  );
}