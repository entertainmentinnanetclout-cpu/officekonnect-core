import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { format } from "date-fns";
import { CheckCircle2, FileSignature, Loader2, ShieldCheck, Type, XCircle } from "lucide-react";
import { SigningPdfFields } from "@/components/signing/signing-pdf-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  completeExternalSigning,
  declineExternalSigning,
  getExternalSigningPayload,
  uploadExternalSignature,
} from "@/lib/external-signing";
import {
  SIGNING_CONSENT_VERSION,
  signingStatusLabel,
  type ExternalSigningPayload,
  type SigningField,
  type SigningFieldValue,
} from "@/lib/signing";

export const Route = createFileRoute("/sign/active")({ component: ExternalSigningActive });

const SESSION_KEY = "officekonnect.signing.session";

type CompletionResult = {
  completion?: { request?: { status?: string } };
  finalization?: {
    finalDownloadUrl?: string | null;
    certificateDownloadUrl?: string | null;
  } | null;
};

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

function externalFieldsForCanvas(payload: ExternalSigningPayload): SigningField[] {
  return payload.fields.map((field) => ({
    id: field.id,
    request_id: payload.request.id,
    participant_id: payload.participant.id,
    page: field.page,
    x: field.x,
    y: field.y,
    w: field.w,
    h: field.h,
    rotation: field.rotation,
    type: field.type,
    value: field.value,
    required: field.required,
    signed_signature_id: null,
    signed_at: field.completed ? new Date().toISOString() : null,
    created_at: "",
    updated_at: "",
    field_key: field.fieldKey,
    label: field.label,
    validation: {},
    signature_storage_path: null,
    value_hash: null,
    completion_metadata: {},
  }));
}

