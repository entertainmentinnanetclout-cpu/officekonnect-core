import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  FileDown,
  FileSignature,
  Heading1,
  Heading2,
  Heading3,
  History,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  PanelTop,
  Printer,
  Quote,
  Redo2,
  Save,
  Search,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  exportNativeDocumentPdf,
  renameDocument,
  restoreNativeDocumentVersion,
  saveNativeDocument,
  setDocumentLetterhead,
} from "@/lib/documents.functions";
import {
  htmlToPlainText,
  nativeDocumentWordCount,
  normalizeNativeDocumentContent,
  type NativeDocumentAlignment,
  type NativeDocumentBlock,
  type NativeDocumentContent,
} from "@/lib/native-document";
import { createNativeDocumentSigningCopy } from "@/lib/document-signing-copy.functions";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";

interface NativeDocumentEditorProps {
  document: Tables<"documents">;
  onDocumentUpdated?: (document: Tables<"documents">) => void;
}

type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error";

const INLINE_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "A", "SPAN", "BR"]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeInlineHtml(value: string) {
  if (typeof window === "undefined") return escapeHtml(htmlToPlainText(value));
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${value}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  if (!root) return "";

  const walk = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      if (!INLINE_TAGS.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        return;
      }

      Array.from(child.attributes).forEach((attribute) => {
        if (child.tagName === "A" && attribute.name === "href") {
          const href = attribute.value.trim();
          if (!/^(https?:|mailto:)/i.test(href)) child.removeAttribute(attribute.name);
          return;
        }
        if (attribute.name === "style") {
          const allowed = attribute.value
            .split(";")
            .map((rule) => rule.trim())
            .filter((rule) => /^(color|background-color)\s*:/i.test(rule))
            .join("; ");
          if (allowed) child.setAttribute("style", allowed);
          else child.removeAttribute("style");
          return;
        }
        child.removeAttribute(attribute.name);
      });
      walk(child);
    });
  };

  walk(root);
  return root.innerHTML;
}

function blockAttributes(align?: NativeDocumentAlignment, indent?: number) {
  const styles: string[] = [];
  if (align && align !== "left") styles.push(`text-align:${align}`);
  if (indent && indent > 0) styles.push(`margin-left:${indent * 36}px`);
  const indentAttribute = indent && indent > 0 ? ` data-indent="${indent}"` : "";
  const styleAttribute = styles.length > 0 ? ` style="${styles.join(";")}"` : "";
  return `${indentAttribute}${styleAttribute}`;
}

function editorHtml(content: NativeDocumentContent) {
  return content.blocks
    .map((block) => {
      if (block.type === "paragraph") {
        return `<p data-block-id="${escapeHtml(block.id)}"${blockAttributes(block.align, block.indent)}>${sanitizeInlineHtml(block.html) || "<br>"}</p>`;
      }
      if (block.type === "heading") {
        return `<h${block.level} data-block-id="${escapeHtml(block.id)}"${blockAttributes(block.align, block.indent)}>${sanitizeInlineHtml(block.html) || "<br>"}</h${block.level}>`;
      }
      if (block.type === "quote") {
        return `<blockquote data-block-id="${escapeHtml(block.id)}"${blockAttributes(block.align, block.indent)}>${sanitizeInlineHtml(block.html) || "<br>"}</blockquote>`;
      }
      if (block.type === "bulletList" || block.type === "orderedList") {
        const tag = block.type === "bulletList" ? "ul" : "ol";
        return `<${tag} data-block-id="${escapeHtml(block.id)}"${blockAttributes(undefined, block.indent)}>${block.items
          .map((item) => `<li>${sanitizeInlineHtml(item) || "<br>"}</li>`)
          .join("")}</${tag}>`;
      }
      if (block.type === "table") {
        return `<table data-block-id="${escapeHtml(block.id)}"><tbody>${block.rows
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${sanitizeInlineHtml(cell) || "<br>"}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table>`;
      }
      if (block.type === "rule") {
        return `<hr data-block-id="${escapeHtml(block.id)}">`;
      }
      return `<div data-block-id="${escapeHtml(block.id)}" data-page-break="true" contenteditable="false"><span>Page break</span></div><p><br></p>`;
    })
    .join("");
}

function blockId() {
  return crypto.randomUUID();
}

