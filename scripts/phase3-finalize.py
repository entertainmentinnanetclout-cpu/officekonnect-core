from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one source fragment, found {count}")
    return text.replace(old, new, 1)


path = Path("src/components/spreadsheet/spreadsheet-editor.tsx")
s = path.read_text()

for fragment in ["  Copy,\n", "  Grid2X2Plus,\n", "  Redo2,\n", "  Undo2,\n"]:
    s = s.replace(fragment, "")

s = replace_once(
    s,
    '''  const usedRange = sheetUsedRange(activeSheet);\n\n  return (\n''',
    '''  const usedRange = sheetUsedRange(activeSheet);\n  const selectedColumnLabel = columnIndexToLabel(selectionFocus.column);\n  const selectedColumnWidth = activeSheet.columnWidths[selectedColumnLabel] ?? 112;\n  const selectedRowHeight = activeSheet.rowHeights[String(selectionFocus.row)] ?? 30;\n  const frozenColumnOffsets = useMemo(() => {\n    const offsets: Record<number, number> = {};\n    let left = 48;\n    for (let column = 1; column <= activeSheet.frozenColumns; column += 1) {\n      offsets[column] = left;\n      left += activeSheet.columnWidths[columnIndexToLabel(column)] ?? 112;\n    }\n    return offsets;\n  }, [activeSheet.columnWidths, activeSheet.frozenColumns]);\n  const frozenRowOffsets = useMemo(() => {\n    const offsets: Record<number, number> = {};\n    let top = 28;\n    for (let row = 1; row <= activeSheet.frozenRows; row += 1) {\n      offsets[row] = top;\n      top += activeSheet.rowHeights[String(row)] ?? 30;\n    }\n    return offsets;\n  }, [activeSheet.frozenRows, activeSheet.rowHeights]);\n\n  return (\n''',
    "frozen pane offsets",
)

undo_block = '''          <Button variant="ghost" size="icon" className="h-8 w-8" title="Undo" onClick={() => toast.info("Use browser undo while editing a cell; workbook history is available under File → Version history.") }>\n            <Undo2 className="h-4 w-4" />\n          </Button>\n          <Button variant="ghost" size="icon" className="h-8 w-8" title="Redo" onClick={() => toast.info("Use browser redo while editing a cell; saved workbook versions remain available in Version history.") }>\n            <Redo2 className="h-4 w-4" />\n          </Button>\n          <span className="mx-1 h-5 w-px bg-border" />\n'''
s = replace_once(s, undo_block, "", "remove non-functional undo redo")

s = replace_once(
    s,
    '''                  <th key={column} className="sticky top-0 z-20 h-7 min-w-[48px] border-b border-r bg-slate-100 px-2 text-center text-[10px] font-medium text-muted-foreground dark:bg-slate-900">\n                    {columnIndexToLabel(column)}\n                  </th>\n''',
    '''                  <th\n                    key={column}\n                    className="sticky top-0 z-20 h-7 min-w-[48px] border-b border-r bg-slate-100 px-2 text-center text-[10px] font-medium text-muted-foreground dark:bg-slate-900"\n                    style={\n                      column <= activeSheet.frozenColumns\n                        ? { left: frozenColumnOffsets[column], zIndex: 31 }\n                        : undefined\n                    }\n                  >\n                    {columnIndexToLabel(column)}\n                  </th>\n''',
    "frozen column header",
)

s = replace_once(
    s,
    '''                  <th className="sticky left-0 z-10 border-b border-r bg-slate-100 px-2 text-right text-[10px] font-medium text-muted-foreground dark:bg-slate-900">{row}</th>\n''',
    '''                  <th\n                    className="sticky left-0 z-10 border-b border-r bg-slate-100 px-2 text-right text-[10px] font-medium text-muted-foreground dark:bg-slate-900"\n                    style={\n                      row <= activeSheet.frozenRows\n                        ? { top: frozenRowOffsets[row], zIndex: 30 }\n                        : undefined\n                    }\n                  >\n                    {row}\n                  </th>\n''',
    "frozen row header",
)

s = replace_once(
    s,
    '''                        style={{\n                          backgroundColor: cell?.format?.backgroundColor,\n                          minWidth: activeSheet.columnWidths[columnIndexToLabel(column)] ?? 112,\n                        }}\n''',
    '''                        style={{\n                          backgroundColor: cell?.format?.backgroundColor,\n                          minWidth: activeSheet.columnWidths[columnIndexToLabel(column)] ?? 112,\n                          position:\n                            row <= activeSheet.frozenRows || column <= activeSheet.frozenColumns\n                              ? "sticky"\n                              : undefined,\n                          top:\n                            row <= activeSheet.frozenRows ? frozenRowOffsets[row] : undefined,\n                          left:\n                            column <= activeSheet.frozenColumns\n                              ? frozenColumnOffsets[column]\n                              : undefined,\n                          zIndex:\n                            row <= activeSheet.frozenRows && column <= activeSheet.frozenColumns\n                              ? 29\n                              : row <= activeSheet.frozenRows || column <= activeSheet.frozenColumns\n                                ? 18\n                                : undefined,\n                        }}\n''',
    "frozen data cells",
)

s = replace_once(
    s,
    '''        <aside className="hidden w-64 shrink-0 overflow-y-auto border-l bg-background p-4 2xl:block">\n          <h3 className="text-sm font-semibold">Print setup</h3>\n''',
    '''        <aside className="hidden w-64 shrink-0 overflow-y-auto border-l bg-background p-4 xl:block">\n          <h3 className="text-sm font-semibold">Cell geometry</h3>\n          <p className="mt-1 text-xs text-muted-foreground">Resize the selected row or column. Dimensions persist in the workbook.</p>\n          <div className="mt-3 grid grid-cols-2 gap-2">\n            <div className="space-y-1">\n              <Label htmlFor="selected-column-width">{selectedColumnLabel} width</Label>\n              <Input\n                id="selected-column-width"\n                type="number"\n                min={48}\n                max={420}\n                value={selectedColumnWidth}\n                onChange={(event) =>\n                  updateActiveSheet({\n                    ...activeSheet,\n                    columnWidths: {\n                      ...activeSheet.columnWidths,\n                      [selectedColumnLabel]: Math.max(48, Math.min(420, Number(event.target.value) || 112)),\n                    },\n                  })\n                }\n              />\n            </div>\n            <div className="space-y-1">\n              <Label htmlFor="selected-row-height">Row {selectionFocus.row}</Label>\n              <Input\n                id="selected-row-height"\n                type="number"\n                min={20}\n                max={180}\n                value={selectedRowHeight}\n                onChange={(event) =>\n                  updateActiveSheet({\n                    ...activeSheet,\n                    rowHeights: {\n                      ...activeSheet.rowHeights,\n                      [String(selectionFocus.row)]: Math.max(20, Math.min(180, Number(event.target.value) || 30)),\n                    },\n                  })\n                }\n              />\n            </div>\n          </div>\n          <div className="my-4 border-t" />\n          <h3 className="text-sm font-semibold">Print setup</h3>\n''',
    "geometry controls",
)

s = replace_once(
    s,
    '''    try {\n      const XLSX = await import("xlsx");\n      const book = XLSX.utils.book_new();\n''',
    '''    try {\n      const saved = await persist();\n      if (!saved) return;\n      const XLSX = await import("xlsx");\n      const book = XLSX.utils.book_new();\n''',
    "xlsx save barrier",
)

s = replace_once(
    s,
    '''  const exportCsv = async () => {\n    setFileBusy(true);\n    try {\n      const XLSX = await import("xlsx");\n''',
    '''  const exportCsv = async () => {\n    setFileBusy(true);\n    try {\n      const saved = await persist();\n      if (!saved) return;\n      const XLSX = await import("xlsx");\n''',
    "csv save barrier",
)

for marker in [
    "frozenColumnOffsets",
    "frozenRowOffsets",
    "Cell geometry",
    "selected-column-width",
    "const saved = await persist();",
]:
    if marker not in s:
        raise SystemExit("missing Phase 3 editor marker: " + marker)
if "Use browser undo" in s or "<Undo2" in s or "<Redo2" in s:
    raise SystemExit("non-functional undo/redo remains")

path.write_text(s)