function ExternalSigningActive() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [payload, setPayload] = useState<ExternalSigningPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [signatureMode, setSignatureMode] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const signatureCanvas = useRef<SignatureCanvas>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) throw new Error("This signing session is not available. Reopen your secure invitation link.");
      const parsed = JSON.parse(raw) as { sessionToken?: string; sessionExpiresAt?: string };
      if (!parsed.sessionToken) throw new Error("Signing session is invalid");
      if (parsed.sessionExpiresAt && new Date(parsed.sessionExpiresAt).getTime() <= Date.now()) throw new Error("Signing session expired. Reopen the invitation link to exchange a new session.");
      setSessionToken(parsed.sessionToken);
      void getExternalSigningPayload(parsed.sessionToken)
        .then((nextPayload) => {
          setPayload(nextPayload);
          const defaults: Record<string, string> = {};
          for (const field of nextPayload.fields) {
            if (field.type === "date") defaults[field.id] = field.value || format(new Date(), "yyyy-MM-dd");
            else if (field.value) defaults[field.id] = field.value;
          }
          setValues(defaults);
        })
        .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load this signing session"))
        .finally(() => setLoading(false));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Signing session is unavailable");
      setLoading(false);
    }
  }, []);

  const eligible = Boolean(
    payload &&
      ["sent", "in_progress"].includes(payload.request.status) &&
      ["pending", "viewed"].includes(payload.participant.status) &&
      payload.participant.role !== "cc" &&
      (payload.request.signingOrder !== "sequential" || payload.participant.orderIndex === payload.request.currentOrderIndex),
  );

  const createSignatureImage = () => {
    if (signatureMode === "draw") {
      if (!signatureCanvas.current || signatureCanvas.current.isEmpty()) throw new Error("Draw your signature first");
      return signatureCanvas.current.getCanvas().toDataURL("image/png");
    }
    if (!typedName.trim()) throw new Error("Type your full signing name first");
    return typedSignatureDataUrl(typedName.trim());
  };

  const complete = async () => {
    if (!sessionToken || !payload) return;
    try {
      setSubmitting(true);
      setError(null);
      if (!eligible) throw new Error("Your signing turn is not active");
      if (!consent) throw new Error("Electronic-signing consent is required");
      const signatureFields = payload.fields.filter((field) => field.type === "signature" || field.type === "initial");
      let signatureDataUrl: string | null = null;
      if (signatureFields.length > 0) signatureDataUrl = createSignatureImage();
      const fieldValues: SigningFieldValue[] = [];
      for (const field of payload.fields) {
        if (field.type === "signature" || field.type === "initial") {
          if (!signatureDataUrl) throw new Error(`${field.label || field.type} is required`);
          const signatureStoragePath = await uploadExternalSignature(sessionToken, field.id, signatureDataUrl, "image/png");
          fieldValues.push({ fieldId: field.id, signatureStoragePath });
        } else {
          const value = values[field.id]?.trim() || "";
          if (field.required && !value) throw new Error(`${field.label || field.type} is required`);
          fieldValues.push({ fieldId: field.id, value });
        }
      }
      const result = (await completeExternalSigning(sessionToken, fieldValues, SIGNING_CONSENT_VERSION)) as CompletionResult;
      setCompletion(result);
      sessionStorage.removeItem(SESSION_KEY);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not complete signing");
    } finally {
      setSubmitting(false);
    }
  };

  const decline = async () => {
    if (!sessionToken) return;
    try {
      setDeclining(true);
      await declineExternalSigning(sessionToken, declineReason);
      sessionStorage.removeItem(SESSION_KEY);
      setDeclineOpen(false);
      setCompletion({ completion: { request: { status: "declined" } } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not decline request");
    } finally {
      setDeclining(false);
    }
  };

  if (loading) return <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-white"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading secure signing session…</div>;
  if (error && !payload) return <div className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-white"><div className="max-w-md rounded-2xl border border-red-900/60 bg-slate-900 p-8 text-center"><XCircle className="mx-auto h-8 w-8 text-red-400" /><h1 className="mt-4 text-xl font-semibold">Signing session unavailable</h1><p className="mt-3 text-sm text-red-300">{error}</p></div></div>;
  if (completion) {
    const declined = completion.completion?.request?.status === "declined";
    return <div className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 text-white"><div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">{declined ? <XCircle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}</div><h1 className="mt-5 text-2xl font-semibold">{declined ? "Request declined" : "Signing complete"}</h1><p className="mt-2 text-sm text-slate-400">{declined ? "Your decision was recorded in the signing audit trail." : "Your completed fields, consent and identity evidence were accepted by OfficeKonnect."}</p>{completion.finalization?.finalDownloadUrl && <Button className="mt-6" asChild><a href={completion.finalization.finalDownloadUrl} target="_blank" rel="noreferrer">Download completed PDF</a></Button>}{completion.finalization?.certificateDownloadUrl && <Button className="mt-3" variant="outline" asChild><a href={completion.finalization.certificateDownloadUrl} target="_blank" rel="noreferrer">Download audit certificate</a></Button>}</div></div>;
  }
  if (!payload) return null;

  return (
    <div className="min-h-dvh bg-slate-100 dark:bg-slate-950">
      <header className="border-b bg-slate-950 px-4 py-4 text-white"><div className="mx-auto flex max-w-7xl items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-slate-950"><ShieldCheck className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="font-semibold">OfficeKonnect secure signing</p><p className="truncate text-xs text-slate-400">{payload.request.title}</p></div><span className="rounded-full bg-slate-800 px-3 py-1 text-xs">{signingStatusLabel(payload.participant.role)}</span></div></header>
      <main className="mx-auto grid max-w-7xl gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
        <section className="min-w-0"><div className="mb-3 flex items-center justify-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="text-xs text-muted-foreground">Page {page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</Button></div>{payload.sourceUrl ? <div className="overflow-auto rounded-xl border bg-white p-3"><SigningPdfFields url={payload.sourceUrl} page={page} zoom={85} fields={externalFieldsForCanvas(payload)} onLoadPages={setPages} /></div> : <div className="flex h-96 items-center justify-center rounded-xl border bg-white text-sm text-muted-foreground">PDF preview unavailable</div>}</section>
        <aside className="space-y-4"><div className="rounded-xl border bg-white p-5 dark:bg-slate-900"><h1 className="text-lg font-semibold">{payload.request.title}</h1>{payload.request.message && <p className="mt-2 text-sm text-muted-foreground">{payload.request.message}</p>}<div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-muted-foreground">Participant</p><p className="mt-1 font-medium">{payload.participant.fullName || payload.participant.email}</p></div><div><p className="text-muted-foreground">Expires</p><p className="mt-1 font-medium">{payload.request.expiresAt ? new Date(payload.request.expiresAt).toLocaleString() : "Not specified"}</p></div></div></div>
          {!eligible ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">{payload.participant.status === "signed" ? "You already completed this request." : payload.request.signingOrder === "sequential" ? "Your secure invitation is valid, but your signing turn is not active yet. Reopen this invitation after the preceding participant completes." : "This request is not currently eligible for signing."}</div> : <><div className="rounded-xl border bg-white p-5 dark:bg-slate-900"><h2 className="font-semibold">Your fields</h2><div className="mt-4 space-y-3">{payload.fields.filter((field) => field.type === "text" || field.type === "date").map((field) => <div key={field.id}><label className="text-xs font-medium">{field.label || signingStatusLabel(field.type)}{field.required ? " *" : ""}</label><Input className="mt-1" type={field.type === "date" ? "date" : "text"} value={values[field.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))} /></div>)}{payload.fields.some((field) => field.type === "signature" || field.type === "initial") && <div><label className="text-xs font-medium">Signature / initials *</label><Tabs value={signatureMode} onValueChange={(value) => setSignatureMode(value as "draw" | "type")} className="mt-2"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="draw"><FileSignature className="mr-2 h-3 w-3" />Draw</TabsTrigger><TabsTrigger value="type"><Type className="mr-2 h-3 w-3" />Type</TabsTrigger></TabsList><TabsContent value="draw"><div className="mt-2 rounded-lg border bg-white"><SignatureCanvas ref={signatureCanvas} penColor="black" canvasProps={{ className: "h-40 w-full cursor-crosshair rounded-lg" }} /></div><Button size="sm" variant="ghost" className="mt-1" onClick={() => signatureCanvas.current?.clear()}>Clear</Button></TabsContent><TabsContent value="type" className="space-y-2 pt-2"><Input placeholder="Full signing name" value={typedName} onChange={(event) => setTypedName(event.target.value)} /><div className="flex h-24 items-center justify-center rounded-lg border bg-white text-3xl italic text-black" style={{ fontFamily: "'Brush Script MT', cursive" }}>{typedName || "Preview"}</div></TabsContent></Tabs></div>}</div></div><label className="flex items-start gap-3 rounded-xl border bg-white p-4 text-sm dark:bg-slate-900"><Checkbox checked={consent} onCheckedChange={(value) => setConsent(Boolean(value))} /><span>I consent to electronic signing. I understand OfficeKonnect records consent, timestamps and cryptographic integrity evidence for this transaction.</span></label>{error && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}<div className="grid grid-cols-2 gap-2"><Button variant="outline" className="text-red-600" onClick={() => setDeclineOpen(true)}><XCircle className="mr-2 h-4 w-4" />Decline</Button><Button onClick={() => void complete()} disabled={!consent || submitting}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Complete</Button></div></>}
        </aside>
      </main>
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}><DialogContent><DialogHeader><DialogTitle>Decline request</DialogTitle><DialogDescription>This decision is recorded as a terminal signing event.</DialogDescription></DialogHeader><Textarea value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} placeholder="Reason for declining" /><DialogFooter><Button variant="outline" onClick={() => setDeclineOpen(false)}>Back</Button><Button variant="destructive" disabled={!declineReason.trim() || declining} onClick={() => void decline()}>{declining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Decline</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
