import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import SignatureCanvas from "react-signature-canvas";
import { ArrowLeft, CheckCircle2, FileSignature, Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { SigningPdfFields } from "@/components/signing/signing-pdf-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toastError } from "@/lib/errors";
import { completeDraftSenderSigning } from "@/lib/signing-account.functions";
import { getSigningRequestAssetLinks } from "@/lib/signing.functions";
import { SIGNING_CONSENT_VERSION, type SigningFieldValue } from "@/lib/signing";

export const Route = createFileRoute("/dashboard/signing/$requestId/pre-sign")({
  component: SenderPreSign,
});

type SavedSignature = Tables<"user_signatures">;

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

function SenderPreSign() {
  const { requestId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const assetsFn = useServerFn(getSigningRequestAssetLinks);
  const completeFn = useServerFn(completeDraftSenderSigning);

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(85);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [signatureByField, setSignatureByField] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signatureTargetField, setSignatureTargetField] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<"saved" | "draw" | "type">("saved");
  const [typedName, setTypedName] = useState("");
  const [selectedSavedSignature, setSelectedSavedSignature] = useState("");
  const signatureCanvas = useRef<SignatureCanvas>(null);

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
        .order("order_index");
      if (error) throw error;
      return data;
    },
  });

  const myParticipant = useMemo(
    () => participants.find((participant) => participant.user_id === user?.id) ?? null,
    [participants, user?.id],
  );

  const { data: fields = [], isLoading: loadingFields } = useQuery({
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

  const myFields = useMemo(
    () => fields.filter((field) => field.participant_id === myParticipant?.id),
    [fields, myParticipant?.id],
  );

  const { data: assets } = useQuery({
    queryKey: ["signing-assets", requestId, request?.revision],
    enabled: Boolean(request),
    queryFn: () => assetsFn({ data: { requestId } }),
  });

  const { data: savedSignatures = [] } = useQuery({
    queryKey: ["signatures", request?.workspace_id, user?.id],
    enabled: Boolean(request?.workspace_id && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_signatures")
        .select("*")
        .eq("workspace_id", request!.workspace_id)
        .eq("created_by", user!.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!savedSignatures.length || selectedSavedSignature) return;
    setSelectedSavedSignature(
      savedSignatures.find((signature) => signature.is_default)?.id ?? savedSignatures[0].id,
    );
  }, [savedSignatures, selectedSavedSignature]);

  const saveQuickSignature = async (dataUrl: string): Promise<SavedSignature> => {
    if (!request?.workspace_id || !user?.id) throw new Error("Workspace identity is unavailable");
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${request.workspace_id}/${user.id}/signing-${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage
      .from("signatures")
      .upload(path, blob, { contentType: "image/png", upsert: false });
    if (uploadError) throw uploadError;

    const { data: signed, error: signedError } = await supabase.storage
      .from("signatures")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signedError) throw signedError;

    const { data, error } = await supabase
      .from("user_signatures")
      .insert({
        workspace_id: request.workspace_id,
        created_by: user.id,
        name: `Signing signature ${new Date().toLocaleDateString()}`,
        signature_image_url: signed.signedUrl,
        storage_path: path,
        is_default: savedSignatures.length === 0,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  };

  const signatureMutation = useMutation({
    mutationFn: async () => {
      if (!signatureTargetField) throw new Error("No signature field selected");
      let signatureId = selectedSavedSignature;
      if (signatureMode === "draw") {
        if (!signatureCanvas.current || signatureCanvas.current.isEmpty()) {
          throw new Error("Draw your signature first");
        }
        signatureId = (
          await saveQuickSignature(signatureCanvas.current.getCanvas().toDataURL("image/png"))
        ).id;
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

  const complete = useMutation({
    mutationFn: async () => {
      if (!request || !user?.id || !myParticipant) {
        throw new Error("Your signing assignment is unavailable");
      }
      if (request.status !== "draft" || request.sender_id !== user.id) {
        throw new Error("Only the sender can sign an unlocked draft before sending");
      }
      if (myParticipant.role !== "signer") {
        throw new Error("Your account must be added as a signer before pre-signing");
      }
      if (!consent) throw new Error("Electronic signing consent is required");

      const values: SigningFieldValue[] = myFields.map((field) => {
        if (field.type === "signature" || field.type === "initial") {
          const signatureId = signatureByField[field.id];
          if (field.required && !signatureId) {
            throw new Error(`${field.label || field.type} is required`);
          }
          return { fieldId: field.id, signatureId: signatureId || undefined };
        }
        const value = fieldValues[field.id]?.trim() ?? "";
        if (field.required && !value) {
          throw new Error(`${field.label || field.type} is required`);
        }
        return { fieldId: field.id, value };
      });

      return completeFn({
        data: {
          participantId: myParticipant.id,
          fieldValues: values,
          consentTextVersion: SIGNING_CONSENT_VERSION,
        },
      });
    },
    onSuccess: async () => {
      toast.success(
        "Your signature is locked into the draft. You can now send it to the remaining recipients.",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["signing-request", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["signing-participants", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["signing-fields", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["signing-assets", requestId] }),
      ]);
      await navigate({
        to: "/dashboard/signing/$requestId/prepare",
        params: { requestId },
      });
    },
    onError: (error) => toastError(error, "Could not sign draft"),
  });

  const loading = loadingRequest || loadingParticipants || loadingFields;
  if (loading || !request) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (request.status !== "draft" || request.sender_id !== user?.id) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border p-6 text-center">
        <h1 className="text-xl font-semibold">Pre-signing is unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sender pre-signing is only available while the request is an unlocked draft.
        </p>
        <Button className="mt-5" asChild>
          <Link to="/dashboard/signing/$requestId" params={{ requestId }}>
            Open request
          </Link>
        </Button>
      </div>
    );
  }

  if (!myParticipant || myParticipant.role !== "signer") {
    return (
      <div className="mx-auto max-w-xl rounded-xl border p-6 text-center">
        <h1 className="text-xl font-semibold">Add yourself as a signer first</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Return to Prepare, search your OfficeKonnect profile, add it as a signer and place at
          least one signature or initial field for yourself.
        </p>
        <Button className="mt-5" asChild>
          <Link to="/dashboard/signing/$requestId/prepare" params={{ requestId }}>
            Back to Prepare
          </Link>
        </Button>
      </div>
    );
  }

  if (myParticipant.status === "signed") {
    return (
      <div className="mx-auto max-w-xl rounded-xl border p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="mt-3 text-xl font-semibold">You already signed this draft</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your completed fields are immutable. Continue to Prepare and send the document to the
          remaining accounts.
        </p>
        <Button className="mt-5" asChild>
          <Link to="/dashboard/signing/$requestId/prepare" params={{ requestId }}>
            Continue to Prepare
          </Link>
        </Button>
      </div>
    );
  }

  if (myFields.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border p-6 text-center">
        <h1 className="text-xl font-semibold">Place your fields first</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your signer account does not have any fields assigned yet.
        </p>
        <Button className="mt-5" asChild>
          <Link to="/dashboard/signing/$requestId/prepare" params={{ requestId }}>
            Place signing fields
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-3" asChild>
          <Link to="/dashboard/signing/$requestId/prepare" params={{ requestId }}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Prepare
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Sign before sending</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete your own fields now. OfficeKonnect snapshots the source PDF when you finish, then
          keeps your completed fields immutable while you send the same document to the remaining
          signers.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{request.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span className="text-xs">
                Page {page} / {pages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
              <Select value={String(zoom)} onValueChange={(value) => setZoom(Number(value))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[60, 75, 85, 100, 125].map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {assets?.sourceUrl ? (
              <div className="overflow-auto rounded-lg bg-slate-100 p-3 dark:bg-slate-950">
                <div className="mx-auto max-w-5xl">
                  <SigningPdfFields
                    url={assets.sourceUrl}
                    page={page}
                    zoom={zoom}
                    fields={myFields}
                    onLoadPages={setPages}
                  />
                </div>
              </div>
            ) : (
              <div className="grid min-h-[520px] place-items-center rounded-lg border text-sm text-muted-foreground">
                Could not load the source PDF.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PenLine className="h-4 w-4" /> Your fields
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {myFields.map((field) => (
              <div key={field.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{field.label || field.type}</p>
                  {field.required && <span className="text-xs text-red-500">Required</span>}
                </div>
                {field.type === "signature" || field.type === "initial" ? (
                  <Button
                    className="mt-3 w-full"
                    variant={signatureByField[field.id] ? "outline" : "default"}
                    onClick={() => {
                      setSignatureTargetField(field.id);
                      setSignatureOpen(true);
                    }}
                  >
                    <FileSignature className="mr-2 h-4 w-4" />
                    {signatureByField[field.id] ? "Signature selected" : `Add ${field.type}`}
                  </Button>
                ) : field.type === "date" ? (
                  <Input
                    className="mt-3"
                    type="date"
                    value={fieldValues[field.id] ?? new Date().toISOString().slice(0, 10)}
                    onChange={(event) =>
                      setFieldValues((current) => ({ ...current, [field.id]: event.target.value }))
                    }
                  />
                ) : (
                  <Input
                    className="mt-3"
                    value={fieldValues[field.id] ?? ""}
                    onChange={(event) =>
                      setFieldValues((current) => ({ ...current, [field.id]: event.target.value }))
                    }
                    placeholder="Enter value"
                  />
                )}
              </div>
            ))}

            <label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
              <Checkbox checked={consent} onCheckedChange={(value) => setConsent(Boolean(value))} />
              <span>
                I consent to use an electronic signature and understand that OfficeKonnect records
                consent, timestamps and integrity hashes in the audit trail.
              </span>
            </label>

            <Button
              className="w-full"
              onClick={() => complete.mutate()}
              disabled={!consent || complete.isPending}
            >
              {complete.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Sign draft and return to Prepare
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={signatureOpen} onOpenChange={setSignatureOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose signature</DialogTitle>
            <DialogDescription>
              Use a saved signature, draw one or create a typed signature. Newly created signatures
              are stored under your registered OfficeKonnect identity.
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={signatureMode}
            onValueChange={(value) => setSignatureMode(value as typeof signatureMode)}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="saved">Saved</TabsTrigger>
              <TabsTrigger value="draw">Draw</TabsTrigger>
              <TabsTrigger value="type">Type</TabsTrigger>
            </TabsList>
            <TabsContent value="saved" className="space-y-2 pt-3">
              <Select value={selectedSavedSignature} onValueChange={setSelectedSavedSignature}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a saved signature" />
                </SelectTrigger>
                <SelectContent>
                  {savedSignatures.map((signature) => (
                    <SelectItem key={signature.id} value={signature.id}>
                      {signature.name}
                      {signature.is_default ? " · Default" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {savedSignatures.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No saved signatures yet. Use Draw or Type.
                </p>
              )}
            </TabsContent>
            <TabsContent value="draw" className="pt-3">
              <div className="rounded-lg border bg-white">
                <SignatureCanvas
                  ref={signatureCanvas}
                  penColor="black"
                  canvasProps={{ className: "h-56 w-full cursor-crosshair rounded-lg" }}
                />
              </div>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={() => signatureCanvas.current?.clear()}
              >
                Clear
              </Button>
            </TabsContent>
            <TabsContent value="type" className="space-y-3 pt-3">
              <Input
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                placeholder="Your full signing name"
              />
              <div
                className="flex h-28 items-center justify-center rounded-lg border bg-white text-4xl italic text-black"
                style={{ fontFamily: "'Brush Script MT', cursive" }}
              >
                {typedName || "Preview"}
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignatureOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => signatureMutation.mutate()}
              disabled={signatureMutation.isPending}
            >
              {signatureMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Use signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
