from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one source fragment, found {count}")
    return text.replace(old, new, 1)


types_path = Path("src/integrations/supabase/types.ts")
t = types_path.read_text()
if "      document_favorites: {" not in t:
    marker = "      document_fields: {\n"
    tables = '''      document_favorites: {
        Row: {
          created_at: string;
          document_id: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          document_id: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          document_id?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_favorites_document_workspace_fkey";
            columns: ["document_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "workspace_id"];
          },
        ];
      };
      document_folder_items: {
        Row: {
          created_at: string;
          document_id: string;
          folder_id: string;
          moved_by: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          document_id: string;
          folder_id: string;
          moved_by: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          document_id?: string;
          folder_id?: string;
          moved_by?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_folder_items_document_workspace_fkey";
            columns: ["document_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "document_folder_items_folder_workspace_fkey";
            columns: ["folder_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspace_folders";
            referencedColumns: ["id", "workspace_id"];
          },
        ];
      };
      document_shares: {
        Row: {
          created_at: string;
          document_id: string;
          id: string;
          permission: string;
          shared_by: string;
          shared_with: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          document_id: string;
          id?: string;
          permission?: string;
          shared_by: string;
          shared_with: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          document_id?: string;
          id?: string;
          permission?: string;
          shared_by?: string;
          shared_with?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_shares_document_workspace_fkey";
            columns: ["document_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "workspace_id"];
          },
        ];
      };
'''
    t = replace_once(t, marker, tables + marker, "phase4 tables")

if "      workspace_folders: {" not in t:
    marker = "      workspace_members: {\n"
    table = '''      workspace_folders: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          parent_id: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          parent_id?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          parent_id?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_folders_parent_workspace_fkey";
            columns: ["parent_id", "workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspace_folders";
            referencedColumns: ["id", "workspace_id"];
          },
          {
            foreignKeyName: "workspace_folders_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
'''
    t = replace_once(t, marker, table + marker, "workspace folders type")

if "      list_workspace_member_directory: {" not in t:
    marker = "      mark_signing_participant_viewed: {\n"
    fn = '''      list_workspace_member_directory: {
        Args: { p_workspace_id: string };
        Returns: {
          email: string;
          full_name: string;
          role: Database["public"]["Enums"]["workspace_role"];
          user_id: string;
        }[];
      };
'''
    t = replace_once(t, marker, fn + marker, "member directory function")

types_path.write_text(t)

shell_path = Path("src/components/officekonnect-shell.tsx")
s = shell_path.read_text()
if '  | "/dashboard/files"' not in s:
    s = replace_once(
        s,
        '  | "/dashboard/sheets"\n',
        '  | "/dashboard/sheets"\n  | "/dashboard/files"\n  | "/dashboard/templates"\n',
        "shell route union",
    )
s = s.replace(
    '{ label: "Files", href: null, icon: Files, phase: 4 },',
    '{ label: "Files", href: "/dashboard/files", icon: Files },',
)
s = s.replace(
    '{ label: "Templates", href: null, icon: FolderKanban, phase: 4 },',
    '{ label: "Templates", href: "/dashboard/templates", icon: FolderKanban },',
)
if '["/dashboard/files", "Files"],' not in s:
    s = replace_once(
        s,
        'const pageTitles: Array<[string, string]> = [\n',
        'const pageTitles: Array<[string, string]> = [\n  ["/dashboard/templates", "Templates"],\n  ["/dashboard/files", "Files"],\n',
        "shell page titles",
    )
shell_path.write_text(s)

files_path = Path("src/lib/files.functions.ts")
f = files_path.read_text()
f = f.replace("    return data.filter((member) => member.user_id !== userId);", "    return (data ?? []).filter((member) => member.user_id !== userId);")
f = f.replace(
    '''    const { data: share, error } = await supabase
      .from("document_shares")
      .upsert(
        {
          document_id: document.id,
          workspace_id: workspaceId,
          shared_with: data.userId,
          shared_by: userId,
          permission: "view",
        },
        { onConflict: "document_id,shared_with" },
      )
      .select("*")
      .single();''',
    '''    const { data: share, error } = await supabase
      .from("document_shares")
      .insert({
        document_id: document.id,
        workspace_id: workspaceId,
        shared_with: data.userId,
        shared_by: userId,
        permission: "view",
      })
      .select("*")
      .single();''',
)
files_path.write_text(f)

for path in [types_path, shell_path, files_path]:
    if not path.exists():
        raise SystemExit(f"missing {path}")
if 'href: "/dashboard/files"' not in s or 'href: "/dashboard/templates"' not in s:
    raise SystemExit("Phase 4 navigation activation failed")
if "document_favorites" not in t or "workspace_folders" not in t or "list_workspace_member_directory" not in t:
    raise SystemExit("Phase 4 generated type reconciliation failed")
