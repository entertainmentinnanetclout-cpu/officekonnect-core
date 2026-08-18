from pathlib import Path

path = Path("src/lib/files.functions.ts")
text = path.read_text()
old = '''        const { data: parent, error: parentError } = await supabase
          .from("workspace_folders")
          .select("id,parent_id,workspace_id")
          .eq("id", cursor)
          .single();
        if (parentError) throw new Error(parentError.message);
        if (parent.workspace_id !== workspaceId) throw new Error("Destination folder is outside the active workspace");
        cursor = parent.parent_id;'''
new = '''        const { data: parentRow, error: parentError } = await supabase
          .from("workspace_folders")
          .select("id,parent_id,workspace_id")
          .eq("id", cursor)
          .single();
        if (parentError) throw new Error(parentError.message);
        if (parentRow.workspace_id !== workspaceId) throw new Error("Destination folder is outside the active workspace");
        cursor = parentRow.parent_id;'''
if text.count(old) != 1:
    raise SystemExit(f"folder parent marker count: {text.count(old)}")
path.write_text(text.replace(old, new, 1))
