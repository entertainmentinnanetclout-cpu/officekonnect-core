from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f"missing patch anchor: {label}")
    return text.replace(old, new, 1)


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


# Allow hardened external signing routes through the root auth boundary.
root_path = Path("src/routes/__root.tsx")
root = root_path.read_text(encoding="utf-8")
root = replace_once(
    root,
    '  const isDashboardPage = location.pathname.startsWith("/dashboard");\n',
    '  const isDashboardPage = location.pathname.startsWith("/dashboard");\n  const isExternalSigningPage = location.pathname.startsWith("/sign/");\n',
    "root external signing marker",
)
root = replace_once(
    root,
    '    !isDashboardPage &&\n',
    '    !isDashboardPage &&\n    !isExternalSigningPage &&\n',
    "root redirect exclusion",
)
write(str(root_path), root)

# Activate Phase 6/7 routes plus the global Ctrl/Cmd+K search dialog.
shell_path = Path("src/components/officekonnect-shell.tsx")
shell = shell_path.read_text(encoding="utf-8")
shell = replace_once(
    shell,
    'import type { ReactNode } from "react";',
    'import { useEffect, useState, type ReactNode } from "react";',
    "shell React hooks",
)
shell = replace_once(
    shell,
    'import { cn } from "@/lib/utils";\n',
    'import { cn } from "@/lib/utils";\nimport { GlobalSearchDialog } from "@/components/search/global-search-dialog";\n',
    "shell search component import",
)
shell = replace_once(
    shell,
    '  | "/dashboard/approvals"\n',
    '  | "/dashboard/approvals"\n  | "/dashboard/signing"\n  | "/dashboard/tasks"\n  | "/dashboard/calendar"\n  | "/dashboard/search"\n',
    "shell route union",
)
shell = replace_once(shell, '{ label: "E-signatures", href: null, icon: FileSignature, phase: 6 },', '{ label: "E-signatures", href: "/dashboard/signing", icon: FileSignature },', "signing nav")
shell = replace_once(shell, '{ label: "Tasks", href: null, icon: CheckSquare2, phase: 7 },', '{ label: "Tasks", href: "/dashboard/tasks", icon: CheckSquare2 },', "tasks nav")
shell = replace_once(shell, '{ label: "Calendar", href: null, icon: CalendarDays, phase: 7 },', '{ label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },', "calendar nav")
shell = replace_once(
    shell,
    'const pageTitles: Array<[string, string]> = [\n',
    'const pageTitles: Array<[string, string]> = [\n  ["/dashboard/signing", "E-signatures"],\n  ["/dashboard/tasks", "Tasks"],\n  ["/dashboard/calendar", "Calendar"],\n  ["/dashboard/search", "Search"],\n',
    "page titles",
)
shell = replace_once(
    shell,
    '  const location = useLocation();\n  const workspace = useWorkspaceShell(user);\n',
    '  const location = useLocation();\n  const workspace = useWorkspaceShell(user);\n  const [searchOpen, setSearchOpen] = useState(false);\n\n  useEffect(() => {\n    const handler = (event: KeyboardEvent) => {\n      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {\n        event.preventDefault();\n        setSearchOpen(true);\n      }\n    };\n    window.addEventListener("keydown", handler);\n    return () => window.removeEventListener("keydown", handler);\n  }, []);\n',
    "shell search state",
)
shell = replace_once(
    shell,
    '''            <Button\n              variant="outline"\n              className="hidden h-9 w-64 justify-start gap-2 text-slate-500 md:flex"\n              disabled\n              title="Global command search is implemented in Phase 7"\n            >\n              <Search className="h-4 w-4" />\n              <span className="text-xs">Search workspace</span>\n              <span className="ml-auto text-[10px]">Phase 7</span>\n            </Button>''',
    '''            <Button\n              variant="outline"\n              className="hidden h-9 w-64 justify-start gap-2 text-slate-500 md:flex"\n              onClick={() => setSearchOpen(true)}\n              title="Search workspace (Ctrl/Cmd+K)"\n            >\n              <Search className="h-4 w-4" />\n              <span className="text-xs">Search workspace</span>\n              <span className="ml-auto text-[10px]">⌘K</span>\n            </Button>''',
    "desktop search button",
)
shell = replace_once(
    shell,
    '      </section>\n    </div>\n  );\n}',
    '      </section>\n      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />\n    </div>\n  );\n}',
    "search dialog mount",
)
write(str(shell_path), shell)

