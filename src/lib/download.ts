import { supabase } from "@/integrations/supabase/client";

export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 60 * 60,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Could not create signed URL");
  return data.signedUrl;
}

export async function getDocumentSignedUrl(path: string, expiresIn = 60 * 60) {
  const buckets = ["documents", "document-versions", "exports"] as const;
  let lastError: unknown = null;

  for (const bucket of buckets) {
    try {
      const url = await getSignedUrl(bucket, path, expiresIn);
      return { bucket, url };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Document file could not be resolved");
}

export async function downloadFromStorage(bucket: string, path: string, filename: string) {
  const url = await getSignedUrl(bucket, path);
  await downloadFromUrl(url, filename);
}

export async function downloadDocumentFromStorage(path: string, filename: string) {
  const { url } = await getDocumentSignedUrl(path);
  await downloadFromUrl(url, filename);
}

async function downloadFromUrl(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  window.document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

export function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = filename;
  window.document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
