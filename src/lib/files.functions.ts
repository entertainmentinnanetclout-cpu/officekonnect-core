import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveWorkspaceId } from "@/lib/workspace.server";

async function requireWorkspaceDocument(
  supabase: Parameters<typeof getActiveWorkspaceId>[0],
  workspaceId: string,
  documentId: string,
) {
  const { data: document, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();
  if (error) throw new Error(error.message);
  if (document.workspace_id !== workspaceId)
    throw new Error("File is outside the active workspace");
  return document;
}

function safeStorageName(title: string, fileType: string | null) {
  const extensionFromTitle = title.includes(".")
    ? title.split(".").pop()?.toLowerCase()
    : undefined;
  const extensionFromMime =
    fileType === "application/pdf"
      ? "pdf"
      : fileType === "image/png"
        ? "png"
        : fileType === "image/jpeg"
          ? "jpg"
          : undefined;
  const extension = extensionFromTitle || extensionFromMime || "bin";
  return `copy.${extension.replace(/[^a-z0-9]/g, "") || "bin"}`;
}

export const createWorkspaceFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; parentId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const name = data.name.trim();
    if (!name) throw new Error("Folder name is required");
    if (name.length > 120) throw new Error("Folder names must be 120 characters or shorter");
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);

    if (data.parentId) {
      const { data: parent, error: parentError } = await supabase
        .from("workspace_folders")
        .select("id,workspace_id")
        .eq("id", data.parentId)
        .single();
      if (parentError) throw new Error(parentError.message);
      if (parent.workspace_id !== workspaceId)
        throw new Error("Parent folder is outside the active workspace");
    }

    const { data: folder, error } = await supabase
      .from("workspace_folders")
      .insert({
        workspace_id: workspaceId,
        parent_id: data.parentId ?? null,
        created_by: userId,
        name,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("A folder with this name already exists here");
      throw new Error(error.message);
    }
    return folder;
  });

export const renameWorkspaceFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { folderId: string; name: string }) => d)
  .handler(async ({ data, context }) => {
    const name = data.name.trim();
    if (!name) throw new Error("Folder name is required");
    if (name.length > 120) throw new Error("Folder names must be 120 characters or shorter");
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: folder, error } = await supabase
      .from("workspace_folders")
      .update({ name })
      .eq("id", data.folderId)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("A folder with this name already exists here");
      throw new Error(error.message);
    }
    return folder;
  });

export const moveWorkspaceFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { folderId: string; parentId: string | null }) => d)
  .handler(async ({ data, context }) => {
    if (data.folderId === data.parentId) throw new Error("A folder cannot be moved inside itself");
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    if (data.parentId) {
      let cursor: string | null = data.parentId;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === data.folderId)
          throw new Error("A folder cannot be moved inside one of its descendants");
        if (seen.has(cursor)) throw new Error("The folder hierarchy is invalid");
        seen.add(cursor);
        const { data: parent, error: parentError } = await supabase
          .from("workspace_folders")
          .select("id,parent_id,workspace_id")
          .eq("id", cursor)
          .single();
        if (parentError) throw new Error(parentError.message);
        if (parent.workspace_id !== workspaceId)
          throw new Error("Destination folder is outside the active workspace");
        cursor = parent.parent_id;
      }
    }
    const { data: folder, error } = await supabase
      .from("workspace_folders")
      .update({ parent_id: data.parentId })
      .eq("id", data.folderId)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505")
        throw new Error("A folder with this name already exists at the destination");
      throw new Error(error.message);
    }
    return folder;
  });

export const deleteWorkspaceFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { folderId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data: folder, error } = await supabase
      .from("workspace_folders")
      .delete()
      .eq("id", data.folderId)
      .eq("workspace_id", workspaceId)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return folder;
  });

