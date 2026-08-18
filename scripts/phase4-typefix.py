from pathlib import Path

path = Path("src/lib/files.functions.ts")
text = path.read_text()
start = text.index("      while (cursor) {")
end = text.index("    const { data: folder, error } = await supabase", start)
prefix = text[:start]
block = text[start:end]
suffix = text[end:]
old = '''        const { data: parent, error: parentError } = await supabase
          .from("workspace_folders")
          .select("id,parent_id,workspace_id")
          .eq("id", cursor)
          .single();
        if (parentError) throw new Error(parentError.message);
        if (parent.workspace_id !== workspaceId)
          throw new Error("Destination folder is outside the active workspace");
        cursor = parent.parent_id;
'''
new = '''        const parentResult = await supabase
          .from("workspace_folders")
          .select("id,parent_id,workspace_id")
          .eq("id", cursor)
          .single();
        if (parentResult.error) throw new Error(parentResult.error.message);
        const parentRow: { id: string; parent_id: string | null; workspace_id: string } =
          parentResult.data;
        if (parentRow.workspace_id !== workspaceId)
          throw new Error("Destination folder is outside the active workspace");
        cursor = parentRow.parent_id;
'''
if block.count(old) != 1:
    raise SystemExit(f"ancestry query marker count: {block.count(old)}")
path.write_text(prefix + block.replace(old, new, 1) + suffix)