# Upgrade native document and sheet static signing-copy actions into a real signing workflow handoff.
for path in [
    "src/components/document/native-document-editor.tsx",
    "src/components/spreadsheet/spreadsheet-editor.tsx",
]:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    text = text.replace(
        'window.open(`/dashboard/documents/${result.document.id}`, "_blank", "noopener,noreferrer");\n      toast.success("Immutable PDF signing copy created");',
        'window.location.assign(`/dashboard/signing?create=1&document=${encodeURIComponent(result.document.id)}&title=${encodeURIComponent(result.document.title)}`);\n      toast.success("Signing copy created — continue with participants and fields");',
    )
    text = text.replace(
        'window.open(`/dashboard/documents/${result.document.id}`, "_blank", "noopener,noreferrer");\n      toast.success("Immutable spreadsheet signing copy created");',
        'window.location.assign(`/dashboard/signing?create=1&document=${encodeURIComponent(result.document.id)}&title=${encodeURIComponent(result.document.title)}`);\n      toast.success("Signing copy created — continue with participants and fields");',
    )
    text = text.replace('> Create signing copy\n', '> Send for signature\n')
    write(str(p), text)

# Prefill signing request creation when Docs/Sheets hand off a signing copy.
signing_dashboard_path = Path("src/routes/dashboard/signing/index.tsx")
signing_dashboard = signing_dashboard_path.read_text(encoding="utf-8")
signing_dashboard = replace_once(signing_dashboard, 'import { useMemo, useState } from "react";', 'import { useEffect, useMemo, useState } from "react";', "signing dashboard useEffect")
signing_dashboard = replace_once(
    signing_dashboard,
    '  const [participants, setParticipants] = useState<DraftParticipant[]>([blankParticipant(0)]);\n',
    '  const [participants, setParticipants] = useState<DraftParticipant[]>([blankParticipant(0)]);\n\n  useEffect(() => {\n    const params = new URLSearchParams(window.location.search);\n    if (params.get("create") !== "1") return;\n    const nextDocumentId = params.get("document");\n    const nextTitle = params.get("title");\n    if (nextDocumentId) setDocumentId(nextDocumentId);\n    if (nextTitle) setTitle(nextTitle);\n    setCreateOpen(true);\n    window.history.replaceState({}, "", "/dashboard/signing");\n  }, []);\n',
    "signing dashboard handoff",
)
write(str(signing_dashboard_path), signing_dashboard)

# Simplify field-label editing to an uncontrolled draft that persists on blur.
prepare_path = Path("src/routes/dashboard/signing/$requestId/prepare.tsx")
prepare = prepare_path.read_text(encoding="utf-8")
prepare = replace_once(
    prepare,
    '<Input value={selectedField.label ?? ""} onBlur={(event) => updateFieldMutation.mutate({ field: selectedField, patch: { label: event.target.value } })} onChange={() => undefined} readOnly={false} key={`${selectedField.id}-${selectedField.label ?? ""}`} defaultValue={selectedField.label ?? ""} />',
    '<Input key={`${selectedField.id}-${selectedField.label ?? ""}`} defaultValue={selectedField.label ?? ""} onBlur={(event) => updateFieldMutation.mutate({ field: selectedField, patch: { label: event.target.value } })} />',
    "prepare label input",
)
write(str(prepare_path), prepare)

