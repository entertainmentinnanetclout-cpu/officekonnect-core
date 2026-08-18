import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import SignatureCanvas from "react-signature-canvas";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, CheckCircle2, Clipboard, Download, FileSignature, Loader2, PenLine, RefreshCw, Send, ShieldCheck, Type, XCircle } from "lucide-react";
import { toast } from "sonner";
import { SigningPdfFields } from "@/components/signing/signing-pdf-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toastError } from "@/lib/errors";
import {
  cancelSigningRequest,
  completeSigningParticipant,
  declineSigningParticipant,
  finalizeSigningRequest,
  getSigningRequestAssetLinks,
  markSigningParticipantViewed,
  rotateSigningInvitation,
} from "@/lib/signing.functions";
import {
  isSigningParticipantEligible,
  participantDisplayName,
  SIGNING_CONSENT_VERSION,
  signingStatusLabel,
  type SigningFieldValue,
} from "@/lib/signing";

export const Route = createFileRoute("/dashboard/signing/$requestId/")({ component: SigningRequestWorkspace });

type Participant = Tables<"signing_participants">;
type Field = Tables<"signing_fields">;
type SavedSignature = Tables<"user_signatures">;

function requestTone(status: string) {
  if (status === "completed") return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200";
  if (status === "declined" || status === "cancelled") return "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200";
  return "border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200";
}

