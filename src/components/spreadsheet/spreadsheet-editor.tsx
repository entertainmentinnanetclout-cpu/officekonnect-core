import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  ArrowUpAZ,
  Bold,
  BorderAll,
  ChevronDown,
  Columns3,
  FileDown,
  FileSignature,
  Filter,
  Italic,
  Loader2,
  Merge,
  MoveLeft,
  MoveRight,
  Plus,
  Printer,
  Rows3,
  Save,
  Scissors,
  Search,
  Trash2,
  Underline,
  X,
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { renameDocument } from "@/lib/documents.functions";
import {
  createSpreadsheetSigningCopy,
  exportSpreadsheetPdf,
  restoreSpreadsheetVersion,
  saveSpreadsheet,
} from "@/lib/spreadsheets.functions";
import {
  addSheet,
  cellAddress,
  clearRange,
  columnIndexToLabel,
  deleteSheet,
  evaluateWorkbook,
  fillRange,
  formatWorkbookValue,
  getCell,
  getCellInput,
  matrixFromSheet,
  mergeForCell,
  moveSheet,
  normalizeWorkbookContent,
  parseRange,
  pasteInputMatrix,
  rangeFromPositions,
  rangeToInputMatrix,
  renameSheet,
  setWorkbookSheet,
  sheetUsedRange,
  sortRange,
  toggleMerge,
  updateCellFormat,
  updateCellInput,
  workbookMetrics,
  type CellNumberFormat,
  type CellPosition,
  type CellRange,
  type WorkbookContent,
  type WorkbookSheet,
} from "@/lib/spreadsheet";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";

interface SpreadsheetEditorProps {
  document: Tables<"documents">;
  onDocumentUpdated?: (document: Tables<"documents">) => void;
}

type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error";

const MAX_RENDER_ROWS = 500;
const MAX_RENDER_COLUMNS = 60;

function saveStateLabel(state: SaveState) {
  if (state === "saving") return "Saving…";
  if (state === "dirty") return "Unsaved changes";
  if (state === "conflict") return "Edit conflict";
  if (state === "error") return "Save failed";
  return "Saved";
}

function safeName(title: string, extension: string) {
  const base = title.replace(/\.[^.]+$/, "").trim() || "OfficeKonnect Sheet";
  return `${base.replace(/[\\/:*?"<>|]+/g, "-")}.${extension}`;
}

function downloadText(text: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function rangeLabel(range: CellRange) {
  const start = cellAddress(range.start.row, range.start.column);
  const end = cellAddress(range.end.row, range.end.column);
  return start === end ? start : `${start}:${end}`;
}

function parseClipboard(text: string) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((row) => row.split("\t"));
}