function elementAlignment(element: HTMLElement): NativeDocumentAlignment | undefined {
  const align = element.style.textAlign;
  return align === "center" || align === "right" || align === "justify" ? align : undefined;
}

function elementIndent(element: HTMLElement): number | undefined {
  const explicit = Number(element.dataset.indent);
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(8, Math.round(explicit));
  const margin = Number.parseFloat(element.style.marginLeft);
  if (!Number.isFinite(margin) || margin <= 0) return undefined;
  return Math.min(8, Math.max(1, Math.round(margin / 36)));
}

function serializeEditor(
  root: HTMLDivElement,
  page: NativeDocumentContent["page"],
): NativeDocumentContent {
  const blocks: NativeDocumentBlock[] = [];

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent?.trim();
      if (value) blocks.push({ id: blockId(), type: "paragraph", html: escapeHtml(value) });
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;

    const id = node.dataset.blockId || blockId();
    node.dataset.blockId = id;
    const tag = node.tagName;
    const indent = elementIndent(node);

    if (node.dataset.pageBreak === "true") {
      blocks.push({ id, type: "pageBreak" });
      continue;
    }
    if (tag === "HR") {
      blocks.push({ id, type: "rule" });
      continue;
    }
    if (tag === "H1" || tag === "H2" || tag === "H3") {
      blocks.push({
        id,
        type: "heading",
        level: Number(tag.slice(1)) as 1 | 2 | 3,
        html: sanitizeInlineHtml(node.innerHTML),
        align: elementAlignment(node),
        indent,
      });
      continue;
    }
    if (tag === "BLOCKQUOTE") {
      blocks.push({
        id,
        type: "quote",
        html: sanitizeInlineHtml(node.innerHTML),
        align: elementAlignment(node),
        indent,
      });
      continue;
    }
    if (tag === "UL" || tag === "OL") {
      blocks.push({
        id,
        type: tag === "UL" ? "bulletList" : "orderedList",
        items: Array.from(node.querySelectorAll(":scope > li")).map((item) =>
          sanitizeInlineHtml(item.innerHTML),
        ),
        indent,
      });
      continue;
    }
    if (tag === "TABLE") {
      const rows = Array.from(node.querySelectorAll(":scope > tbody > tr, :scope > tr")).map(
        (row) =>
          Array.from(row.querySelectorAll(":scope > td, :scope > th")).map((cell) =>
            sanitizeInlineHtml(cell.innerHTML),
          ),
      );
      blocks.push({ id, type: "table", rows });
      continue;
    }

    blocks.push({
      id,
      type: "paragraph",
      html: sanitizeInlineHtml(node.innerHTML),
      align: elementAlignment(node),
      indent,
    });
  }

  return {
    schemaVersion: 1,
    page,
    blocks: blocks.length > 0 ? blocks : [{ id: blockId(), type: "paragraph", html: "" }],
  };
}

function saveStateLabel(state: SaveState) {
  if (state === "saving") return "Saving…";
  if (state === "dirty") return "Unsaved changes";
  if (state === "conflict") return "Edit conflict";
  if (state === "error") return "Save failed";
  return "Saved";
}

function ToolbarButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      title={label}
      aria-label={label}
      onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => event.preventDefault()}
      onClick={onPress}
    >
      {children}
    </Button>
  );
}