# Use normal href for runtime-derived calendar links instead of forcing TanStack static-route typing.
calendar_path = Path("src/routes/dashboard/calendar/index.tsx")
calendar = calendar_path.read_text(encoding="utf-8")
calendar = calendar.replace('<Button asChild size="sm" variant="ghost" className="mt-2 h-7 px-2"><Link to={item.route as never}>Open source</Link></Button>', '<Button asChild size="sm" variant="ghost" className="mt-2 h-7 px-2"><a href={item.route}>Open source</a></Button>')
calendar = calendar.replace('import { createFileRoute, Link } from "@tanstack/react-router";', 'import { createFileRoute } from "@tanstack/react-router";')
write(str(calendar_path), calendar)

# Reconcile generated DB types with live Phase 7 tables/RPC.
types_path = Path("src/integrations/supabase/types.ts")
types = types_path.read_text(encoding="utf-8")
calendar_block = '''      calendar_events: {\n        Row: {\n          all_day: boolean; created_at: string; created_by: string; description: string | null;\n          ends_at: string; entity_id: string | null; entity_type: string | null; id: string;\n          location: string | null; starts_at: string; title: string; updated_at: string; workspace_id: string;\n        };\n        Insert: {\n          all_day?: boolean; created_at?: string; created_by: string; description?: string | null;\n          ends_at: string; entity_id?: string | null; entity_type?: string | null; id?: string;\n          location?: string | null; starts_at: string; title: string; updated_at?: string; workspace_id: string;\n        };\n        Update: {\n          all_day?: boolean; created_at?: string; created_by?: string; description?: string | null;\n          ends_at?: string; entity_id?: string | null; entity_type?: string | null; id?: string;\n          location?: string | null; starts_at?: string; title?: string; updated_at?: string; workspace_id?: string;\n        };\n        Relationships: [{ foreignKeyName: "calendar_events_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] }];\n      };\n'''
if "      calendar_events: {" not in types:
    types = replace_once(types, "      campaign_recipients: {", calendar_block + "      campaign_recipients: {", "calendar_events types")

tasks_block = '''      tasks: {\n        Row: {\n          assignee_id: string | null; completed_at: string | null; created_at: string; created_by: string;\n          description: string | null; due_at: string | null; entity_id: string | null; entity_type: string | null;\n          id: string; priority: string; start_at: string | null; status: string; title: string; updated_at: string; workspace_id: string;\n        };\n        Insert: {\n          assignee_id?: string | null; completed_at?: string | null; created_at?: string; created_by: string;\n          description?: string | null; due_at?: string | null; entity_id?: string | null; entity_type?: string | null;\n          id?: string; priority?: string; start_at?: string | null; status?: string; title: string; updated_at?: string; workspace_id: string;\n        };\n        Update: {\n          assignee_id?: string | null; completed_at?: string | null; created_at?: string; created_by?: string;\n          description?: string | null; due_at?: string | null; entity_id?: string | null; entity_type?: string | null;\n          id?: string; priority?: string; start_at?: string | null; status?: string; title?: string; updated_at?: string; workspace_id?: string;\n        };\n        Relationships: [{ foreignKeyName: "tasks_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] }];\n      };\n'''
if "      tasks: {" not in types:
    types = replace_once(types, "      transcription_jobs: {", tasks_block + "      transcription_jobs: {", "tasks types")

search_block = '''      search_workspace_objects: {\n        Args: { p_limit?: number; p_query: string; p_workspace_id: string };\n        Returns: { metadata: Json; object_id: string; object_type: string; occurred_at: string; route: string; subtitle: string; title: string }[];\n      };\n'''
if "      search_workspace_objects: {" not in types:
    types = replace_once(types, "      send_signing_request: {", search_block + "      send_signing_request: {", "search RPC types")
write(str(types_path), types)

print("Phase 6/7 reconciliation patches applied")