export const moveDocumentToFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string; folderId: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    await requireWorkspaceDocument(supabase, workspaceId, data.documentId);

    if (!data.folderId) {
      const { error } = await supabase
        .from("document_folder_items")
        .delete()
        .eq("document_id", data.documentId)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      return { documentId: data.documentId, folderId: null };
    }

    const { data: folder, error: folderError } = await supabase
      .from("workspace_folders")
      .select("id,workspace_id")
      .eq("id", data.folderId)
      .single();
    if (folderError) throw new Error(folderError.message);
    if (folder.workspace_id !== workspaceId)
      throw new Error("Destination folder is outside the active workspace");

    const { error } = await supabase.from("document_folder_items").upsert(
      {
        document_id: data.documentId,
        workspace_id: workspaceId,
        folder_id: data.folderId,
        moved_by: userId,
      },
      { onConflict: "document_id" },
    );
    if (error) throw new Error(error.message);
    return { documentId: data.documentId, folderId: data.folderId };
  });

export const setDocumentFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string; favorite: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    await requireWorkspaceDocument(supabase, workspaceId, data.documentId);
    if (data.favorite) {
      const { error } = await supabase
        .from("document_favorites")
        .upsert(
          { document_id: data.documentId, workspace_id: workspaceId, user_id: userId },
          { onConflict: "document_id,user_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("document_favorites")
        .delete()
        .eq("document_id", data.documentId)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
    return { documentId: data.documentId, favorite: data.favorite };
  });

export const shareDocumentWithMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string; userId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.userId === userId) throw new Error("You already own access to this file");
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const document = await requireWorkspaceDocument(supabase, workspaceId, data.documentId);
    const { data: share, error } = await supabase
      .from("document_shares")
      .insert({
        document_id: document.id,
        workspace_id: workspaceId,
        shared_with: data.userId,
        shared_by: userId,
        permission: "view",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return share;
  });

export const removeDocumentShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string; userId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    await requireWorkspaceDocument(supabase, workspaceId, data.documentId);
    const { error } = await supabase
      .from("document_shares")
      .delete()
      .eq("document_id", data.documentId)
      .eq("shared_with", data.userId)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { documentId: data.documentId, userId: data.userId };
  });

export const getWorkspaceMemberDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const { data, error } = await supabase.rpc("list_workspace_member_directory", {
      p_workspace_id: workspaceId,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).filter((member) => member.user_id !== userId);
  });

export const duplicateUploadedFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { documentId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workspaceId = await getActiveWorkspaceId(supabase, userId);
    const source = await requireWorkspaceDocument(supabase, workspaceId, data.documentId);
    if (source.document_kind !== "file" || !source.storage_path) {
      throw new Error("Only stored uploaded files can use this duplicate action");
    }

    const copyId = crypto.randomUUID();
    const destination = `${workspaceId}/${userId}/documents/${copyId}/${safeStorageName(source.title, source.file_type)}`;
    const { error: copyError } = await supabase.storage
      .from("documents")
      .copy(source.storage_path, destination);
    if (copyError) throw new Error(copyError.message);

    const { data: copy, error: insertError } = await supabase
      .from("documents")
      .insert({
        id: copyId,
        workspace_id: workspaceId,
        created_by: userId,
        title: `Copy of ${source.title}`,
        description: source.description,
        document_kind: "file",
        document_status: "draft",
        file_type: source.file_type,
        file_size: source.file_size,
        page_count: source.page_count,
        storage_path: destination,
        original_file_url: destination,
        current_file_url: destination,
      })
      .select("*")
      .single();
    if (insertError) {
      await supabase.storage.from("documents").remove([destination]);
      throw new Error(insertError.message);
    }

    const { error: versionError } = await supabase.from("document_versions").insert({
      document_id: copy.id,
      version_number: 1,
      created_by: userId,
      title: copy.title,
      file_url: destination,
      storage_path: destination,
      change_summary: `Duplicated from file ${source.id}.`,
    });
    if (versionError) {
      await supabase.from("documents").delete().eq("id", copy.id);
      await supabase.storage.from("documents").remove([destination]);
      throw new Error(versionError.message);
    }
    return copy;
  });