function typedSignatureDataUrl(name: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 260;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Signature canvas is unavailable");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = "italic 96px 'Brush Script MT', cursive";
  context.fillStyle = "black";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(name, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL("image/png");
}

function SigningRequestWorkspace() {
  const { requestId } = Route.useParams();
  const queryClient = useQueryClient();
  const assetsFn = useServerFn(getSigningRequestAssetLinks);
  const viewedFn = useServerFn(markSigningParticipantViewed);
  const completeFn = useServerFn(completeSigningParticipant);
  const declineFn = useServerFn(declineSigningParticipant);
  const cancelFn = useServerFn(cancelSigningRequest);
  const finalizeFn = useServerFn(finalizeSigningRequest);
  const rotateFn = useServerFn(rotateSigningInvitation);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(85);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [signatureByField, setSignatureByField] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signatureTargetField, setSignatureTargetField] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<"saved" | "draw" | "type">("saved");
  const [typedName, setTypedName] = useState("");
  const [selectedSavedSignature, setSelectedSavedSignature] = useState("");
  const signatureCanvas = useRef<SignatureCanvas>(null);
  const viewedParticipantRef = useRef<string | null>(null);

  const { data: context } = useQuery({
    queryKey: ["signing-request-context", requestId],
    queryFn: async () => {
      const { data: auth, error } = await supabase.auth.getUser();
      if (error || !auth.user) throw error ?? new Error("Authentication required");
      const { data: profile, error: profileError } = await supabase.from("profiles").select("default_workspace_id,full_name,email").eq("id", auth.user.id).single();
      if (profileError) throw profileError;
      return { user: auth.user, workspaceId: profile.default_workspace_id, profile };
    },
  });

  const { data: request, isLoading } = useQuery({
    queryKey: ["signing-request", requestId],
    queryFn: async () => {
      const { data, error } = await supabase.from("signing_requests").select("*").eq("id", requestId).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: participants } = useQuery({
    queryKey: ["signing-participants", requestId],
    queryFn: async () => {
      const { data, error } = await supabase.from("signing_participants").select("*").eq("request_id", requestId).order("order_index");
      if (error) throw error;
      return data;
    },
  });
  const { data: fields } = useQuery({
    queryKey: ["signing-fields", requestId],
    queryFn: async () => {
      const { data, error } = await supabase.from("signing_fields").select("*").eq("request_id", requestId).order("page");
      if (error) throw error;
      return data;
    },
  });
  const { data: events } = useQuery({
    queryKey: ["signing-events", requestId],
    queryFn: async () => {
      const { data, error } = await supabase.from("signing_events").select("*").eq("request_id", requestId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const { data: assets } = useQuery({
    queryKey: ["signing-assets", requestId, request?.revision],
    enabled: Boolean(request),
    queryFn: () => assetsFn({ data: { requestId } }),
  });
  const { data: savedSignatures } = useQuery({
    queryKey: ["signatures", context?.workspaceId, context?.user.id],
    enabled: Boolean(context?.workspaceId && context?.user.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("user_signatures").select("*").eq("workspace_id", context!.workspaceId!).eq("created_by", context!.user.id).order("is_default", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const myParticipant = useMemo(() => (participants ?? []).find((participant) => participant.user_id === context?.user.id) ?? null, [participants, context?.user.id]);
  const myFields = useMemo(() => (fields ?? []).filter((field) => field.participant_id === myParticipant?.id), [fields, myParticipant?.id]);
  const eligible = Boolean(request && myParticipant && isSigningParticipantEligible(request, myParticipant));
  const isSender = request?.sender_id === context?.user.id;

  useEffect(() => {
    if (!myParticipant || !eligible || viewedParticipantRef.current === myParticipant.id) return;
    viewedParticipantRef.current = myParticipant.id;
    void viewedFn({ data: { participantId: myParticipant.id } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["signing-participants", requestId] }))
      .catch(() => undefined);
  }, [myParticipant, eligible, viewedFn, queryClient, requestId]);

  useEffect(() => {
    if (!savedSignatures?.length || selectedSavedSignature) return;
    setSelectedSavedSignature(savedSignatures.find((signature) => signature.is_default)?.id ?? savedSignatures[0].id);
  }, [savedSignatures, selectedSavedSignature]);

  const saveQuickSignature = async (dataUrl: string): Promise<SavedSignature> => {
    if (!context?.workspaceId || !context.user) throw new Error("Workspace identity is unavailable");
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${context.workspaceId}/${context.user.id}/signing-${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage.from("signatures").upload(path, blob, { contentType: "image/png", upsert: false });
    if (uploadError) throw uploadError;
    const { data: signed } = await supabase.storage.from("signatures").createSignedUrl(path, 60 * 60 * 24 * 365);
    const { data, error } = await supabase.from("user_signatures").insert({
      workspace_id: context.workspaceId,
      created_by: context.user.id,
      name: `Signing signature ${format(new Date(), "yyyy-MM-dd")}`,
      signature_image_url: signed?.signedUrl ?? "",
      storage_path: path,
      is_default: (savedSignatures?.length ?? 0) === 0,
    }).select("*").single();
    if (error) throw error;
    return data;
  };

  const signatureMutation = useMutation({
    mutationFn: async () => {
      if (!signatureTargetField) throw new Error("No signature field selected");
      let signatureId = selectedSavedSignature;
      if (signatureMode === "draw") {
        if (!signatureCanvas.current || signatureCanvas.current.isEmpty()) throw new Error("Draw your signature first");
        signatureId = (await saveQuickSignature(signatureCanvas.current.getCanvas().toDataURL("image/png"))).id;
      } else if (signatureMode === "type") {
        if (!typedName.trim()) throw new Error("Type your signing name first");
        signatureId = (await saveQuickSignature(typedSignatureDataUrl(typedName.trim()))).id;
      }
      if (!signatureId) throw new Error("Choose or create a signature");
      return { fieldId: signatureTargetField, signatureId };
    },
    onSuccess: async ({ fieldId, signatureId }) => {
      setSignatureByField((current) => ({ ...current, [fieldId]: signatureId }));
      setSignatureOpen(false);
      setSignatureTargetField(null);
      await queryClient.invalidateQueries({ queryKey: ["signatures"] });
    },
    onError: (error) => toastError(error, "Could not prepare signature"),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!request || !myParticipant) throw new Error("No active signing assignment found");
      if (!eligible) throw new Error("This signing turn is not currently eligible");
      if (!consent) throw new Error("You must consent to electronic signing before completing");
      const values: SigningFieldValue[] = myFields.map((field) => {
        if (field.type === "signature" || field.type === "initial") {
          const signatureId = signatureByField[field.id];
          if (field.required && !signatureId) throw new Error(`${field.label || field.type} is required`);
          return { fieldId: field.id, signatureId: signatureId || undefined };
        }
        const value = fieldValues[field.id]?.trim() || "";
        if (field.required && !value) throw new Error(`${field.label || field.type} is required`);
        return { fieldId: field.id, value };
      });
      return completeFn({ data: { participantId: myParticipant.id, fieldValues: values, consentTextVersion: SIGNING_CONSENT_VERSION } });
    },
    onSuccess: async () => {
      toast.success("Signing action completed");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["signing-request", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["signing-participants", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["signing-fields", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["signing-events", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["signing-assets", requestId] }),
      ]);
    },
    onError: (error) => toastError(error, "Could not complete signing"),
  });

  const declineMutation = useMutation({
    mutationFn: () => declineFn({ data: { participantId: myParticipant!.id, reason: declineReason } }),
    onSuccess: async () => { setDeclineOpen(false); toast.success("Signing request declined"); await queryClient.invalidateQueries({ queryKey: ["signing-request", requestId] }); await queryClient.invalidateQueries({ queryKey: ["signing-participants", requestId] }); },
    onError: (error) => toastError(error, "Could not decline request"),
  });
  const cancelMutation = useMutation({
    mutationFn: () => cancelFn({ data: { requestId, reason: cancelReason } }),
    onSuccess: async () => { setCancelOpen(false); toast.success("Signing request cancelled"); await queryClient.invalidateQueries({ queryKey: ["signing-request", requestId] }); },
    onError: (error) => toastError(error, "Could not cancel request"),
  });
  const finalizeMutation = useMutation({
    mutationFn: () => finalizeFn({ data: { requestId } }),
    onSuccess: async () => { toast.success("Finalization completed"); await queryClient.invalidateQueries({ queryKey: ["signing-request", requestId] }); await queryClient.invalidateQueries({ queryKey: ["signing-assets", requestId] }); },
    onError: (error) => toastError(error, "Could not finalize signed PDF"),
  });

  const rotateInvite = async (participant: Participant) => {
    try {
      const result = await rotateFn({ data: { participantId: participant.id, expiresAt: request?.expires_at } });
      const token = result?.invitation?.token;
      if (!token) throw new Error("Invitation token was not returned");
      await navigator.clipboard.writeText(`${window.location.origin}/sign/${token}`);
      toast.success("A rotated secure invitation link was copied");
    } catch (error) { toastError(error, "Could not rotate invitation"); }
  };

  if (isLoading || !request) return <div className="flex h-72 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div><Button variant="ghost" size="sm" className="mb-2 -ml-3" asChild><Link to="/dashboard/signing"><ArrowLeft className="mr-2 h-4 w-4" />E-signatures</Link></Button><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">{request.title}</h1><span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${requestTone(request.status)}`}>{signingStatusLabel(request.status)}</span></div><p className="mt-1 text-sm text-muted-foreground">{request.message || "OfficeKonnect secure e-signature request"}</p></div>
        <div className="flex flex-wrap gap-2">{request.status === "draft" && isSender && <Button asChild><Link to="/dashboard/signing/$requestId/prepare" params={{ requestId }}>Prepare fields</Link></Button>}{isSender && ["sent", "in_progress"].includes(request.status) && <Button variant="outline" onClick={() => setCancelOpen(true)}>Cancel request</Button>}{isSender && ["queued", "failed"].includes(request.finalization_status) && <Button onClick={() => finalizeMutation.mutate()} disabled={finalizeMutation.isPending}><RefreshCw className="mr-2 h-4 w-4" />Finalize</Button>}{assets?.finalUrl && <Button variant="outline" asChild><a href={assets.finalUrl} target="_blank" rel="noreferrer"><Download className="mr-2 h-4 w-4" />Signed PDF</a></Button>}{assets?.certificateUrl && <Button variant="outline" asChild><a href={assets.certificateUrl} target="_blank" rel="noreferrer"><ShieldCheck className="mr-2 h-4 w-4" />Certificate</a></Button>}</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Order", request.signing_order], ["Current turn", String(request.current_order_index + 1)], ["Finalization", request.finalization_status], ["Expires", request.expires_at ? format(new Date(request.expires_at), "PPp") : "No expiry"]].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate font-semibold">{signingStatusLabel(value)}</p></CardContent></Card>)}</div>

      {myParticipant && <Card className={eligible ? "border-violet-300" : undefined}><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><PenLine className="h-5 w-5" />Your signing task</CardTitle></CardHeader><CardContent className="space-y-5">{eligible ? <><p className="text-sm text-muted-foreground">Complete the fields assigned to you. The server verifies identity, signing order, consent and the locked participant/field hashes before accepting completion.</p>{myFields.length > 0 && assets?.sourceUrl && <div className="overflow-auto rounded-lg border bg-slate-100 p-3 dark:bg-slate-900"><div className="mx-auto max-w-4xl"><div className="mb-2 flex items-center justify-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-xs">Page {page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</Button><Select value={String(zoom)} onValueChange={(value) => setZoom(Number(value))}><SelectTrigger className="w-24"><SelectValue /></SelectTrigger><SelectContent>{[60,75,85,100,125].map((value) => <SelectItem key={value} value={String(value)}>{value}%</SelectItem>)}</SelectContent></Select></div><SigningPdfFields url={assets.sourceUrl} page={page} zoom={zoom} fields={myFields} onLoadPages={setPages} /></div></div>}<div className="grid gap-3 lg:grid-cols-2">{myFields.map((field: Field) => <div key={field.id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><p className="text-sm font-medium">{field.label || signingStatusLabel(field.type)}</p>{field.required && <span className="text-xs text-red-500">Required</span>}</div>{field.type === "signature" || field.type === "initial" ? <Button className="mt-3 w-full" variant={signatureByField[field.id] ? "outline" : "default"} onClick={() => { setSignatureTargetField(field.id); setSignatureOpen(true); }}>{signatureByField[field.id] ? "Signature selected" : `Add ${field.type}`}</Button> : field.type === "date" ? <Input className="mt-3" type="date" value={fieldValues[field.id] ?? format(new Date(), "yyyy-MM-dd")} onChange={(event) => setFieldValues((current) => ({ ...current, [field.id]: event.target.value }))} /> : <Input className="mt-3" value={fieldValues[field.id] ?? ""} onChange={(event) => setFieldValues((current) => ({ ...current, [field.id]: event.target.value }))} placeholder="Enter value" />}</div>)}</div><label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm"><Checkbox checked={consent} onCheckedChange={(value) => setConsent(Boolean(value))} /><span>I consent to use an electronic signature for this request and understand that OfficeKonnect records signing consent, timestamps and integrity hashes in the audit trail.</span></label><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" className="text-red-600" onClick={() => setDeclineOpen(true)}><XCircle className="mr-2 h-4 w-4" />Decline</Button><Button onClick={() => completeMutation.mutate()} disabled={!consent || completeMutation.isPending}>{completeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Complete signing</Button></div></> : <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">{myParticipant.status === "signed" ? "You completed this signing request." : myParticipant.status === "declined" ? "You declined this request." : request.signing_order === "sequential" ? "Your signing turn is not active yet. OfficeKonnect will notify you when the preceding participant completes." : "This request is not currently eligible for action."}</div>}</CardContent></Card>}

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card><CardHeader><CardTitle className="text-base">Participants</CardTitle></CardHeader><CardContent className="space-y-2">{(participants ?? []).map((participant) => <div key={participant.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{participantDisplayName(participant)}</p><p className="text-xs text-muted-foreground">{participant.role} · Turn {participant.order_index + 1}</p></div><span className="rounded-full bg-muted px-2 py-1 text-xs">{signingStatusLabel(participant.status)}</span>{isSender && !participant.user_id && ["sent", "in_progress"].includes(request.status) && <Button size="sm" variant="outline" onClick={() => void rotateInvite(participant)}><Clipboard className="mr-2 h-3 w-3" />Rotate link</Button>}</div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Audit timeline</CardTitle></CardHeader><CardContent className="space-y-3">{(events ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No audit events yet.</p> : (events ?? []).map((event) => <div key={event.id} className="flex gap-3 border-b pb-3 last:border-0"><div className="mt-1 h-2 w-2 rounded-full bg-primary" /><div className="min-w-0"><p className="text-sm font-medium">{signingStatusLabel(event.event_type.replaceAll(".", " "))}</p><p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(event.created_at), { addSuffix: true })} · {event.event_source}</p>{event.event_hash && <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{event.event_hash}</p>}</div></div>)}</CardContent></Card>
      </div>

      <Dialog open={signatureOpen} onOpenChange={setSignatureOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Choose signature</DialogTitle><DialogDescription>Use a saved signature, draw one, or create a typed signature. New signatures are stored under your workspace identity and referenced by ID during authenticated completion.</DialogDescription></DialogHeader><Tabs value={signatureMode} onValueChange={(value) => setSignatureMode(value as typeof signatureMode)}><TabsList className="grid w-full grid-cols-3"><TabsTrigger value="saved">Saved</TabsTrigger><TabsTrigger value="draw">Draw</TabsTrigger><TabsTrigger value="type">Type</TabsTrigger></TabsList><TabsContent value="saved" className="space-y-2 pt-3"><Select value={selectedSavedSignature} onValueChange={setSelectedSavedSignature}><SelectTrigger><SelectValue placeholder="Choose a saved signature" /></SelectTrigger><SelectContent>{savedSignatures?.map((signature) => <SelectItem key={signature.id} value={signature.id}>{signature.name}{signature.is_default ? " · Default" : ""}</SelectItem>)}</SelectContent></Select>{savedSignatures?.length === 0 && <p className="text-sm text-muted-foreground">No saved signatures yet. Use Draw or Type.</p>}</TabsContent><TabsContent value="draw" className="pt-3"><div className="rounded-lg border bg-white"><SignatureCanvas ref={signatureCanvas} penColor="black" canvasProps={{ className: "h-56 w-full cursor-crosshair rounded-lg" }} /></div><Button className="mt-2" size="sm" variant="outline" onClick={() => signatureCanvas.current?.clear()}>Clear</Button></TabsContent><TabsContent value="type" className="space-y-3 pt-3"><Input value={typedName} onChange={(event) => setTypedName(event.target.value)} placeholder="Your full signing name" /><div className="flex h-28 items-center justify-center rounded-lg border bg-white text-4xl italic text-black" style={{ fontFamily: "'Brush Script MT', cursive" }}>{typedName || "Preview"}</div></TabsContent></Tabs><DialogFooter><Button variant="outline" onClick={() => setSignatureOpen(false)}>Cancel</Button><Button onClick={() => signatureMutation.mutate()} disabled={signatureMutation.isPending}>{signatureMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Use signature</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}><DialogContent><DialogHeader><DialogTitle>Decline signature request</DialogTitle><DialogDescription>Declining is a terminal action for this request and will be recorded in the audit trail.</DialogDescription></DialogHeader><Textarea value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} placeholder="Reason for declining" /><DialogFooter><Button variant="outline" onClick={() => setDeclineOpen(false)}>Back</Button><Button variant="destructive" disabled={!declineReason.trim() || declineMutation.isPending} onClick={() => declineMutation.mutate()}>Decline request</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}><DialogContent><DialogHeader><DialogTitle>Cancel signature request</DialogTitle><DialogDescription>Cancellation revokes active participant access and remains visible in the audit trail.</DialogDescription></DialogHeader><Textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Reason for cancellation" /><DialogFooter><Button variant="outline" onClick={() => setCancelOpen(false)}>Back</Button><Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>Cancel request</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
