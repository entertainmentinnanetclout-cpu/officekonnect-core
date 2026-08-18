import { supabase } from "@/integrations/supabase/client";
import type { ExternalSigningPayload, SigningFieldValue } from "@/lib/signing";

async function invokeExternal(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("signing-external", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export async function exchangeExternalSigningToken(token: string) {
  if (!/^[0-9a-f]{64}$/i.test(token)) throw new Error("Invitation token is invalid");
  const data = await invokeExternal({ action: "exchange", token });
  return {
    sessionToken: String(data.sessionToken ?? ""),
    sessionExpiresAt: String(data.sessionExpiresAt ?? ""),
    payload: data.payload as ExternalSigningPayload,
  };
}

export async function getExternalSigningPayload(sessionToken: string) {
  const data = await invokeExternal({ action: "payload", sessionToken });
  return data.payload as ExternalSigningPayload;
}

export async function uploadExternalSignature(
  sessionToken: string,
  fieldId: string,
  imageBase64: string,
  mimeType = "image/png",
) {
  const data = await invokeExternal({
    action: "upload_signature",
    sessionToken,
    fieldId,
    imageBase64,
    mimeType,
  });
  return String(data.signatureStoragePath ?? "");
}

export async function completeExternalSigning(
  sessionToken: string,
  fieldValues: SigningFieldValue[],
  consentTextVersion: string,
) {
  return invokeExternal({
    action: "complete",
    sessionToken,
    fieldValues,
    consentTextVersion,
  });
}

export async function declineExternalSigning(sessionToken: string, reason: string) {
  return invokeExternal({ action: "decline", sessionToken, reason: reason.trim() });
}