function SpreadsheetEditor({ document, onDocumentUpdated }: SpreadsheetEditorProps) {
  const savingRef = useRef(false);
  const hydratedDocumentIdRef = useRef<string | null>(null);
  const latestWorkbookRef = useRef<WorkbookContent>(normalizeWorkbookContent(document.content));
  const latestEditorVersionRef = useRef(document.editor_version);
  const rootRef = useRef<HTMLDivElement>(null);
  const mouseSelectingRef = useRef(false);
  const fileMenuExportingRef = useRef(false);

  const [workbook, setWorkbook] = useState(() => normalizeWorkbookContent(document.content));
  const [title, setTitle] = useState(document.title);
  const [editorVersion, setEditorVersion] = useState(document.editor_version);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(new Date(document.updated_at));
  const [selectionAnchor, setSelectionAnchor] = useState<CellPosition>({ row: 1, column: 1 });
  const [selectionFocus, setSelectionFocus] = useState<CellPosition>({ row: 1, column: 1 });
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [versionTitle, setVersionTitle] = useState("");
  const [versionSummary, setVersionSummary] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [renameSheetId, setRenameSheetId] = useState<string | null>(null);
  const [renameSheetValue, setRenameSheetValue] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [renderRowLimit, setRenderRowLimit] = useState(MAX_RENDER_ROWS);
  const [renderColumnLimit, setRenderColumnLimit] = useState(MAX_RENDER_COLUMNS);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfSheetIds, setPdfSheetIds] = useState<string[]>(() =>
    workbook.sheets.map((sheet) => sheet.id),
  );
  const [pdfBusy, setPdfBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [signingCopyBusy, setSigningCopyBusy] = useState(false);

  const saveFn = useServerFn(saveSpreadsheet);
  const renameFn = useServerFn(renameDocument);
  const restoreFn = useServerFn(restoreSpreadsheetVersion);
  const exportPdfFn = useServerFn(exportSpreadsheetPdf);
  const signingCopyFn = useServerFn(createSpreadsheetSigningCopy);

  const activeSheet =
    workbook.sheets.find((sheet) => sheet.id === workbook.activeSheetId) ?? workbook.sheets[0]!;
  const selectionRange = useMemo(
    () => rangeFromPositions(selectionAnchor, selectionFocus),
    [selectionAnchor, selectionFocus],
  );
  const activeAddress = cellAddress(selectionFocus.row, selectionFocus.column);
  const activeCell = getCell(activeSheet, activeAddress);
  const evaluated = useMemo(() => evaluateWorkbook(workbook), [workbook]);
  const metrics = useMemo(() => workbookMetrics(workbook), [workbook]);

  const { data: versions, refetch: refetchVersions } = useQuery({
    queryKey: ["spreadsheet-versions", document.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_versions")
        .select(
          "id,version_number,title,change_summary,created_at,sheet_count,cell_count,formula_count,content",
        )
        .eq("document_id", document.id)
        .not("content", "is", null)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const applyWorkbook = useCallback((next: WorkbookContent, dirty = true) => {
    latestWorkbookRef.current = next;
    setWorkbook(next);
    if (dirty) setSaveState((state) => (state === "conflict" ? state : "dirty"));
  }, []);

  useEffect(() => {
    setTitle(document.title);
    const initial = hydratedDocumentIdRef.current !== document.id;
    const newer = document.editor_version > latestEditorVersionRef.current;
    if (!initial && (!newer || saveState !== "saved")) return;
    const next = normalizeWorkbookContent(document.content);
    latestWorkbookRef.current = next;
    setWorkbook(next);
    hydratedDocumentIdRef.current = document.id;
    latestEditorVersionRef.current = document.editor_version;
    setEditorVersion(document.editor_version);
    setLastSavedAt(new Date(document.updated_at));
    setSaveState("saved");
    setPdfSheetIds(next.sheets.map((sheet) => sheet.id));
  }, [
    document.id,
    document.content,
    document.editor_version,
    document.title,
    document.updated_at,
    saveState,
  ]);

  const persist = useCallback(
    async (options?: {
      createVersion?: boolean;
      versionTitle?: string;
      changeSummary?: string;
    }) => {
      if (savingRef.current || saveState === "conflict") return null;
      savingRef.current = true;
      setSaveState("saving");
      const snapshot = latestWorkbookRef.current;
      const snapshotJson = JSON.stringify(snapshot);
      try {
        const result = await saveFn({
          data: {
            documentId: document.id,
            expectedEditorVersion: latestEditorVersionRef.current,
            content: snapshot,
            createVersion: options?.createVersion,
            versionTitle: options?.versionTitle,
            changeSummary: options?.changeSummary,
          },
        });
        latestEditorVersionRef.current = result.editor_version;
        setEditorVersion(result.editor_version);
        setLastSavedAt(new Date(result.updated_at));
        onDocumentUpdated?.(result);
        setSaveState(
          JSON.stringify(latestWorkbookRef.current) === snapshotJson ? "saved" : "dirty",
        );
        if (options?.createVersion) await refetchVersions();
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/changed in another session|editor version/i.test(message)) {
          setSaveState("conflict");
          toast.error("This spreadsheet changed in another session. Reload before continuing.");
        } else {
          setSaveState("error");
          toastError(error, "Spreadsheet save failed");
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
  }, [persist, saveState, workbook]);

  useEffect(() => {
    const release = () => {
      mouseSelectingRef.current = false;
    };
    window.addEventListener("mouseup", release);
    return () => window.removeEventListener("mouseup", release);
  }, []);

  const updateActiveSheet = (next: WorkbookSheet) =>
    applyWorkbook(setWorkbookSheet(latestWorkbookRef.current, next));

  const commitEdit = (move?: { row: number; column: number }) => {
    if (!editingAddress) return;
    const nextSheet = updateCellInput(activeSheet, editingAddress, editValue);
    updateActiveSheet(nextSheet);
    setEditingAddress(null);
    if (move) {
      const nextPosition = {
        row: Math.max(1, Math.min(nextSheet.rowCount, move.row)),
        column: Math.max(1, Math.min(nextSheet.columnCount, move.column)),
      };
      setSelectionAnchor(nextPosition);
      setSelectionFocus(nextPosition);
      window.setTimeout(
        () =>
          rootRef.current
            ?.querySelector<HTMLInputElement>(
              `[data-cell="${cellAddress(nextPosition.row, nextPosition.column)}"]`,
            )
            ?.focus(),
        0,
      );
    }
  };

  const beginCellEdit = (position: CellPosition) => {
    const address = cellAddress(position.row, position.column);
    setSelectionAnchor(position);
    setSelectionFocus(position);
    setEditingAddress(address);
    setEditValue(getCellInput(activeSheet, address));
  };

  const handleCellMouseDown = (position: CellPosition, event: ReactMouseEvent) => {
    if (event.shiftKey) setSelectionFocus(position);
    else {
      setSelectionAnchor(position);
      setSelectionFocus(position);
    }
    mouseSelectingRef.current = true;
  };

  const handleCellMouseEnter = (position: CellPosition) => {
    if (mouseSelectingRef.current && editingAddress === null) setSelectionFocus(position);
  };

  const handleCellKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    position: CellPosition,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit({ row: position.row + (event.shiftKey ? -1 : 1), column: position.column });
    } else if (event.key === "Tab") {
      event.preventDefault();
      commitEdit({ row: position.row, column: position.column + (event.shiftKey ? -1 : 1) });
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditingAddress(null);
      setEditValue("");
    }
  };

  const applyFormat = (patch: Parameters<typeof updateCellFormat>[2]) =>
    updateActiveSheet(updateCellFormat(activeSheet, selectionRange, patch));

  const handleCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    if (editingAddress) return;
    const matrix = rangeToInputMatrix(activeSheet, selectionRange);
    event.clipboardData.setData("text/plain", matrix.map((row) => row.join("\t")).join("\n"));
    event.preventDefault();
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (editingAddress) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    updateActiveSheet(pasteInputMatrix(activeSheet, selectionRange.start, parseClipboard(text)));
    event.preventDefault();
  };

  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editingAddress) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void persist();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      updateActiveSheet(fillRange(activeSheet, selectionRange, "down"));
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
      event.preventDefault();
      updateActiveSheet(fillRange(activeSheet, selectionRange, "right"));
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      updateActiveSheet(clearRange(activeSheet, selectionRange, "contents"));
      return;
    }
    const delta =
      event.key === "ArrowUp"
        ? { row: -1, column: 0 }
        : event.key === "ArrowDown"
          ? { row: 1, column: 0 }
          : event.key === "ArrowLeft"
            ? { row: 0, column: -1 }
            : event.key === "ArrowRight"
              ? { row: 0, column: 1 }
              : null;
    if (delta) {
      event.preventDefault();
      const next = {
        row: Math.max(1, Math.min(activeSheet.rowCount, selectionFocus.row + delta.row)),
        column: Math.max(
          1,
          Math.min(activeSheet.columnCount, selectionFocus.column + delta.column),
        ),
      };
      if (event.shiftKey) setSelectionFocus(next);
      else {
        setSelectionAnchor(next);
        setSelectionFocus(next);
      }
    }
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
      toast.success("Spreadsheet renamed");
    } catch (error) {
      setTitle(document.title);
      toastError(error, "Rename failed");
    }
  };

  const exportXlsx = async () => {
    if (fileMenuExportingRef.current) return;
    fileMenuExportingRef.current = true;
    setFileBusy(true);
    try {
      const saved = await persist();
      if (!saved) return;
      const XLSX = await import("xlsx");
      const book = XLSX.utils.book_new();
      const values = evaluateWorkbook(latestWorkbookRef.current);
      for (const sheet of latestWorkbookRef.current.sheets) {
        const worksheet = XLSX.utils.aoa_to_sheet(matrixFromSheet(sheet, values));
        for (const [address, cell] of Object.entries(sheet.cells)) {
          if (!cell.formula) continue;
          const target = worksheet[address] ?? {
            t: "n",
            v: values.bySheet[sheet.id]?.[address] ?? 0,
          };
          target.f = cell.formula.replace(/^=/, "");
          worksheet[address] = target;
        }
        worksheet["!cols"] = Array.from(
          { length: sheetUsedRange(sheet).end.column },
          (_, index) => ({
            wpx: sheet.columnWidths[columnIndexToLabel(index + 1)] ?? 112,
          }),
        );
        worksheet["!merges"] = sheet.merges
          .map((merge) => XLSX.utils.decode_range(merge.range))
          .filter(Boolean);
        XLSX.utils.book_append_sheet(book, worksheet, sheet.name.slice(0, 31));
      }
      XLSX.writeFile(book, safeName(title, "xlsx"), { compression: true });
      toast.success("XLSX export ready");
    } catch (error) {
      toastError(error, "XLSX export failed");
    } finally {
      fileMenuExportingRef.current = false;
      setFileBusy(false);
    }
  };

  const exportCsv = async () => {
    setFileBusy(true);
    try {
      const saved = await persist();
      if (!saved) return;
      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.aoa_to_sheet(matrixFromSheet(activeSheet, evaluated));
      downloadText(
        XLSX.utils.sheet_to_csv(worksheet),
        safeName(`${title} - ${activeSheet.name}`, "csv"),
        "text/csv;charset=utf-8",
      );
      toast.success("CSV export ready");
    } catch (error) {
      toastError(error, "CSV export failed");
    } finally {
      setFileBusy(false);
    }
  };

  const exportPdf = async (print: boolean) => {
    setPdfBusy(true);
    try {
      const saved = await persist();
      if (!saved) return;
      const result = await exportPdfFn({
        data: { documentId: document.id, sheetIds: pdfSheetIds },
      });
      if (print) window.open(result.url, "_blank", "noopener,noreferrer");
      else {
        const anchor = window.document.createElement("a");
        anchor.href = result.url;
        anchor.download = result.fileName;
        anchor.rel = "noopener noreferrer";
        window.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      toast.success(print ? "Print-ready PDF opened" : "Spreadsheet PDF ready");
      setPdfOpen(false);
    } catch (error) {
      toastError(error, print ? "Print preparation failed" : "PDF export failed");
    } finally {
      setPdfBusy(false);
    }
  };

  const createSigningCopy = async () => {
    setSigningCopyBusy(true);
    try {
      const saved = await persist();
      if (!saved) return;
      const result = await signingCopyFn({
        data: { documentId: document.id, sheetIds: pdfSheetIds },
      });
      window.open(`/dashboard/documents/${result.document.id}`, "_blank", "noopener,noreferrer");
      toast.success("Immutable spreadsheet signing copy created");
    } catch (error) {
      toastError(error, "Signing copy creation failed");
    } finally {
      setSigningCopyBusy(false);
    }
  };

  const createVersion = async () => {
    const result = await persist({
      createVersion: true,
      versionTitle: versionTitle || `Version ${new Date().toLocaleString()}`,
      changeSummary: versionSummary,
    });
    if (!result) return;
    setVersionDialogOpen(false);
    setVersionTitle("");
    setVersionSummary("");
    toast.success("Spreadsheet version created");
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
      const next = normalizeWorkbookContent(restored.content);
      latestWorkbookRef.current = next;
      setWorkbook(next);
      latestEditorVersionRef.current = restored.editor_version;
      setEditorVersion(restored.editor_version);
      setSaveState("saved");
      onDocumentUpdated?.(restored);
      await refetchVersions();
      toast.success("Spreadsheet version restored");
    } catch (error) {
      toastError(error, "Version restore failed");
    } finally {
      setRestoringVersionId(null);
    }
  };

  const commitSheetRename = () => {
    if (!renameSheetId) return;
    const next = renameSheet(latestWorkbookRef.current, renameSheetId, renameSheetValue);
    if (next === latestWorkbookRef.current) {
      toast.error("Worksheet names must be unique and non-empty");
      return;
    }
    applyWorkbook(next);
    setRenameSheetId(null);
    setRenameSheetValue("");
  };

  const visibleRows = useMemo(() => {
    const total = Math.min(activeSheet.rowCount, renderRowLimit);
    const rows = Array.from({ length: total }, (_, index) => index + 1);
    if (!filterText.trim()) return rows;
    const query = filterText.trim().toLowerCase();
    return rows.filter((row) => {
      const address = cellAddress(row, selectionFocus.column);
      const value =
        evaluated.bySheet[activeSheet.id]?.[address] ?? getCell(activeSheet, address)?.value ?? "";
      return String(value).toLowerCase().includes(query);
    });
  }, [activeSheet, evaluated, filterText, renderRowLimit, selectionFocus.column]);

  const visibleColumns = useMemo(
    () =>
      Array.from(
        { length: Math.min(activeSheet.columnCount, renderColumnLimit) },
        (_, index) => index + 1,
      ),
    [activeSheet.columnCount, renderColumnLimit],
  );

  const selectedCellStyle = activeCell?.format ?? {};
  const selectedRangeText = rangeLabel(selectionRange);
  const formulaBarValue =
    editingAddress === activeAddress ? editValue : getCellInput(activeSheet, activeAddress);
  const usedRange = sheetUsedRange(activeSheet);
  const selectedColumnLabel = columnIndexToLabel(selectionFocus.column);
  const selectedColumnWidth = activeSheet.columnWidths[selectedColumnLabel] ?? 112;
  const selectedRowHeight = activeSheet.rowHeights[String(selectionFocus.row)] ?? 30;
  const frozenColumnOffsets = useMemo(() => {
    const offsets: Record<number, number> = {};
    let left = 48;
    for (let column = 1; column <= activeSheet.frozenColumns; column += 1) {
      offsets[column] = left;
      left += activeSheet.columnWidths[columnIndexToLabel(column)] ?? 112;
    }
    return offsets;
  }, [activeSheet.columnWidths, activeSheet.frozenColumns]);
  const frozenRowOffsets = useMemo(() => {
    const offsets: Record<number, number> = {};
    let top = 28;
    for (let row = 1; row <= activeSheet.frozenRows; row += 1) {
      offsets[row] = top;
      top += activeSheet.rowHeights[String(row)] ?? 30;
    }
    return offsets;
  }, [activeSheet.frozenRows, activeSheet.rowHeights]);

  return (
    <div
      ref={rootRef}
      className="flex min-h-0 flex-1 flex-col bg-slate-100 dark:bg-slate-950"
      tabIndex={-1}
      onKeyDown={handleGridKeyDown}
      onCopy={handleCopy}
      onPaste={handlePaste}
    >
      <div className="shrink-0 border-b bg-white dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void handleRename()}
            className="h-8 min-w-[210px] max-w-md flex-1 border-transparent bg-transparent px-2 text-base font-semibold shadow-none hover:border-input focus:border-input"
            aria-label="Spreadsheet title"
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
          <span className="hidden text-xs text-muted-foreground lg:inline">
            {metrics.cellCount.toLocaleString()} cells · {metrics.formulaCount.toLocaleString()}{" "}
            formulas · v{editorVersion}
            {lastSavedAt
              ? ` · ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={saveState === "saving" || saveState === "conflict"}
            onClick={() => void persist()}
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
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Spreadsheet</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setVersionDialogOpen(true)}>
                <Save className="mr-2 h-4 w-4" /> Save version
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
                Version history
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={fileBusy} onClick={() => void exportXlsx()}>
                <FileDown className="mr-2 h-4 w-4" /> Export XLSX
              </DropdownMenuItem>
              <DropdownMenuItem disabled={fileBusy} onClick={() => void exportCsv()}>
                <FileDown className="mr-2 h-4 w-4" /> Export active sheet CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPdfOpen(true)}>
                <Printer className="mr-2 h-4 w-4" /> PDF / Print
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={signingCopyBusy || saveState === "conflict"}
                onClick={() => void createSigningCopy()}
              >
                <FileSignature className="mr-2 h-4 w-4" /> Create signing copy
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-1 border-t px-3 py-1.5">
          <Button
            variant={selectedCellStyle.bold ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            title="Bold"
            onClick={() => applyFormat({ bold: !selectedCellStyle.bold })}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant={selectedCellStyle.italic ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            title="Italic"
            onClick={() => applyFormat({ italic: !selectedCellStyle.italic })}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant={selectedCellStyle.underline ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            title="Underline"
            onClick={() => applyFormat({ underline: !selectedCellStyle.underline })}
          >
            <Underline className="h-4 w-4" />
          </Button>
          <Button
            variant={selectedCellStyle.border ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            title="Borders"
            onClick={() => applyFormat({ border: !selectedCellStyle.border })}
          >
            <BorderAll className="h-4 w-4" />
          </Button>
          <label
            className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
            title="Text color"
          >
            <span className="text-sm font-bold">A</span>
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={selectedCellStyle.textColor ?? "#111827"}
              onChange={(event) => applyFormat({ textColor: event.target.value })}
            />
          </label>
          <label
            className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
            title="Fill color"
          >
            <span
              className="h-4 w-4 rounded border"
              style={{ backgroundColor: selectedCellStyle.backgroundColor ?? "#ffffff" }}
            />
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={selectedCellStyle.backgroundColor ?? "#ffffff"}
              onChange={(event) => applyFormat({ backgroundColor: event.target.value })}
            />
          </label>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button
            variant={selectedCellStyle.horizontalAlign === "left" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            title="Align left"
            onClick={() => applyFormat({ horizontalAlign: "left" })}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={selectedCellStyle.horizontalAlign === "center" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            title="Align center"
            onClick={() => applyFormat({ horizontalAlign: "center" })}
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            variant={selectedCellStyle.horizontalAlign === "right" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            title="Align right"
            onClick={() => applyFormat({ horizontalAlign: "right" })}
          >
            <AlignRight className="h-4 w-4" />
          </Button>
          <select
            value={selectedCellStyle.numberFormat ?? "general"}
            onChange={(event) =>
              applyFormat({ numberFormat: event.target.value as CellNumberFormat })
            }
            className="h-8 rounded-md border bg-background px-2 text-xs"
            title="Number format"
          >
            <option value="general">General</option>
            <option value="number">Number</option>
            <option value="currency">Currency</option>
            <option value="percent">Percent</option>
            <option value="date">Date</option>
            <option value="text">Text</option>
          </select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Merge / unmerge selection"
            onClick={() => updateActiveSheet(toggleMerge(activeSheet, selectionRange))}
          >
            <Merge className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Sort selected rows ascending"
            onClick={() =>
              updateActiveSheet(
                sortRange(
                  activeSheet,
                  selectionRange.start.row === selectionRange.end.row ? usedRange : selectionRange,
                  selectionFocus.column,
                  "asc",
                  evaluated,
                ),
              )
            }
          >
            <ArrowDownAZ className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Sort selected rows descending"
            onClick={() =>
              updateActiveSheet(
                sortRange(
                  activeSheet,
                  selectionRange.start.row === selectionRange.end.row ? usedRange : selectionRange,
                  selectionFocus.column,
                  "desc",
                  evaluated,
                ),
              )
            }
          >
            <ArrowUpAZ className="h-4 w-4" />
          </Button>
          <Button
            variant={filterOpen ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            title="Filter active column"
            onClick={() => setFilterOpen((open) => !open)}
          >
            <Filter className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                More <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => updateActiveSheet(fillRange(activeSheet, selectionRange, "down"))}
              >
                Fill down <span className="ml-auto pl-4 text-xs text-muted-foreground">Ctrl+D</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => updateActiveSheet(fillRange(activeSheet, selectionRange, "right"))}
              >
                Fill right{" "}
                <span className="ml-auto pl-4 text-xs text-muted-foreground">Ctrl+R</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  updateActiveSheet(clearRange(activeSheet, selectionRange, "contents"))
                }
              >
                <Scissors className="mr-2 h-4 w-4" /> Clear contents
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => updateActiveSheet(clearRange(activeSheet, selectionRange, "format"))}
              >
                Clear formatting
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  updateActiveSheet({
                    ...activeSheet,
                    frozenRows: Math.max(0, selectionFocus.row - 1),
                  })
                }
              >
                <Rows3 className="mr-2 h-4 w-4" /> Freeze rows above selection
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  updateActiveSheet({
                    ...activeSheet,
                    frozenColumns: Math.max(0, selectionFocus.column - 1),
                  })
                }
              >
                <Columns3 className="mr-2 h-4 w-4" /> Freeze columns left of selection
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  updateActiveSheet({ ...activeSheet, frozenRows: 0, frozenColumns: 0 })
                }
              >
                Unfreeze panes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2 border-t bg-muted/20 px-3 py-1.5">
          <span className="w-20 shrink-0 rounded border bg-background px-2 py-1 text-center text-xs font-medium">
            {selectedRangeText}
          </span>
          <span className="font-mono text-xs font-semibold text-muted-foreground">fx</span>
          <Input
            value={formulaBarValue}
            onFocus={() => {
              setEditingAddress(activeAddress);
              setEditValue(getCellInput(activeSheet, activeAddress));
            }}
            onChange={(event) => setEditValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitEdit();
              } else if (event.key === "Escape") setEditingAddress(null);
            }}
            onBlur={() => editingAddress === activeAddress && commitEdit()}
            className="h-8 flex-1 font-mono text-xs"
            aria-label={`Formula bar for ${activeAddress}`}
          />
          {filterOpen && (
            <div className="flex items-center gap-1">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={filterText}
                onChange={(event) => setFilterText(event.target.value)}
                placeholder={`Filter ${columnIndexToLabel(selectionFocus.column)}…`}
                className="h-8 w-44 text-xs"
              />
              {filterText && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setFilterText("")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-auto bg-white dark:bg-slate-950">
          <table
            className="border-separate border-spacing-0 text-xs"
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: 48 }} />
              {visibleColumns.map((column) => (
                <col
                  key={column}
                  style={{ width: activeSheet.columnWidths[columnIndexToLabel(column)] ?? 112 }}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 h-7 min-w-12 border-b border-r bg-slate-100 text-[10px] text-muted-foreground dark:bg-slate-900" />
                {visibleColumns.map((column) => (
                  <th
                    key={column}
                    className="sticky top-0 z-20 h-7 min-w-[48px] border-b border-r bg-slate-100 px-2 text-center text-[10px] font-medium text-muted-foreground dark:bg-slate-900"
                    style={
                      column <= activeSheet.frozenColumns
                        ? { left: frozenColumnOffsets[column], zIndex: 31 }
                        : undefined
                    }
                  >
                    {columnIndexToLabel(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row} style={{ height: activeSheet.rowHeights[String(row)] ?? 30 }}>
                  <th
                    className="sticky left-0 z-10 border-b border-r bg-slate-100 px-2 text-right text-[10px] font-medium text-muted-foreground dark:bg-slate-900"
                    style={
                      row <= activeSheet.frozenRows
                        ? { top: frozenRowOffsets[row], zIndex: 30 }
                        : undefined
                    }
                  >
                    {row}
                  </th>
                  {visibleColumns.map((column) => {
                    const position = { row, column };
                    const address = cellAddress(row, column);
                    const merge = mergeForCell(activeSheet, position);
                    if (merge && (merge.start.row !== row || merge.start.column !== column))
                      return null;
                    const selected =
                      row >= selectionRange.start.row &&
                      row <= selectionRange.end.row &&
                      column >= selectionRange.start.column &&
                      column <= selectionRange.end.column;
                    const focused = selectionFocus.row === row && selectionFocus.column === column;
                    const cell = getCell(activeSheet, address);
                    const display = formatWorkbookValue(
                      evaluated.bySheet[activeSheet.id]?.[address] ?? cell?.value ?? null,
                      cell?.format,
                    );
                    const isEditing = editingAddress === address;
                    const colSpan = merge ? merge.end.column - merge.start.column + 1 : 1;
                    const rowSpan = merge ? merge.end.row - merge.start.row + 1 : 1;
                    return (
                      <td
                        key={address}
                        colSpan={colSpan}
                        rowSpan={rowSpan}
                        className={`relative border-b border-r p-0 ${selected ? "bg-blue-50/80 dark:bg-blue-950/30" : "bg-background"} ${focused ? "outline outline-2 outline-offset-[-2px] outline-blue-600" : ""}`}
                        style={{
                          backgroundColor: cell?.format?.backgroundColor,
                          minWidth: activeSheet.columnWidths[columnIndexToLabel(column)] ?? 112,
                          position:
                            row <= activeSheet.frozenRows || column <= activeSheet.frozenColumns
                              ? "sticky"
                              : undefined,
                          top: row <= activeSheet.frozenRows ? frozenRowOffsets[row] : undefined,
                          left:
                            column <= activeSheet.frozenColumns
                              ? frozenColumnOffsets[column]
                              : undefined,
                          zIndex:
                            row <= activeSheet.frozenRows && column <= activeSheet.frozenColumns
                              ? 29
                              : row <= activeSheet.frozenRows || column <= activeSheet.frozenColumns
                                ? 18
                                : undefined,
                        }}
                        onMouseDown={(event) => handleCellMouseDown(position, event)}
                        onMouseEnter={() => handleCellMouseEnter(position)}
                      >
                        <input
                          data-cell={address}
                          value={isEditing ? editValue : display}
                          onFocus={() => beginCellEdit(position)}
                          onChange={(event) => setEditValue(event.target.value)}
                          onBlur={() => isEditing && commitEdit()}
                          onKeyDown={(event) => handleCellKeyDown(event, position)}
                          className="h-full min-h-7 w-full bg-transparent px-1.5 py-1 outline-none"
                          style={{
                            color: cell?.format?.textColor,
                            fontWeight: cell?.format?.bold ? 700 : 400,
                            fontStyle: cell?.format?.italic ? "italic" : "normal",
                            textDecoration:
                              `${cell?.format?.underline ? "underline" : ""} ${cell?.format?.strikethrough ? "line-through" : ""}`.trim() ||
                              undefined,
                            textAlign:
                              cell?.format?.horizontalAlign ??
                              (typeof cell?.value === "number" ? "right" : "left"),
                            border: cell?.format?.border ? "1px solid currentColor" : undefined,
                          }}
                          aria-label={`Cell ${address}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {(activeSheet.rowCount > renderRowLimit ||
            activeSheet.columnCount > renderColumnLimit) && (
            <div className="sticky bottom-2 left-2 m-3 flex w-fit items-center gap-2 rounded-lg border bg-background/95 p-2 text-xs shadow-lg backdrop-blur">
              <span className="text-muted-foreground">Large sheet viewport:</span>
              {activeSheet.rowCount > renderRowLimit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() =>
                    setRenderRowLimit((limit) =>
                      Math.min(activeSheet.rowCount, limit + MAX_RENDER_ROWS),
                    )
                  }
                >
                  Show {Math.min(MAX_RENDER_ROWS, activeSheet.rowCount - renderRowLimit)} more rows
                </Button>
              )}
              {activeSheet.columnCount > renderColumnLimit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() =>
                    setRenderColumnLimit((limit) =>
                      Math.min(activeSheet.columnCount, limit + MAX_RENDER_COLUMNS),
                    )
                  }
                >
                  Show more columns
                </Button>
              )}
            </div>
          )}
        </div>

        <aside className="hidden w-64 shrink-0 overflow-y-auto border-l bg-background p-4 xl:block">
          <h3 className="text-sm font-semibold">Cell geometry</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Resize the selected row or column. Dimensions persist in the workbook.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="selected-column-width">{selectedColumnLabel} width</Label>
              <Input
                id="selected-column-width"
                type="number"
                min={48}
                max={420}
                value={selectedColumnWidth}
                onChange={(event) =>
                  updateActiveSheet({
                    ...activeSheet,
                    columnWidths: {
                      ...activeSheet.columnWidths,
                      [selectedColumnLabel]: Math.max(
                        48,
                        Math.min(420, Number(event.target.value) || 112),
                      ),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="selected-row-height">Row {selectionFocus.row}</Label>
              <Input
                id="selected-row-height"
                type="number"
                min={20}
                max={180}
                value={selectedRowHeight}
                onChange={(event) =>
                  updateActiveSheet({
                    ...activeSheet,
                    rowHeights: {
                      ...activeSheet.rowHeights,
                      [String(selectionFocus.row)]: Math.max(
                        20,
                        Math.min(180, Number(event.target.value) || 30),
                      ),
                    },
                  })
                }
              />
            </div>
          </div>
          <div className="my-4 border-t" />
          <h3 className="text-sm font-semibold">Print setup</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Stored with this worksheet and used by PDF/signing-copy output.
          </p>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Orientation</Label>
              <select
                value={activeSheet.print.orientation}
                onChange={(event) =>
                  updateActiveSheet({
                    ...activeSheet,
                    print: {
                      ...activeSheet.print,
                      orientation: event.target.value === "landscape" ? "landscape" : "portrait",
                    },
                  })
                }
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Scale (%)</Label>
              <Input
                type="number"
                min={25}
                max={200}
                value={activeSheet.print.scale}
                onChange={(event) =>
                  updateActiveSheet({
                    ...activeSheet,
                    print: {
                      ...activeSheet.print,
                      scale: Math.max(25, Math.min(200, Number(event.target.value) || 100)),
                    },
                  })
                }
              />
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Fit to page width</span>
              <input
                type="checkbox"
                checked={activeSheet.print.fitToWidth}
                onChange={(event) =>
                  updateActiveSheet({
                    ...activeSheet,
                    print: { ...activeSheet.print, fitToWidth: event.target.checked },
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Print gridlines</span>
              <input
                type="checkbox"
                checked={activeSheet.print.gridlines}
                onChange={(event) =>
                  updateActiveSheet({
                    ...activeSheet,
                    print: { ...activeSheet.print, gridlines: event.target.checked },
                  })
                }
              />
            </label>
            <div className="space-y-1.5">
              <Label>Print area</Label>
              <Input
                value={activeSheet.print.printArea ?? ""}
                placeholder="A1:H40"
                onChange={(event) =>
                  updateActiveSheet({
                    ...activeSheet,
                    print: {
                      ...activeSheet.print,
                      printArea: event.target.value.toUpperCase() || undefined,
                    },
                  })
                }
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  updateActiveSheet({
                    ...activeSheet,
                    print: { ...activeSheet.print, printArea: selectedRangeText },
                  })
                }
              >
                Use current selection
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>Repeat top rows</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={activeSheet.print.repeatHeaderRows ?? 0}
                onChange={(event) =>
                  updateActiveSheet({
                    ...activeSheet,
                    print: {
                      ...activeSheet.print,
                      repeatHeaderRows:
                        Math.max(0, Math.min(100, Number(event.target.value) || 0)) || undefined,
                    },
                  })
                }
              />
            </div>
            <div>
              <Label>Margins (mm)</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["top", "right", "bottom", "left"] as const).map((side) => (
                  <Input
                    key={side}
                    type="number"
                    min={5}
                    max={50}
                    value={activeSheet.print.margins[side]}
                    aria-label={`${side} margin`}
                    onChange={(event) =>
                      updateActiveSheet({
                        ...activeSheet,
                        print: {
                          ...activeSheet.print,
                          margins: {
                            ...activeSheet.print.margins,
                            [side]: Math.max(5, Math.min(50, Number(event.target.value) || 12.7)),
                          },
                        },
                      })
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t bg-background px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          title="Add worksheet"
          onClick={() => applyWorkbook(addSheet(latestWorkbookRef.current))}
        >
          <Plus className="h-4 w-4" />
        </Button>
        {workbook.sheets.map((sheet) => (
          <DropdownMenu key={sheet.id}>
            <DropdownMenuTrigger asChild>
              <Button
                variant={sheet.id === workbook.activeSheetId ? "secondary" : "ghost"}
                size="sm"
                className="h-7 shrink-0 px-3 text-xs"
                onClick={() => {
                  const next = { ...latestWorkbookRef.current, activeSheetId: sheet.id };
                  latestWorkbookRef.current = next;
                  setWorkbook(next);
                  setSelectionAnchor({ row: 1, column: 1 });
                  setSelectionFocus({ row: 1, column: 1 });
                  setFilterText("");
                }}
              >
                {sheet.name}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={() => {
                  setRenameSheetId(sheet.id);
                  setRenameSheetValue(sheet.name);
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => applyWorkbook(moveSheet(latestWorkbookRef.current, sheet.id, -1))}
              >
                <MoveLeft className="mr-2 h-4 w-4" /> Move left
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => applyWorkbook(moveSheet(latestWorkbookRef.current, sheet.id, 1))}
              >
                <MoveRight className="mr-2 h-4 w-4" /> Move right
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={workbook.sheets.length <= 1}
                className="text-red-600 focus:text-red-600"
                onClick={() => applyWorkbook(deleteSheet(latestWorkbookRef.current, sheet.id))}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete worksheet
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
        <span className="ml-auto shrink-0 px-2 text-[10px] text-muted-foreground">
          {activeSheet.rowCount.toLocaleString()} rows × {activeSheet.columnCount.toLocaleString()}{" "}
          columns
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-xs"
          onClick={() =>
            updateActiveSheet({
              ...activeSheet,
              rowCount: Math.min(10_000, activeSheet.rowCount + 100),
            })
          }
        >
          <Rows3 className="mr-1 h-3.5 w-3.5" /> +100 rows
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-xs"
          onClick={() =>
            updateActiveSheet({
              ...activeSheet,
              columnCount: Math.min(256, activeSheet.columnCount + 10),
            })
          }
        >
          <Columns3 className="mr-1 h-3.5 w-3.5" /> +10 cols
        </Button>
      </div>

      <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save spreadsheet version</DialogTitle>
            <DialogDescription>
              Create an immutable workbook milestone before a significant change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Version title</Label>
              <Input
                value={versionTitle}
                onChange={(event) => setVersionTitle(event.target.value)}
                placeholder="Quarter-end review"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Change summary</Label>
              <Textarea
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
              Save version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>
              Restoring a workbook first creates an automatic pre-restore backup in the existing
              version ledger.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(versions ?? []).length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No milestone versions have been saved yet.
              </div>
            ) : (
              (versions ?? []).map((version) => (
                <div key={version.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {version.title || `Version ${version.version_number}`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(version.created_at).toLocaleString()} ·{" "}
                      {(version.sheet_count ?? 0).toLocaleString()} sheets ·{" "}
                      {(version.cell_count ?? 0).toLocaleString()} cells ·{" "}
                      {(version.formula_count ?? 0).toLocaleString()} formulas
                    </p>
                    {version.change_summary && (
                      <p className="mt-2 text-xs">{version.change_summary}</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restoringVersionId === version.id || saveState === "saving"}
                    onClick={() => void restoreVersion(version.id)}
                  >
                    {restoringVersionId === version.id && (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    )}
                    Restore
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renameSheetId)}
        onOpenChange={(open) => !open && setRenameSheetId(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename worksheet</DialogTitle>
            <DialogDescription>Worksheet names must be unique in this workbook.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameSheetValue}
            autoFocus
            onChange={(event) => setRenameSheetValue(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && commitSheetRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameSheetId(null)}>
              Cancel
            </Button>
            <Button onClick={commitSheetRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>PDF and print</DialogTitle>
            <DialogDescription>
              Select worksheets. Each sheet uses its saved orientation, print area, scaling,
              margins, repeated header rows and gridline preference.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {workbook.sheets.map((sheet) => (
              <label
                key={sheet.id}
                className="flex items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={pdfSheetIds.includes(sheet.id)}
                  onChange={(event) =>
                    setPdfSheetIds((ids) =>
                      event.target.checked
                        ? [...ids, sheet.id]
                        : ids.filter((id) => id !== sheet.id),
                    )
                  }
                />
                <span className="min-w-0 flex-1 truncate font-medium">{sheet.name}</span>
                <span className="text-xs text-muted-foreground">{sheet.print.orientation}</span>
              </label>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPdfOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={pdfBusy || pdfSheetIds.length === 0}
              onClick={() => void exportPdf(true)}
            >
              {pdfBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-2 h-4 w-4" />
              )}
              Print
            </Button>
            <Button
              disabled={pdfBusy || pdfSheetIds.length === 0}
              onClick={() => void exportPdf(false)}
            >
              {pdfBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { SpreadsheetEditor };
