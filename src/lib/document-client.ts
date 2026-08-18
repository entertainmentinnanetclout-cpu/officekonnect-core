import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { createEmptyNativeDocument, nativeDocumentToJson } from "@/lib/native-document";

export type DocumentRow = Tables<"documents">;

async function requireDocumentIdentity() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user || user.is_anonymous) {
    throw new Error("Sign in to save documents to OfficeKonnect");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("default_workspace_id")
    .eq("id", user.id)
    .single();
  if (profileError) throw profileError;
  if (!profile.default_workspace_id) throw new Error("No active workspace is selected");

  return { userId: user.id, workspaceId: profile.default_workspace_id };
}

export async function createNativeDocumentClient(title = "Untitled document") {
  const { userId, workspaceId } = await requireDocumentIdentity();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      workspace_id: workspaceId,
      created_by: userId,
      title: title.trim() || "Untitled document",
      document_kind: "native",
      file_type: "application/vnd.officekonnect.document+json",
      content: nativeDocumentToJson(createEmptyNativeDocument()),
      editor_version: 1,
      word_count: 0,
      last_saved_by: userId,
      document_status: "draft",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function uploadDocumentClient(file: File) {
  const { userId, workspaceId } = await requireDocumentIdentity();
  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  const storagePath = `${workspaceId}/${userId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  try {
    const { data, error } = await supabase
      .from("documents")
      .insert({
        workspace_id: workspaceId,
        created_by: userId,
        title: file.name,
        storage_path: storagePath,
        file_type: file.type || "application/octet-stream",
        file_size: file.size,
        document_kind: "file",
        document_status: "draft",
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    await supabase.storage.from("documents").remove([storagePath]);
    throw error;
  }
}