export function NativeDocumentEditor({ document, onDocumentUpdated }: NativeDocumentEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const savingRef = useRef(false);
  const hydratedDocumentIdRef = useRef<string | null>(null);
  const latestContentRef = useRef<NativeDocumentContent>(
    normalizeNativeDocumentContent(document.content),
  );
  const latestEditorVersionRef = useRef(document.editor_version);

  const [content, setContent] = useState(() => normalizeNativeDocumentContent(document.content));
  const [title, setTitle] = useState(document.title);
  const [editorVersion, setEditorVersion] = useState(document.editor_version);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(new Date(document.updated_at));
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [versionTitle, setVersionTitle] = useState("");
  const [versionSummary, setVersionSummary] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [zoom, setZoom] = useState(100);
  const [exporting, setExporting] = useState(false);
  const [creatingSigningCopy, setCreatingSigningCopy] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);

  const saveFn = useServerFn(saveNativeDocument);
  const renameFn = useServerFn(renameDocument);
  const restoreFn = useServerFn(restoreNativeDocumentVersion);
  const exportFn = useServerFn(exportNativeDocumentPdf);
  const letterheadFn = useServerFn(setDocumentLetterhead);
  const signingCopyFn = useServerFn(createNativeDocumentSigningCopy);

  const { data: versions, refetch: refetchVersions } = useQuery({
    queryKey: ["document-versions", document.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_versions")
        .select("id,version_number,title,change_summary,created_at,word_count,content")
        .eq("document_id", document.id)
        .not("content", "is", null)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: letterheads } = useQuery({
    queryKey: ["letterheads", document.workspace_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("letterheads")
        .select("id,name")
        .eq("workspace_id", document.workspace_id)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const wordCount = useMemo(() => nativeDocumentWordCount(content), [content]);
  const pageWidth = content.page.size === "LETTER" ? 816 : 794;
  const pageHeight = content.page.size === "LETTER" ? 1056 : 1123;
  const orientedWidth = content.page.orientation === "landscape" ? pageHeight : pageWidth;
  const orientedHeight = content.page.orientation === "landscape" ? pageWidth : pageHeight;

  const applyContentToEditor = useCallback((next: NativeDocumentContent) => {
    latestContentRef.current = next;
    setContent(next);
    if (editorRef.current) editorRef.current.innerHTML = editorHtml(next);
  }, []);

  useEffect(() => {
    setTitle(document.title);
    const isInitialDocument = hydratedDocumentIdRef.current !== document.id;
    const incomingVersionIsNewer = document.editor_version > latestEditorVersionRef.current;
    if (!isInitialDocument && (!incomingVersionIsNewer || saveState !== "saved")) return;

    const next = normalizeNativeDocumentContent(document.content);
    applyContentToEditor(next);
    hydratedDocumentIdRef.current = document.id;
    setEditorVersion(document.editor_version);
    latestEditorVersionRef.current = document.editor_version;
    setSaveState("saved");
    setLastSavedAt(new Date(document.updated_at));
  }, [
    document.id,
    document.content,
    document.editor_version,
    document.title,
    document.updated_at,
    applyContentToEditor,
    saveState,
  ]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const root = editorRef.current;
      const selection = window.getSelection();
      if (!root || !selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (root.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange();
    };
    window.document.addEventListener("selectionchange", handleSelectionChange);
    return () => window.document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  const syncFromEditor = useCallback(() => {
    if (!editorRef.current) return;
    const next = serializeEditor(editorRef.current, latestContentRef.current.page);
    latestContentRef.current = next;
    setContent(next);
    setSaveState((state) => (state === "conflict" ? state : "dirty"));
  }, []);

  const persist = useCallback(
    async (options?: {
      createVersion?: boolean;
      versionTitle?: string;
      changeSummary?: string;
    }) => {
      if (savingRef.current || saveState === "conflict") return null;
      savingRef.current = true;
      setSaveState("saving");
      const snapshot = latestContentRef.current;
      const snapshotJson = JSON.stringify(snapshot);
      try {
        const result = await saveFn({
          data: {
            documentId: document.id,
            expectedEditorVersion: latestEditorVersionRef.current,
            content: snapshot,
            wordCount: nativeDocumentWordCount(snapshot),
            createVersion: options?.createVersion,
            versionTitle: options?.versionTitle,
            changeSummary: options?.changeSummary,
          },
        });
        latestEditorVersionRef.current = result.editor_version;
        setEditorVersion(result.editor_version);
        setLastSavedAt(new Date(result.updated_at));
        onDocumentUpdated?.(result);
        setSaveState(JSON.stringify(latestContentRef.current) === snapshotJson ? "saved" : "dirty");
        if (options?.createVersion) await refetchVersions();
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/changed in another session|editor version/i.test(message)) {
          setSaveState("conflict");
          toast.error("This document changed in another session. Reload before continuing.");
        } else {
          setSaveState("error");
          toastError(error, "Document save failed");
        }
        return null;
      } finally {
        savingRef.current = false;
      }
    },
    [document.id, onDocumentUpdated, refetchVersions, saveFn, saveState],
  );

  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = window.setTimeout(() => void persist(), 1200);
    return () => window.clearTimeout(timer);
  }, [content, persist, saveState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        syncFromEditor();
        void persist();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [persist, syncFromEditor]);

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    window.document.execCommand(command, false, value);
    syncFromEditor();
  };

  const insertHtml = (html: string) => exec("insertHTML", html);

  const adjustIndent = (delta: number) => {
    const root = editorRef.current;
    const selection = window.getSelection();
    if (!root || !selection?.rangeCount) return;
    const container = selection.getRangeAt(0).commonAncestorContainer;
    let element = container instanceof HTMLElement ? container : container.parentElement;
    while (element && element.parentElement !== root) element = element.parentElement;
    if (!element || !root.contains(element)) return;

    const current = elementIndent(element) ?? 0;
    const next = Math.max(0, Math.min(8, current + delta));
    if (next > 0) {
      element.dataset.indent = String(next);
      element.style.marginLeft = `${next * 36}px`;
    } else {
      delete element.dataset.indent;
      element.style.marginLeft = "";
    }
    syncFromEditor();
  };

  const updatePage = (patch: Partial<NativeDocumentContent["page"]>) => {
    const next = {
      ...latestContentRef.current,
      page: { ...latestContentRef.current.page, ...patch },
    };
    latestContentRef.current = next;
    setContent(next);
    setSaveState((state) => (state === "conflict" ? state : "dirty"));
  };

  const handleRename = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === document.title) {
      setTitle(document.title);
      return;
    }
    try {
      const updated = await renameFn({ data: { documentId: document.id, title: nextTitle } });
      onDocumentUpdated?.(updated);
      toast.success("Document renamed");
    } catch (error) {
      setTitle(document.title);
      toastError(error, "Rename failed");
    }
  };

  const handleExport = async (print = false) => {
    setExporting(true);
    try {
      syncFromEditor();
      const saved = Boolean(await persist());
      if (!saved) return;
      const result = await exportFn({ data: { documentId: document.id } });
      if (print) {
        window.open(result.url, "_blank", "noopener,noreferrer");
      } else {
        const anchor = window.document.createElement("a");
        anchor.href = result.url;
        anchor.download = result.fileName;
        anchor.rel = "noopener noreferrer";
        window.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      toast.success(print ? "Print-ready PDF opened" : "PDF export ready");
    } catch (error) {
      toastError(error, print ? "Print preparation failed" : "PDF export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleCreateSigningCopy = async () => {
    setCreatingSigningCopy(true);
    try {
      syncFromEditor();
      const saved = Boolean(await persist());
      if (!saved) return;
      const result = await signingCopyFn({ data: { documentId: document.id } });
      window.location.assign(
        `/dashboard/signing?create=1&document=${encodeURIComponent(result.document.id)}&title=${encodeURIComponent(result.document.title)}`,
      );
      toast.success("Signing copy created — continue with participants and fields");
    } catch (error) {
      toastError(error, "Signing copy creation failed");
    } finally {
      setCreatingSigningCopy(false);
    }
  };

  const restoreVersion = async (versionId: string) => {
    setRestoringVersionId(versionId);
    try {
      const restored = await restoreFn({
        data: {
          documentId: document.id,
          versionId,
          expectedEditorVersion: latestEditorVersionRef.current,
        },
      });
      const next = normalizeNativeDocumentContent(restored.content);
      latestEditorVersionRef.current = restored.editor_version;
      setEditorVersion(restored.editor_version);
      applyContentToEditor(next);
      setSaveState("saved");
      onDocumentUpdated?.(restored);
      await refetchVersions();
      toast.success("Document version restored");
    } catch (error) {
      toastError(error, "Version restore failed");
    } finally {
      setRestoringVersionId(null);
    }
  };

  const createVersion = async () => {
    syncFromEditor();
    const result = await persist({
      createVersion: true,
      versionTitle: versionTitle || `Version ${new Date().toLocaleString()}`,
      changeSummary: versionSummary,
    });
    if (!result) return;
    setVersionDialogOpen(false);
    setVersionTitle("");
    setVersionSummary("");
    toast.success("Version snapshot created");
  };

  const applyLink = () => {
    const href = linkUrl.trim();
    if (!/^(https?:\/\/|mailto:)/i.test(href)) {
      toast.error("Use an http(s) or mailto link");
      return;
    }
    const selection = window.getSelection();
    if (selection && savedRangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
    exec("createLink", href);
    setLinkOpen(false);
    setLinkUrl("");
  };

  const findFirst = () => {
    const root = editorRef.current;
    const query = findText.trim().toLowerCase();
    if (!root || !query) return false;
    const walker = window.document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent ?? "";
      const index = text.toLowerCase().indexOf(query);
      if (index >= 0) {
        const range = window.document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + query.length);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        (node.parentElement as HTMLElement | null)?.scrollIntoView({ block: "center" });
        return true;
      }
      node = walker.nextNode();
    }
    toast.info("No match found");
    return false;
  };

  const replaceAll = () => {
    const root = editorRef.current;
    const query = findText.trim();
    if (!root || !query) return;
    const walker = window.document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      if (node instanceof Text) textNodes.push(node);
      node = walker.nextNode();
    }
    let replacements = 0;
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    textNodes.forEach((textNode) => {
      const before = textNode.data;
      const after = before.replace(pattern, () => {
        replacements += 1;
        return replaceText;
      });
      if (after !== before) textNode.data = after;
    });
    if (replacements > 0) syncFromEditor();
    toast.success(`${replacements} replacement${replacements === 1 ? "" : "s"}`);
  };

  const marginPx = {
    top: content.page.margins.top * 3.78,
    right: content.page.margins.right * 3.78,
    bottom: content.page.margins.bottom * 3.78,
    left: content.page.margins.left * 3.78,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100 dark:bg-slate-950">
      <div className="border-b bg-white px-3 py-2 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void handleRename()}
            className="h-8 min-w-[220px] max-w-md flex-1 border-transparent bg-transparent px-2 text-base font-semibold shadow-none hover:border-input focus:border-input"
            aria-label="Document title"
          />
          <span
            className={`rounded-full px-2 py-1 text-[11px] font-medium ${
              saveState === "conflict" || saveState === "error"
                ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                : saveState === "dirty"
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
            }`}
          >
            {saveStateLabel(saveState)}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {wordCount.toLocaleString()} words • v{editorVersion}
            {lastSavedAt
              ? ` • ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              syncFromEditor();
              void persist();
            }}
            disabled={saveState === "saving" || saveState === "conflict"}
          >
            {saveState === "saving" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                File <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setVersionDialogOpen(true)}>
                <Save className="mr-2 h-4 w-4" /> Save version
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
                <History className="mr-2 h-4 w-4" /> Version history
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={exporting || saveState === "saving" || saveState === "conflict"}
                onClick={() => void handleExport(false)}
              >
                <FileDown className="mr-2 h-4 w-4" /> Export PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={exporting || saveState === "saving" || saveState === "conflict"}
                onClick={() => void handleExport(true)}
              >
                <Printer className="mr-2 h-4 w-4" /> Print
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={
                  creatingSigningCopy ||
                  exporting ||
                  saveState === "saving" ||
                  saveState === "conflict"
                }
                onClick={() => void handleCreateSigningCopy()}
              >
                <FileSignature className="mr-2 h-4 w-4" /> Send for signature
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1 border-t pt-2">
          <ToolbarButton label="Undo" onPress={() => exec("undo")}>
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Redo" onPress={() => exec("redo")}>
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton label="Heading 1" onPress={() => exec("formatBlock", "H1")}>
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Heading 2" onPress={() => exec("formatBlock", "H2")}>
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Heading 3" onPress={() => exec("formatBlock", "H3")}>
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Paragraph" onPress={() => exec("formatBlock", "P")}>
            <PanelTop className="h-4 w-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton label="Bold" onPress={() => exec("bold")}>
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Italic" onPress={() => exec("italic")}>
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Underline" onPress={() => exec("underline")}>
            <Underline className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Strikethrough" onPress={() => exec("strikeThrough")}>
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <label
            className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
            title="Text color"
          >
            <span className="text-sm font-bold">A</span>
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => exec("foreColor", event.target.value)}
            />
          </label>
          <label
            className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
            title="Highlight color"
          >
            <span className="rounded bg-yellow-200 px-1 text-xs text-slate-900">A</span>
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => exec("hiliteColor", event.target.value)}
            />
          </label>
          <ToolbarButton label="Link" onPress={() => setLinkOpen(true)}>
            <Link2 className="h-4 w-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton label="Align left" onPress={() => exec("justifyLeft")}>
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Align center" onPress={() => exec("justifyCenter")}>
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Align right" onPress={() => exec("justifyRight")}>
            <AlignRight className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Justify" onPress={() => exec("justifyFull")}>
            <AlignJustify className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Decrease indent" onPress={() => adjustIndent(-1)}>
            <IndentDecrease className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Increase indent" onPress={() => adjustIndent(1)}>
            <IndentIncrease className="h-4 w-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton label="Bulleted list" onPress={() => exec("insertUnorderedList")}>
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Numbered list" onPress={() => exec("insertOrderedList")}>
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Quote" onPress={() => exec("formatBlock", "BLOCKQUOTE")}>
            <Quote className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton label="Horizontal rule" onPress={() => exec("insertHorizontalRule")}>
            <Minus className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Insert table"
            onPress={() =>
              insertHtml(
                "<table><tbody><tr><td>Heading 1</td><td>Heading 2</td></tr><tr><td>Cell</td><td>Cell</td></tr></tbody></table><p><br></p>",
              )
            }
          >
            <Table2 className="h-4 w-4" />
          </ToolbarButton>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() =>
              insertHtml(
                '<div data-page-break="true" contenteditable="false"><span>Page break</span></div><p><br></p>',
              )
            }
          >
            Page break
          </Button>
          <ToolbarButton label="Find and replace" onPress={() => setFindOpen((open) => !open)}>
            <Search className="h-4 w-4" />
          </ToolbarButton>
        </div>

        {findOpen && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
            <Input
              value={findText}
              onChange={(event) => setFindText(event.target.value)}
              placeholder="Find"
              className="h-8 w-48"
            />
            <Input
              value={replaceText}
              onChange={(event) => setReplaceText(event.target.value)}
              placeholder="Replace with"
              className="h-8 w-48"
            />
            <Button variant="outline" size="sm" onClick={findFirst}>
              Find
            </Button>
            <Button variant="outline" size="sm" onClick={replaceAll}>
              Replace all
            </Button>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r bg-white p-4 dark:bg-slate-900 xl:block">
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold">Page setup</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Stored in the canonical document JSON and used by PDF export.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="page-size">Page size</Label>
              <select
                id="page-size"
                value={content.page.size}
                onChange={(event) =>
                  updatePage({ size: event.target.value === "LETTER" ? "LETTER" : "A4" })
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="A4">A4</option>
                <option value="LETTER">Letter</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="orientation">Orientation</Label>
              <select
                id="orientation"
                value={content.page.orientation}
                onChange={(event) =>
                  updatePage({
                    orientation: event.target.value === "landscape" ? "landscape" : "portrait",
                  })
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="letterhead">Letterhead</Label>
              <select
                id="letterhead"
                value={document.letterhead_id ?? ""}
                onChange={async (event) => {
                  try {
                    const updated = await letterheadFn({
                      data: { documentId: document.id, letterheadId: event.target.value || null },
                    });
                    onDocumentUpdated?.(updated);
                    toast.success("Letterhead updated");
                  } catch (error) {
                    toastError(error, "Letterhead update failed");
                  }
                }}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">None</option>
                {(letterheads ?? []).map((letterhead) => (
                  <option key={letterhead.id} value={letterhead.id}>
                    {letterhead.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <div key={side} className="space-y-1">
                  <Label className="capitalize">{side} mm</Label>
                  <Input
                    type="number"
                    min={5}
                    max={60}
                    value={content.page.margins[side]}
                    onChange={(event) =>
                      updatePage({
                        margins: {
                          ...content.page.margins,
                          [side]: Number(event.target.value) || 20,
                        },
                      })
                    }
                    className="h-8"
                  />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Header</Label>
              <Textarea
                rows={2}
                value={content.page.header}
                onChange={(event) => updatePage({ header: event.target.value })}
                placeholder="Optional document header"
              />
            </div>
            <div className="space-y-2">
              <Label>Footer</Label>
              <Textarea
                rows={2}
                value={content.page.footer}
                onChange={(event) => updatePage({ footer: event.target.value })}
                placeholder="Optional document footer"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={content.page.showPageNumbers}
                onChange={(event) => updatePage({ showPageNumbers: event.target.checked })}
              />
              Show page numbers
            </label>
          </div>
        </aside>

        <div className="min-w-0 flex-1 overflow-auto p-4 sm:p-8">
          <div className="mb-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => setZoom((value) => Math.max(75, value - 25))}
            >
              −
            </Button>
            <span className="w-12 text-center">{zoom}%</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => setZoom((value) => Math.min(150, value + 25))}
            >
              +
            </Button>
          </div>
          <div
            className="mx-auto origin-top transition-transform"
            style={{ width: orientedWidth, transform: `scale(${zoom / 100})` }}
          >
            <div
              className="native-document-page relative mx-auto bg-white text-slate-950 shadow-xl ring-1 ring-slate-200"
              style={{ width: orientedWidth, minHeight: orientedHeight }}
            >
              {(content.page.header || document.letterhead_id) && (
                <div className="absolute left-0 right-0 top-0 border-b px-8 py-3 text-[11px] text-slate-500">
                  {content.page.header || "Workspace letterhead"}
                </div>
              )}
              <div
                ref={editorRef}
                contentEditable={saveState !== "conflict"}
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label="Document editor"
                spellCheck
                onInput={syncFromEditor}
                className="native-document-editor min-h-full outline-none [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-xl [&_h3]:font-semibold [&_hr]:my-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-8 [&_p]:my-2 [&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-8 [&_[data-page-break]]:my-8 [&_[data-page-break]]:flex [&_[data-page-break]]:items-center [&_[data-page-break]]:gap-3 [&_[data-page-break]]:text-xs [&_[data-page-break]]:font-medium [&_[data-page-break]]:uppercase [&_[data-page-break]]:tracking-wide [&_[data-page-break]]:text-slate-400 [&_[data-page-break]]:before:h-px [&_[data-page-break]]:before:flex-1 [&_[data-page-break]]:before:bg-slate-300 [&_[data-page-break]]:after:h-px [&_[data-page-break]]:after:flex-1 [&_[data-page-break]]:after:bg-slate-300"
                style={{
                  paddingTop: marginPx.top,
                  paddingRight: marginPx.right,
                  paddingBottom: marginPx.bottom,
                  paddingLeft: marginPx.left,
                }}
              />
              {(content.page.footer || content.page.showPageNumbers) && (
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t px-8 py-3 text-[11px] text-slate-500">
                  <span>{content.page.footer}</span>
                  {content.page.showPageNumbers && (
                    <span>PDF page numbers generated on export</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {saveState === "conflict" && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          Editing is paused because another session saved a newer version. Reload this document
          before making more changes.
        </div>
      )}

      <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save version snapshot</DialogTitle>
            <DialogDescription>
              Create an immutable structured snapshot before a major change or review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Version title</Label>
              <Input
                value={versionTitle}
                onChange={(event) => setVersionTitle(event.target.value)}
                placeholder="e.g. Review draft"
              />
            </div>
            <div className="space-y-2">
              <Label>Change summary</Label>
              <Textarea
                rows={3}
                value={versionSummary}
                onChange={(event) => setVersionSummary(event.target.value)}
                placeholder="What changed in this version?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void createVersion()} disabled={saveState === "saving"}>
              {saveState === "saving" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
              snapshot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>
              Immutable native-document snapshots. Restoring creates an automatic backup of the
              current content first.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
            {(versions ?? []).length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No saved versions yet. Use “Save version” to create the first snapshot.
              </div>
            ) : (
              (versions ?? []).map((version) => (
                <div
                  key={version.id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      v{version.version_number} {version.title ? `— ${version.title}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(version.created_at).toLocaleString()} • {version.word_count ?? 0}{" "}
                      words
                    </p>
                    {version.change_summary && (
                      <p className="mt-2 text-sm text-muted-foreground">{version.change_summary}</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restoringVersionId === version.id}
                    onClick={() => void restoreVersion(version.id)}
                  >
                    {restoringVersionId === version.id && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Restore
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add link</DialogTitle>
            <DialogDescription>
              Apply a web or email link to the current text selection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>URL</Label>
            <Input
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://example.com"
              onKeyDown={(event) => {
                if (event.key === "Enter") applyLink();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyLink}>Apply link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {exporting && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" /> Rendering canonical PDF…
        </div>
      )}
    </div>
  );
}
