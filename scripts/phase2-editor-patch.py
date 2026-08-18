from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source fragment, found {count}")
    return text.replace(old, new, 1)


editor = Path("src/components/document/native-document-editor.tsx")
s = editor.read_text()

s = replace_once(s, "  FileDown,\n  Heading1,", "  FileDown,\n  FileSignature,\n  Heading1,", "FileSignature import")
s = replace_once(
    s,
    'import { toast } from "sonner";\n',
    'import { createNativeDocumentSigningCopy } from "@/lib/document-signing-copy.functions";\nimport { toast } from "sonner";\n',
    "signing copy import",
)
s = replace_once(
    s,
    '''function alignStyle(align?: NativeDocumentAlignment) {\n  return align && align !== "left" ? ` style="text-align:${align}"` : "";\n}\n''',
    '''function blockAttributes(align?: NativeDocumentAlignment, indent?: number) {\n  const styles: string[] = [];\n  if (align && align !== "left") styles.push(`text-align:${align}`);\n  if (indent && indent > 0) styles.push(`margin-left:${indent * 36}px`);\n  const indentAttribute = indent && indent > 0 ? ` data-indent="${indent}"` : "";\n  const styleAttribute = styles.length > 0 ? ` style="${styles.join(";")}"` : "";\n  return `${indentAttribute}${styleAttribute}`;\n}\n''',
    "block attributes",
)
s = s.replace("${alignStyle(block.align)}", "${blockAttributes(block.align, block.indent)}")
s = replace_once(
    s,
    'return `<${tag} data-block-id="${escapeHtml(block.id)}">${block.items',
    'return `<${tag} data-block-id="${escapeHtml(block.id)}"${blockAttributes(undefined, block.indent)}>${block.items',
    "list HTML attributes",
)
s = replace_once(
    s,
    '''function elementAlignment(element: HTMLElement): NativeDocumentAlignment | undefined {\n  const align = element.style.textAlign;\n  return align === "center" || align === "right" || align === "justify" ? align : undefined;\n}\n''',
    '''function elementAlignment(element: HTMLElement): NativeDocumentAlignment | undefined {\n  const align = element.style.textAlign;\n  return align === "center" || align === "right" || align === "justify" ? align : undefined;\n}\n\nfunction elementIndent(element: HTMLElement): number | undefined {\n  const explicit = Number(element.dataset.indent);\n  if (Number.isFinite(explicit) && explicit > 0) return Math.min(8, Math.round(explicit));\n  const margin = Number.parseFloat(element.style.marginLeft);\n  if (!Number.isFinite(margin) || margin <= 0) return undefined;\n  return Math.min(8, Math.max(1, Math.round(margin / 36)));\n}\n''',
    "element indent helper",
)
s = replace_once(
    s,
    '''    const id = node.dataset.blockId || blockId();\n    const tag = node.tagName;\n''',
    '''    const id = node.dataset.blockId || blockId();\n    node.dataset.blockId = id;\n    const tag = node.tagName;\n    const indent = elementIndent(node);\n''',
    "stable block id",
)
indented_align = "        align: elementAlignment(node),\n"
if s.count(indented_align) != 2:
    raise SystemExit(
        f"heading/quote alignment serializers: expected two blocks, found {s.count(indented_align)}"
    )
s = s.replace(indented_align, indented_align + "        indent,\n")
s = replace_once(
    s,
    "      align: elementAlignment(node),\n",
    "      align: elementAlignment(node),\n      indent,\n",
    "paragraph indent serializer",
)
s = replace_once(
    s,
    '''        items: Array.from(node.querySelectorAll(":scope > li")).map((item) =>\n          sanitizeInlineHtml(item.innerHTML),\n        ),\n''',
    '''        items: Array.from(node.querySelectorAll(":scope > li")).map((item) =>\n          sanitizeInlineHtml(item.innerHTML),\n        ),\n        indent,\n''',
    "list indent serializer",
)
s = replace_once(
    s,
    "  const savingRef = useRef(false);\n",
    "  const savingRef = useRef(false);\n  const hydratedDocumentIdRef = useRef<string | null>(null);\n",
    "hydration ref",
)
s = replace_once(
    s,
    "  const [exporting, setExporting] = useState(false);\n",
    "  const [exporting, setExporting] = useState(false);\n  const [creatingSigningCopy, setCreatingSigningCopy] = useState(false);\n",
    "signing copy state",
)
s = replace_once(
    s,
    "  const letterheadFn = useServerFn(setDocumentLetterhead);\n",
    "  const letterheadFn = useServerFn(setDocumentLetterhead);\n  const signingCopyFn = useServerFn(createNativeDocumentSigningCopy);\n",
    "signing copy server function",
)
s = replace_once(
    s,
    '''  useEffect(() => {\n    const next = normalizeNativeDocumentContent(document.content);\n    applyContentToEditor(next);\n    setTitle(document.title);\n    setEditorVersion(document.editor_version);\n    latestEditorVersionRef.current = document.editor_version;\n    setSaveState("saved");\n    setLastSavedAt(new Date(document.updated_at));\n  }, [\n    document.id,\n    document.content,\n    document.editor_version,\n    document.title,\n    applyContentToEditor,\n  ]);\n''',
    '''  useEffect(() => {\n    setTitle(document.title);\n    const isInitialDocument = hydratedDocumentIdRef.current !== document.id;\n    const incomingVersionIsNewer = document.editor_version > latestEditorVersionRef.current;\n    if (!isInitialDocument && (!incomingVersionIsNewer || saveState !== "saved")) return;\n\n    const next = normalizeNativeDocumentContent(document.content);\n    applyContentToEditor(next);\n    hydratedDocumentIdRef.current = document.id;\n    setEditorVersion(document.editor_version);\n    latestEditorVersionRef.current = document.editor_version;\n    setSaveState("saved");\n    setLastSavedAt(new Date(document.updated_at));\n  }, [\n    document.id,\n    document.content,\n    document.editor_version,\n    document.title,\n    document.updated_at,\n    applyContentToEditor,\n    saveState,\n  ]);\n''',
    "cursor-safe hydration",
)
s = replace_once(
    s,
    '  const insertHtml = (html: string) => exec("insertHTML", html);\n\n',
    '''  const insertHtml = (html: string) => exec("insertHTML", html);\n\n  const adjustIndent = (delta: number) => {\n    const root = editorRef.current;\n    const selection = window.getSelection();\n    if (!root || !selection?.rangeCount) return;\n    const container = selection.getRangeAt(0).commonAncestorContainer;\n    let element = container instanceof HTMLElement ? container : container.parentElement;\n    while (element && element.parentElement !== root) element = element.parentElement;\n    if (!element || !root.contains(element)) return;\n\n    const current = elementIndent(element) ?? 0;\n    const next = Math.max(0, Math.min(8, current + delta));\n    if (next > 0) {\n      element.dataset.indent = String(next);\n      element.style.marginLeft = `${next * 36}px`;\n    } else {\n      delete element.dataset.indent;\n      element.style.marginLeft = "";\n    }\n    syncFromEditor();\n  };\n\n''',
    "persisted indentation command",
)
s = replace_once(
    s,
    '''  const handleExport = async (print = false) => {\n    setExporting(true);\n    try {\n      syncFromEditor();\n      const saved = saveState === "saved" ? true : Boolean(await persist());\n      if (!saved && saveState === "conflict") return;\n      const result = await exportFn({ data: { documentId: document.id } });\n''',
    '''  const handleExport = async (print = false) => {\n    setExporting(true);\n    try {\n      syncFromEditor();\n      const saved = Boolean(await persist());\n      if (!saved) return;\n      const result = await exportFn({ data: { documentId: document.id } });\n''',
    "save-before-export barrier",
)
s = replace_once(
    s,
    "  const restoreVersion = async (versionId: string) => {\n",
    '''  const handleCreateSigningCopy = async () => {\n    setCreatingSigningCopy(true);\n    try {\n      syncFromEditor();\n      const saved = Boolean(await persist());\n      if (!saved) return;\n      const result = await signingCopyFn({ data: { documentId: document.id } });\n      window.open(`/dashboard/documents/${result.document.id}`, "_blank", "noopener,noreferrer");\n      toast.success("Immutable PDF signing copy created");\n    } catch (error) {\n      toastError(error, "Signing copy creation failed");\n    } finally {\n      setCreatingSigningCopy(false);\n    }\n  };\n\n  const restoreVersion = async (versionId: string) => {\n''',
    "signing copy handler",
)
s = replace_once(
    s,
    '''              <DropdownMenuItem onClick={() => void handleExport(false)}>\n                <FileDown className="mr-2 h-4 w-4" /> Export PDF\n              </DropdownMenuItem>\n              <DropdownMenuItem onClick={() => void handleExport(true)}>\n                <Printer className="mr-2 h-4 w-4" /> Print\n              </DropdownMenuItem>\n''',
    '''              <DropdownMenuItem\n                disabled={exporting || saveState === "saving" || saveState === "conflict"}\n                onClick={() => void handleExport(false)}\n              >\n                <FileDown className="mr-2 h-4 w-4" /> Export PDF\n              </DropdownMenuItem>\n              <DropdownMenuItem\n                disabled={exporting || saveState === "saving" || saveState === "conflict"}\n                onClick={() => void handleExport(true)}\n              >\n                <Printer className="mr-2 h-4 w-4" /> Print\n              </DropdownMenuItem>\n              <DropdownMenuItem\n                disabled={creatingSigningCopy || exporting || saveState === "saving" || saveState === "conflict"}\n                onClick={() => void handleCreateSigningCopy()}\n              >\n                <FileSignature className="mr-2 h-4 w-4" /> Create signing copy\n              </DropdownMenuItem>\n''',
    "document file actions",
)
s = replace_once(
    s,
    '''          <ToolbarButton label="Decrease indent" onPress={() => exec("outdent")}>\n            <IndentDecrease className="h-4 w-4" />\n          </ToolbarButton>\n          <ToolbarButton label="Increase indent" onPress={() => exec("indent")}>\n            <IndentIncrease className="h-4 w-4" />\n          </ToolbarButton>\n''',
    '''          <ToolbarButton label="Decrease indent" onPress={() => adjustIndent(-1)}>\n            <IndentDecrease className="h-4 w-4" />\n          </ToolbarButton>\n          <ToolbarButton label="Increase indent" onPress={() => adjustIndent(1)}>\n            <IndentIncrease className="h-4 w-4" />\n          </ToolbarButton>\n''',
    "indent toolbar",
)

for marker in [
    "createNativeDocumentSigningCopy",
    "hydratedDocumentIdRef",
    "data-indent",
    "const adjustIndent",
    "const saved = Boolean(await persist())",
    "Create signing copy",
]:
    if marker not in s:
        raise SystemExit("missing final marker: " + marker)
editor.write_text(s)


documents = Path("src/lib/documents.functions.ts")
d = documents.read_text()
source_select = '.select("id,workspace_id,title,document_kind,content,letterhead_id")'
if d.count(source_select) != 1:
    raise SystemExit(f"native export source select not unique: {d.count(source_select)}")
d = d.replace(
    source_select,
    '.select("id,workspace_id,title,document_kind,content,letterhead_id,updated_at")',
    1,
)
renderer_tail = '''      logoBytes,\n      logoMimeType,\n    });\n\n    const storagePath = `${workspaceId}/${userId}/documents/${document.id}/export-${Date.now()}.pdf`;\n'''
if renderer_tail not in d:
    raise SystemExit("native renderer invocation marker missing")
d = d.replace(
    renderer_tail,
    '''      logoBytes,\n      logoMimeType,\n      renderedAt: document.updated_at,\n    });\n\n    const storagePath = `${workspaceId}/${userId}/documents/${document.id}/export-${Date.now()}.pdf`;\n''',
    1,
)
documents.write_text(d)
