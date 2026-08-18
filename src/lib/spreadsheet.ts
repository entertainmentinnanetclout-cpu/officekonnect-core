import type { Json } from "@/integrations/supabase/types";

export type WorkbookValue = string | number | boolean | null;
export type SpreadsheetError = "#REF!" | "#DIV/0!" | "#VALUE!" | "#NAME?" | "#CYCLE!";
export type CellNumberFormat = "general" | "number" | "currency" | "percent" | "date" | "text";
export type CellHorizontalAlign = "left" | "center" | "right";

export interface WorkbookCellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  textColor?: string;
  backgroundColor?: string;
  horizontalAlign?: CellHorizontalAlign;
  numberFormat?: CellNumberFormat;
  currency?: string;
  decimals?: number;
  border?: boolean;
}

export interface WorkbookCell {
  value?: WorkbookValue;
  formula?: string;
  format?: WorkbookCellFormat;
}

export interface WorkbookMerge {
  range: string;
}

export interface WorkbookPrintSettings {
  orientation: "portrait" | "landscape";
  fitToWidth: boolean;
  margins: { top: number; right: number; bottom: number; left: number };
  printArea?: string;
  repeatHeaderRows?: number;
  gridlines: boolean;
  scale: number;
}

export interface WorkbookSheet {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  cells: Record<string, WorkbookCell>;
  columnWidths: Record<string, number>;
  rowHeights: Record<string, number>;
  frozenRows: number;
  frozenColumns: number;
  merges: WorkbookMerge[];
  print: WorkbookPrintSettings;
}

export interface WorkbookContent {
  kind: "workbook";
  schemaVersion: 1;
  activeSheetId: string;
  sheets: WorkbookSheet[];
}

export interface WorkbookMetrics {
  sheetCount: number;
  cellCount: number;
  formulaCount: number;
}

export interface CellPosition {
  row: number;
  column: number;
}

export interface CellRange {
  start: CellPosition;
  end: CellPosition;
}

export interface EvaluatedWorkbook {
  bySheet: Record<string, Record<string, WorkbookValue | SpreadsheetError>>;
}

const DEFAULT_ROWS = 100;
const DEFAULT_COLUMNS = 26;
const DEFAULT_COLUMN_WIDTH = 112;
const DEFAULT_ROW_HEIGHT = 30;
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 256;

const DEFAULT_PRINT: WorkbookPrintSettings = {
  orientation: "portrait",
  fitToWidth: true,
  margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  gridlines: true,
  scale: 100,
};

function makeId(prefix: string) {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${id}`;
}

export function createEmptySheet(name = "Sheet 1"): WorkbookSheet {
  return {
    id: makeId("sheet"),
    name,
    rowCount: DEFAULT_ROWS,
    columnCount: DEFAULT_COLUMNS,
    cells: {},
    columnWidths: {},
    rowHeights: {},
    frozenRows: 0,
    frozenColumns: 0,
    merges: [],
    print: { ...DEFAULT_PRINT, margins: { ...DEFAULT_PRINT.margins } },
  };
}

export function createEmptyWorkbook(): WorkbookContent {
  const sheet = createEmptySheet();
  return { kind: "workbook", schemaVersion: 1, activeSheetId: sheet.id, sheets: [sheet] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteInteger(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.floor(number))) : fallback;
}

function normalizedColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
}

function normalizeFormat(value: unknown): WorkbookCellFormat | undefined {
  if (!isRecord(value)) return undefined;
  const numberFormat = ["general", "number", "currency", "percent", "date", "text"].includes(String(value.numberFormat))
    ? (String(value.numberFormat) as CellNumberFormat)
    : undefined;
  const horizontalAlign = ["left", "center", "right"].includes(String(value.horizontalAlign))
    ? (String(value.horizontalAlign) as CellHorizontalAlign)
    : undefined;
  const format: WorkbookCellFormat = {
    bold: value.bold === true || undefined,
    italic: value.italic === true || undefined,
    underline: value.underline === true || undefined,
    strikethrough: value.strikethrough === true || undefined,
    textColor: normalizedColor(value.textColor),
    backgroundColor: normalizedColor(value.backgroundColor),
    horizontalAlign,
    numberFormat,
    currency: typeof value.currency === "string" && value.currency.trim() ? value.currency.trim().slice(0, 8) : undefined,
    decimals: finiteInteger(value.decimals, 2, 0, 8),
    border: value.border === true || undefined,
  };
  return Object.values(format).some((entry) => entry !== undefined) ? format : undefined;
}

function normalizeCell(value: unknown): WorkbookCell | undefined {
  if (value === null || value === undefined) return undefined;
  if (!isRecord(value)) {
    if (["string", "number", "boolean"].includes(typeof value)) return { value: value as WorkbookValue };
    return undefined;
  }
  const formula = typeof value.formula === "string" && value.formula.trim()
    ? value.formula.trim().startsWith("=")
      ? value.formula.trim()
      : `=${value.formula.trim()}`
    : undefined;
  let cellValue: WorkbookValue | undefined;
  if (value.value === null || ["string", "number", "boolean"].includes(typeof value.value)) {
    cellValue = value.value as WorkbookValue;
  }
  const format = normalizeFormat(value.format);
  if (!formula && (cellValue === undefined || cellValue === "") && !format) return undefined;
  return { value: cellValue, formula, format };
}

function normalizePrint(value: unknown): WorkbookPrintSettings {
  if (!isRecord(value)) return { ...DEFAULT_PRINT, margins: { ...DEFAULT_PRINT.margins } };
  const marginsRecord = isRecord(value.margins) ? value.margins : {};
  return {
    orientation: value.orientation === "landscape" ? "landscape" : "portrait",
    fitToWidth: value.fitToWidth !== false,
    margins: {
      top: finiteInteger(marginsRecord.top, DEFAULT_PRINT.margins.top, 5, 50),
      right: finiteInteger(marginsRecord.right, DEFAULT_PRINT.margins.right, 5, 50),
      bottom: finiteInteger(marginsRecord.bottom, DEFAULT_PRINT.margins.bottom, 5, 50),
      left: finiteInteger(marginsRecord.left, DEFAULT_PRINT.margins.left, 5, 50),
    },
    printArea: typeof value.printArea === "string" && value.printArea.trim() ? value.printArea.trim().toUpperCase() : undefined,
    repeatHeaderRows: finiteInteger(value.repeatHeaderRows, 0, 0, 100) || undefined,
    gridlines: value.gridlines !== false,
    scale: finiteInteger(value.scale, 100, 25, 200),
  };
}

function normalizeSheet(value: unknown, index: number): WorkbookSheet {
  const fallback = createEmptySheet(`Sheet ${index + 1}`);
  if (!isRecord(value)) return fallback;
  const rawCells = isRecord(value.cells) ? value.cells : {};
  const cells: Record<string, WorkbookCell> = {};
  for (const [address, rawCell] of Object.entries(rawCells)) {
    const normalizedAddress = normalizeCellAddress(address);
    const cell = normalizeCell(rawCell);
    if (normalizedAddress && cell) cells[normalizedAddress] = cell;
  }

  // Accept a legacy 2D `data` array without creating a second persistence format.
  if (Array.isArray(value.data)) {
    value.data.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) return;
      row.forEach((cellValue, columnIndex) => {
        const address = cellAddress(rowIndex + 1, columnIndex + 1);
        const cell = normalizeCell(cellValue);
        if (cell && !cells[address]) cells[address] = cell;
      });
    });
  }

  const used = usedRangeFromCells(cells);
  const rowCount = finiteInteger(value.rowCount, Math.max(DEFAULT_ROWS, used.end.row), 1, MAX_ROWS);
  const columnCount = finiteInteger(value.columnCount, Math.max(DEFAULT_COLUMNS, used.end.column), 1, MAX_COLUMNS);
  const widths: Record<string, number> = {};
  if (isRecord(value.columnWidths)) {
    for (const [column, width] of Object.entries(value.columnWidths)) {
      const label = column.toUpperCase();
      if (/^[A-Z]{1,3}$/.test(label)) widths[label] = finiteInteger(width, DEFAULT_COLUMN_WIDTH, 48, 420);
    }
  }
  const heights: Record<string, number> = {};
  if (isRecord(value.rowHeights)) {
    for (const [row, height] of Object.entries(value.rowHeights)) {
      if (/^\d+$/.test(row)) heights[row] = finiteInteger(height, DEFAULT_ROW_HEIGHT, 20, 180);
    }
  }
  const merges = Array.isArray(value.merges)
    ? value.merges
        .map((entry) => {
          const range = isRecord(entry) ? entry.range : entry;
          return typeof range === "string" && parseRange(range) ? { range: normalizeRange(range) } : null;
        })
        .filter((entry): entry is WorkbookMerge => Boolean(entry))
    : [];

  return {
    id: typeof value.id === "string" && value.id ? value.id : fallback.id,
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 80) : fallback.name,
    rowCount: Math.max(rowCount, used.end.row),
    columnCount: Math.max(columnCount, used.end.column),
    cells,
    columnWidths: widths,
    rowHeights: heights,
    frozenRows: finiteInteger(value.frozenRows, 0, 0, Math.min(rowCount, 100)),
    frozenColumns: finiteInteger(value.frozenColumns, 0, 0, Math.min(columnCount, 20)),
    merges,
    print: normalizePrint(value.print),
  };
}

export function normalizeWorkbookContent(value: unknown): WorkbookContent {
  if (!isRecord(value) || value.kind !== "workbook" || !Array.isArray(value.sheets)) return createEmptyWorkbook();
  const sheets = value.sheets.map((sheet, index) => normalizeSheet(sheet, index));
  if (sheets.length === 0) sheets.push(createEmptySheet());
  const activeSheetId = typeof value.activeSheetId === "string" && sheets.some((sheet) => sheet.id === value.activeSheetId)
    ? value.activeSheetId
    : sheets[0]!.id;
  return { kind: "workbook", schemaVersion: 1, activeSheetId, sheets };
}

export function workbookToJson(workbook: WorkbookContent): Json {
  return workbook as unknown as Json;
}

export function columnIndexToLabel(index: number) {
  let value = Math.max(1, Math.floor(index));
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

export function columnLabelToIndex(label: string) {
  const normalized = label.replace(/\$/g, "").toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) return 0;
  return normalized.split("").reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0);
}

export function cellAddress(row: number, column: number) {
  return `${columnIndexToLabel(column)}${Math.max(1, Math.floor(row))}`;
}

export function parseCellAddress(address: string): CellPosition | null {
  const match = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(address.trim());
  if (!match) return null;
  const row = Number(match[2]);
  const column = columnLabelToIndex(match[1]!);
  if (!Number.isFinite(row) || row < 1 || row > MAX_ROWS || column < 1 || column > MAX_COLUMNS) return null;
  return { row, column };
}

export function normalizeCellAddress(address: string) {
  const position = parseCellAddress(address);
  return position ? cellAddress(position.row, position.column) : null;
}

export function parseRange(range: string): CellRange | null {
  const [rawStart, rawEnd = rawStart] = range.trim().split(":");
  if (!rawStart) return null;
  const start = parseCellAddress(rawStart);
  const end = parseCellAddress(rawEnd);
  if (!start || !end) return null;
  return {
    start: { row: Math.min(start.row, end.row), column: Math.min(start.column, end.column) },
    end: { row: Math.max(start.row, end.row), column: Math.max(start.column, end.column) },
  };
}

export function normalizeRange(range: string) {
  const parsed = parseRange(range);
  return parsed ? `${cellAddress(parsed.start.row, parsed.start.column)}:${cellAddress(parsed.end.row, parsed.end.column)}` : "A1:A1";
}

export function positionsInRange(range: CellRange) {
  const positions: CellPosition[] = [];
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) positions.push({ row, column });
  }
  return positions;
}

export function rangeFromPositions(first: CellPosition, second: CellPosition): CellRange {
  return {
    start: { row: Math.min(first.row, second.row), column: Math.min(first.column, second.column) },
    end: { row: Math.max(first.row, second.row), column: Math.max(first.column, second.column) },
  };
}

function usedRangeFromCells(cells: Record<string, WorkbookCell>): CellRange {
  let maxRow = 1;
  let maxColumn = 1;
  for (const address of Object.keys(cells)) {
    const position = parseCellAddress(address);
    if (!position) continue;
    maxRow = Math.max(maxRow, position.row);
    maxColumn = Math.max(maxColumn, position.column);
  }
  return { start: { row: 1, column: 1 }, end: { row: maxRow, column: maxColumn } };
}

export function sheetUsedRange(sheet: WorkbookSheet) {
  return usedRangeFromCells(sheet.cells);
}

export function getCell(sheet: WorkbookSheet, address: string) {
  const normalized = normalizeCellAddress(address);
  return normalized ? sheet.cells[normalized] : undefined;
}

export function getCellInput(sheet: WorkbookSheet, address: string) {
  const cell = getCell(sheet, address);
  if (!cell) return "";
  if (cell.formula) return cell.formula;
  if (cell.value === null || cell.value === undefined) return "";
  return String(cell.value);
}

export function inputToCell(input: string, existing?: WorkbookCell): WorkbookCell | undefined {
  const value = input.replace(/\r/g, "");
  const format = existing?.format;
  if (!value && !format) return undefined;
  if (value.startsWith("=")) return { value: existing?.value, formula: value, format };
  const trimmed = value.trim();
  let parsed: WorkbookValue = value;
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) parsed = Number(trimmed);
  else if (/^true$/i.test(trimmed)) parsed = true;
  else if (/^false$/i.test(trimmed)) parsed = false;
  return { value: parsed, format };
}

export function updateCellInput(sheet: WorkbookSheet, address: string, input: string) {
  const normalized = normalizeCellAddress(address);
  if (!normalized) return sheet;
  const cells = { ...sheet.cells };
  const next = inputToCell(input, cells[normalized]);
  if (next) cells[normalized] = next;
  else delete cells[normalized];
  const position = parseCellAddress(normalized)!;
  return {
    ...sheet,
    rowCount: Math.max(sheet.rowCount, position.row),
    columnCount: Math.max(sheet.columnCount, position.column),
    cells,
  };
}

export function updateCellFormat(sheet: WorkbookSheet, range: CellRange, patch: Partial<WorkbookCellFormat>) {
  const cells = { ...sheet.cells };
  for (const position of positionsInRange(range)) {
    const address = cellAddress(position.row, position.column);
    const current = cells[address] ?? {};
    const format = { ...(current.format ?? {}), ...patch };
    for (const key of Object.keys(format) as Array<keyof WorkbookCellFormat>) {
      if (format[key] === undefined) delete format[key];
    }
    if (Object.keys(format).length === 0 && current.value === undefined && !current.formula) delete cells[address];
    else cells[address] = { ...current, format: Object.keys(format).length ? format : undefined };
  }
  return { ...sheet, cells };
}

export function clearRange(sheet: WorkbookSheet, range: CellRange, mode: "contents" | "format" | "all" = "contents") {
  const cells = { ...sheet.cells };
  for (const position of positionsInRange(range)) {
    const address = cellAddress(position.row, position.column);
    const current = cells[address];
    if (!current) continue;
    if (mode === "all") delete cells[address];
    else if (mode === "format") {
      const next = { ...current, format: undefined };
      if (next.value === undefined && !next.formula) delete cells[address];
      else cells[address] = next;
    } else {
      const next = { ...current, value: undefined, formula: undefined };
      if (!next.format) delete cells[address];
      else cells[address] = next;
    }
  }
  return { ...sheet, cells };
}

export function workbookMetrics(workbook: WorkbookContent): WorkbookMetrics {
  let cellCount = 0;
  let formulaCount = 0;
  for (const sheet of workbook.sheets) {
    for (const cell of Object.values(sheet.cells)) {
      if (cell.formula || (cell.value !== undefined && cell.value !== null && cell.value !== "")) cellCount += 1;
      if (cell.formula) formulaCount += 1;
    }
  }
  return { sheetCount: workbook.sheets.length, cellCount, formulaCount };
}

export function cloneWorkbook(workbook: WorkbookContent): WorkbookContent {
  return normalizeWorkbookContent(JSON.parse(JSON.stringify(workbook)));
}

export function addSheet(workbook: WorkbookContent, preferredName?: string) {
  const names = new Set(workbook.sheets.map((sheet) => sheet.name.toLowerCase()));
  let index = workbook.sheets.length + 1;
  let name = preferredName?.trim() || `Sheet ${index}`;
  while (names.has(name.toLowerCase())) {
    index += 1;
    name = `Sheet ${index}`;
  }
  const sheet = createEmptySheet(name);
  return { ...workbook, activeSheetId: sheet.id, sheets: [...workbook.sheets, sheet] };
}

export function deleteSheet(workbook: WorkbookContent, sheetId: string) {
  if (workbook.sheets.length <= 1) return workbook;
  const sheets = workbook.sheets.filter((sheet) => sheet.id !== sheetId);
  return { ...workbook, activeSheetId: workbook.activeSheetId === sheetId ? sheets[0]!.id : workbook.activeSheetId, sheets };
}

export function renameSheet(workbook: WorkbookContent, sheetId: string, nextName: string) {
  const name = nextName.trim().slice(0, 80);
  if (!name || workbook.sheets.some((sheet) => sheet.id !== sheetId && sheet.name.toLowerCase() === name.toLowerCase())) return workbook;
  const source = workbook.sheets.find((sheet) => sheet.id === sheetId);
  if (!source || source.name === name) return workbook;
  const escapedOld = source.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const oldQuoted = `'${source.name.replace(/'/g, "''")}'!`;
  const newQuoted = `'${name.replace(/'/g, "''")}'!`;
  const plainPattern = new RegExp(`\\b${escapedOld}!`, "gi");
  const sheets = workbook.sheets.map((sheet) => ({
    ...sheet,
    name: sheet.id === sheetId ? name : sheet.name,
    cells: Object.fromEntries(
      Object.entries(sheet.cells).map(([address, cell]) => [
        address,
        cell.formula
          ? { ...cell, formula: cell.formula.split(oldQuoted).join(newQuoted).replace(plainPattern, `${name}!`) }
          : cell,
      ]),
    ),
  }));
  return { ...workbook, sheets };
}

export function moveSheet(workbook: WorkbookContent, sheetId: string, direction: -1 | 1) {
  const index = workbook.sheets.findIndex((sheet) => sheet.id === sheetId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= workbook.sheets.length) return workbook;
  const sheets = [...workbook.sheets];
  [sheets[index], sheets[target]] = [sheets[target]!, sheets[index]!];
  return { ...workbook, sheets };
}

export function setWorkbookSheet(workbook: WorkbookContent, sheet: WorkbookSheet) {
  return { ...workbook, sheets: workbook.sheets.map((entry) => (entry.id === sheet.id ? sheet : entry)) };
}

export function matrixToSheet(name: string, matrix: unknown[][]): WorkbookSheet {
  let sheet = createEmptySheet(name);
  const cells: Record<string, WorkbookCell> = {};
  matrix.forEach((row, rowIndex) => {
    row.forEach((raw, columnIndex) => {
      if (raw === null || raw === undefined || raw === "") return;
      const address = cellAddress(rowIndex + 1, columnIndex + 1);
      if (typeof raw === "string" && raw.startsWith("=")) cells[address] = { formula: raw };
      else if (["string", "number", "boolean"].includes(typeof raw)) cells[address] = { value: raw as WorkbookValue };
      else if (raw instanceof Date) cells[address] = { value: raw.toISOString(), format: { numberFormat: "date" } };
      else cells[address] = { value: String(raw) };
    });
  });
  const used = usedRangeFromCells(cells);
  sheet = {
    ...sheet,
    cells,
    rowCount: Math.max(DEFAULT_ROWS, used.end.row + 10),
    columnCount: Math.max(DEFAULT_COLUMNS, used.end.column + 3),
  };
  return sheet;
}

export function workbookFromMatrices(entries: Array<{ name: string; matrix: unknown[][] }>): WorkbookContent {
  const sheets = entries.length ? entries.map((entry, index) => matrixToSheet(entry.name || `Sheet ${index + 1}`, entry.matrix)) : [createEmptySheet()];
  return { kind: "workbook", schemaVersion: 1, activeSheetId: sheets[0]!.id, sheets };
}

export function rangeToInputMatrix(sheet: WorkbookSheet, range: CellRange) {
  const rows: string[][] = [];
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    const values: string[] = [];
    for (let column = range.start.column; column <= range.end.column; column += 1) values.push(getCellInput(sheet, cellAddress(row, column)));
    rows.push(values);
  }
  return rows;
}

export function pasteInputMatrix(sheet: WorkbookSheet, start: CellPosition, matrix: string[][]) {
  let next = sheet;
  matrix.forEach((rowValues, rowOffset) => {
    rowValues.forEach((input, columnOffset) => {
      const row = start.row + rowOffset;
      const column = start.column + columnOffset;
      if (row <= MAX_ROWS && column <= MAX_COLUMNS) next = updateCellInput(next, cellAddress(row, column), input);
    });
  });
  return next;
}

export function fillRange(sheet: WorkbookSheet, range: CellRange, direction: "down" | "right") {
  let next = sheet;
  if (direction === "down") {
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const source = getCellInput(sheet, cellAddress(range.start.row, column));
      for (let row = range.start.row + 1; row <= range.end.row; row += 1) next = updateCellInput(next, cellAddress(row, column), source);
    }
  } else {
    for (let row = range.start.row; row <= range.end.row; row += 1) {
      const source = getCellInput(sheet, cellAddress(row, range.start.column));
      for (let column = range.start.column + 1; column <= range.end.column; column += 1) next = updateCellInput(next, cellAddress(row, column), source);
    }
  }
  return next;
}

export function toggleMerge(sheet: WorkbookSheet, range: CellRange) {
  const normalized = `${cellAddress(range.start.row, range.start.column)}:${cellAddress(range.end.row, range.end.column)}`;
  if (range.start.row === range.end.row && range.start.column === range.end.column) return sheet;
  const existing = sheet.merges.find((merge) => merge.range === normalized);
  if (existing) return { ...sheet, merges: sheet.merges.filter((merge) => merge.range !== normalized) };
  const overlaps = sheet.merges.some((merge) => rangesOverlap(parseRange(merge.range)!, range));
  if (overlaps) return sheet;
  return { ...sheet, merges: [...sheet.merges, { range: normalized }] };
}

function rangesOverlap(first: CellRange, second: CellRange) {
  return !(
    first.end.row < second.start.row ||
    first.start.row > second.end.row ||
    first.end.column < second.start.column ||
    first.start.column > second.end.column
  );
}

export function mergeForCell(sheet: WorkbookSheet, position: CellPosition) {
  for (const merge of sheet.merges) {
    const range = parseRange(merge.range);
    if (!range) continue;
    if (position.row >= range.start.row && position.row <= range.end.row && position.column >= range.start.column && position.column <= range.end.column) return range;
  }
  return null;
}

export function sortRange(sheet: WorkbookSheet, range: CellRange, sortColumn: number, direction: "asc" | "desc", evaluated?: EvaluatedWorkbook) {
  if (sortColumn < range.start.column || sortColumn > range.end.column) return sheet;
  const rows = Array.from({ length: range.end.row - range.start.row + 1 }, (_, offset) => range.start.row + offset);
  const sheetValues = evaluated?.bySheet[sheet.id] ?? {};
  const comparable = (row: number) => sheetValues[cellAddress(row, sortColumn)] ?? getCell(sheet, cellAddress(row, sortColumn))?.value ?? "";
  rows.sort((left, right) => {
    const a = comparable(left);
    const b = comparable(right);
    const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
    return direction === "asc" ? result : -result;
  });
  const source = sheet.cells;
  const cells = { ...source };
  const rowSnapshots = rows.map((row) => {
    const snapshot: Record<number, WorkbookCell | undefined> = {};
    for (let column = range.start.column; column <= range.end.column; column += 1) snapshot[column] = source[cellAddress(row, column)];
    return snapshot;
  });
  for (let targetOffset = 0; targetOffset < rows.length; targetOffset += 1) {
    const targetRow = range.start.row + targetOffset;
    const snapshot = rowSnapshots[targetOffset]!;
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const address = cellAddress(targetRow, column);
      const value = snapshot[column];
      if (value) cells[address] = value;
      else delete cells[address];
    }
  }
  return { ...sheet, cells };
}

type TokenType = "number" | "string" | "sheet" | "identifier" | "operator" | "lparen" | "rparen" | "comma" | "colon" | "bang" | "eof";
interface Token { type: TokenType; value: string }
interface RangeValue { kind: "range"; values: EvalValue[] }
type EvalValue = WorkbookValue | SpreadsheetError | RangeValue;

function isSpreadsheetError(value: EvalValue): value is SpreadsheetError {
  return typeof value === "string" && ["#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#CYCLE!"].includes(value);
}

function tokenizeFormula(formula: string): Token[] {
  const input = formula.trim().replace(/^=/, "");
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const character = input[index]!;
    if (/\s/.test(character)) { index += 1; continue; }
    if (character === '"') {
      let value = "";
      index += 1;
      while (index < input.length) {
        if (input[index] === '"' && input[index + 1] === '"') { value += '"'; index += 2; continue; }
        if (input[index] === '"') { index += 1; break; }
        value += input[index]!; index += 1;
      }
      tokens.push({ type: "string", value }); continue;
    }
    if (character === "'") {
      let value = "";
      index += 1;
      while (index < input.length) {
        if (input[index] === "'" && input[index + 1] === "'") { value += "'"; index += 2; continue; }
        if (input[index] === "'") { index += 1; break; }
        value += input[index]!; index += 1;
      }
      tokens.push({ type: "sheet", value }); continue;
    }
    const numberMatch = /^(?:\d+\.?\d*|\.\d+)/.exec(input.slice(index));
    if (numberMatch) { tokens.push({ type: "number", value: numberMatch[0] }); index += numberMatch[0].length; continue; }
    const identifierMatch = /^[$A-Za-z_][A-Za-z0-9_.$]*/.exec(input.slice(index));
    if (identifierMatch) { tokens.push({ type: "identifier", value: identifierMatch[0] }); index += identifierMatch[0].length; continue; }
    const pair = input.slice(index, index + 2);
    if (["<=", ">=", "<>", "=="].includes(pair)) { tokens.push({ type: "operator", value: pair }); index += 2; continue; }
    if ("+-*/^&%=<>".includes(character)) tokens.push({ type: "operator", value: character });
    else if (character === "(") tokens.push({ type: "lparen", value: character });
    else if (character === ")") tokens.push({ type: "rparen", value: character });
    else if (character === "," || character === ";") tokens.push({ type: "comma", value: character });
    else if (character === ":") tokens.push({ type: "colon", value: character });
    else if (character === "!") tokens.push({ type: "bang", value: character });
    else tokens.push({ type: "identifier", value: character });
    index += 1;
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
}

function flatten(values: EvalValue[]): EvalValue[] {
  return values.flatMap((value) => (typeof value === "object" && value !== null && "kind" in value && value.kind === "range" ? flatten(value.values) : [value]));
}

function toNumber(value: EvalValue): number | SpreadsheetError {
  if (isSpreadsheetError(value)) return value;
  if (typeof value === "object" && value !== null) return "#VALUE!";
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : "#VALUE!";
}

function toBoolean(value: EvalValue): boolean | SpreadsheetError {
  if (isSpreadsheetError(value)) return value;
  if (typeof value === "object" && value !== null) return "#VALUE!";
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value === null || value === "") return false;
  if (/^true$/i.test(String(value))) return true;
  if (/^false$/i.test(String(value))) return false;
  return Boolean(value);
}

class FormulaParser {
  private index = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly currentSheet: WorkbookSheet,
    private readonly workbook: WorkbookContent,
    private readonly resolveCell: (sheetId: string, address: string) => EvalValue,
  ) {}

  parse(): EvalValue {
    const value = this.parseComparison();
    return this.peek().type === "eof" || this.peek().type === "rparen" || this.peek().type === "comma" ? value : "#VALUE!";
  }

  private peek(offset = 0) { return this.tokens[this.index + offset] ?? { type: "eof" as const, value: "" }; }
  private take() { const token = this.peek(); this.index += 1; return token; }
  private match(type: TokenType, value?: string) {
    const token = this.peek();
    if (token.type !== type || (value !== undefined && token.value !== value)) return false;
    this.index += 1;
    return true;
  }

  private parseComparison(): EvalValue {
    let left = this.parseConcat();
    while (this.peek().type === "operator" && ["=", "==", "<>", "<", ">", "<=", ">="].includes(this.peek().value)) {
      const operator = this.take().value;
      const right = this.parseConcat();
      if (isSpreadsheetError(left)) return left;
      if (isSpreadsheetError(right)) return right;
      if ((typeof left === "object" && left !== null) || (typeof right === "object" && right !== null)) return "#VALUE!";
      const numericLeft = typeof left === "number" ? left : Number(left);
      const numericRight = typeof right === "number" ? right : Number(right);
      const comparableLeft = Number.isFinite(numericLeft) && Number.isFinite(numericRight) ? numericLeft : String(left ?? "").toLowerCase();
      const comparableRight = Number.isFinite(numericLeft) && Number.isFinite(numericRight) ? numericRight : String(right ?? "").toLowerCase();
      if (operator === "=" || operator === "==") left = comparableLeft === comparableRight;
      else if (operator === "<>") left = comparableLeft !== comparableRight;
      else if (operator === "<") left = comparableLeft < comparableRight;
      else if (operator === ">") left = comparableLeft > comparableRight;
      else if (operator === "<=") left = comparableLeft <= comparableRight;
      else left = comparableLeft >= comparableRight;
    }
    return left;
  }

  private parseConcat(): EvalValue {
    let left = this.parseAdditive();
    while (this.match("operator", "&")) {
      const right = this.parseAdditive();
      if (isSpreadsheetError(left)) return left;
      if (isSpreadsheetError(right)) return right;
      if ((typeof left === "object" && left !== null) || (typeof right === "object" && right !== null)) return "#VALUE!";
      left = `${left ?? ""}${right ?? ""}`;
    }
    return left;
  }

  private parseAdditive(): EvalValue {
    let left = this.parseMultiplicative();
    while (this.peek().type === "operator" && ["+", "-"].includes(this.peek().value)) {
      const operator = this.take().value;
      const right = this.parseMultiplicative();
      const a = toNumber(left); const b = toNumber(right);
      if (typeof a !== "number") return a;
      if (typeof b !== "number") return b;
      left = operator === "+" ? a + b : a - b;
    }
    return left;
  }

  private parseMultiplicative(): EvalValue {
    let left = this.parsePower();
    while (this.peek().type === "operator" && ["*", "/", "%"].includes(this.peek().value)) {
      const operator = this.take().value;
      const right = this.parsePower();
      const a = toNumber(left); const b = toNumber(right);
      if (typeof a !== "number") return a;
      if (typeof b !== "number") return b;
      if ((operator === "/" || operator === "%") && b === 0) return "#DIV/0!";
      left = operator === "*" ? a * b : operator === "/" ? a / b : a % b;
    }
    return left;
  }

  private parsePower(): EvalValue {
    let left = this.parseUnary();
    if (this.match("operator", "^")) {
      const right = this.parsePower();
      const a = toNumber(left); const b = toNumber(right);
      if (typeof a !== "number") return a;
      if (typeof b !== "number") return b;
      left = a ** b;
    }
    return left;
  }

  private parseUnary(): EvalValue {
    if (this.match("operator", "+")) return this.parseUnary();
    if (this.match("operator", "-")) {
      const number = toNumber(this.parseUnary());
      return typeof number === "number" ? -number : number;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): EvalValue {
    const token = this.take();
    if (token.type === "number") return Number(token.value);
    if (token.type === "string") return token.value;
    if (token.type === "lparen") {
      const value = this.parseComparison();
      if (!this.match("rparen")) return "#VALUE!";
      return value;
    }
    if (token.type !== "identifier" && token.type !== "sheet") return "#VALUE!";

    if (token.type === "identifier" && this.peek().type === "lparen") return this.parseFunction(token.value);
    if (token.type === "identifier" && /^true$/i.test(token.value)) return true;
    if (token.type === "identifier" && /^false$/i.test(token.value)) return false;

    let targetSheet = this.currentSheet;
    let referenceToken = token;
    if (this.match("bang")) {
      targetSheet = this.workbook.sheets.find((sheet) => sheet.name.toLowerCase() === token.value.toLowerCase()) ?? targetSheet;
      referenceToken = this.take();
      if (referenceToken.type !== "identifier") return "#REF!";
      if (!this.workbook.sheets.some((sheet) => sheet.id === targetSheet.id && sheet.name.toLowerCase() === token.value.toLowerCase())) return "#REF!";
    }

    const startAddress = normalizeCellAddress(referenceToken.value);
    if (!startAddress) return "#NAME?";
    if (this.match("colon")) {
      const endToken = this.take();
      if (endToken.type !== "identifier") return "#REF!";
      const endAddress = normalizeCellAddress(endToken.value);
      const range = endAddress ? parseRange(`${startAddress}:${endAddress}`) : null;
      if (!range) return "#REF!";
      return { kind: "range", values: positionsInRange(range).map((position) => this.resolveCell(targetSheet.id, cellAddress(position.row, position.column))) };
    }
    return this.resolveCell(targetSheet.id, startAddress);
  }

  private parseFunction(name: string): EvalValue {
    this.match("lparen");
    const args: EvalValue[] = [];
    if (!this.match("rparen")) {
      while (true) {
        args.push(this.parseComparison());
        if (this.match("rparen")) break;
        if (!this.match("comma")) return "#VALUE!";
      }
    }
    return evaluateFunction(name.toUpperCase(), args);
  }
}

function evaluateFunction(name: string, args: EvalValue[]): EvalValue {
  const values = flatten(args);
  const firstError = values.find(isSpreadsheetError);
  if (firstError) return firstError;
  const numbers = values.map(toNumber).filter((value): value is number => typeof value === "number");
  if (name === "SUM") return numbers.reduce((total, value) => total + value, 0);
  if (name === "AVERAGE") return numbers.length ? numbers.reduce((total, value) => total + value, 0) / numbers.length : "#DIV/0!";
  if (name === "MIN") return numbers.length ? Math.min(...numbers) : 0;
  if (name === "MAX") return numbers.length ? Math.max(...numbers) : 0;
  if (name === "COUNT") return numbers.length;
  if (name === "COUNTA") return values.filter((value) => value !== null && value !== "").length;
  if (name === "ABS") { const value = toNumber(args[0] ?? null); return typeof value === "number" ? Math.abs(value) : value; }
  if (name === "INT") { const value = toNumber(args[0] ?? null); return typeof value === "number" ? Math.floor(value) : value; }
  if (name === "SQRT") { const value = toNumber(args[0] ?? null); return typeof value === "number" && value >= 0 ? Math.sqrt(value) : "#VALUE!"; }
  if (name === "ROUND" || name === "ROUNDUP" || name === "ROUNDDOWN") {
    const value = toNumber(args[0] ?? null); const digits = toNumber(args[1] ?? 0);
    if (typeof value !== "number") return value;
    if (typeof digits !== "number") return digits;
    const factor = 10 ** Math.max(-10, Math.min(10, Math.trunc(digits)));
    if (name === "ROUNDUP") return (value >= 0 ? Math.ceil(value * factor) : Math.floor(value * factor)) / factor;
    if (name === "ROUNDDOWN") return (value >= 0 ? Math.floor(value * factor) : Math.ceil(value * factor)) / factor;
    return Math.round(value * factor) / factor;
  }
  if (name === "POWER") { const left = toNumber(args[0] ?? null); const right = toNumber(args[1] ?? null); return typeof left === "number" && typeof right === "number" ? left ** right : typeof left !== "number" ? left : right; }
  if (name === "MOD") { const left = toNumber(args[0] ?? null); const right = toNumber(args[1] ?? null); if (typeof left !== "number") return left; if (typeof right !== "number") return right; return right === 0 ? "#DIV/0!" : left % right; }
  if (name === "IF") { const condition = toBoolean(args[0] ?? false); return typeof condition === "boolean" ? (condition ? args[1] ?? true : args[2] ?? false) : condition; }
  if (name === "AND" || name === "OR") {
    const booleans = values.map(toBoolean);
    const error = booleans.find((value) => typeof value !== "boolean");
    if (error && typeof error !== "boolean") return error;
    return name === "AND" ? (booleans as boolean[]).every(Boolean) : (booleans as boolean[]).some(Boolean);
  }
  if (name === "NOT") { const value = toBoolean(args[0] ?? false); return typeof value === "boolean" ? !value : value; }
  if (name === "LEN") { const value = args[0]; return isSpreadsheetError(value ?? null) ? value! : String(value ?? "").length; }
  if (name === "UPPER") return String(args[0] ?? "").toUpperCase();
  if (name === "LOWER") return String(args[0] ?? "").toLowerCase();
  if (name === "TRIM") return String(args[0] ?? "").trim().replace(/\s+/g, " ");
  if (name === "CONCAT" || name === "CONCATENATE") return values.map((value) => String(value ?? "")).join("");
  return "#NAME?";
}

export function evaluateWorkbook(workbook: WorkbookContent): EvaluatedWorkbook {
  const bySheet: EvaluatedWorkbook["bySheet"] = Object.fromEntries(workbook.sheets.map((sheet) => [sheet.id, {}]));
  const cache = new Map<string, EvalValue>();
  const visiting = new Set<string>();

  const resolveCell = (sheetId: string, rawAddress: string): EvalValue => {
    const address = normalizeCellAddress(rawAddress);
    if (!address) return "#REF!";
    const sheet = workbook.sheets.find((entry) => entry.id === sheetId);
    if (!sheet) return "#REF!";
    const key = `${sheetId}:${address}`;
    if (cache.has(key)) return cache.get(key)!;
    if (visiting.has(key)) return "#CYCLE!";
    visiting.add(key);
    const cell = sheet.cells[address];
    let value: EvalValue = cell?.value ?? null;
    if (cell?.formula) {
      try {
        value = new FormulaParser(tokenizeFormula(cell.formula), sheet, workbook, resolveCell).parse();
      } catch {
        value = "#VALUE!";
      }
    }
    visiting.delete(key);
    cache.set(key, value);
    if (!(typeof value === "object" && value !== null)) bySheet[sheetId]![address] = value;
    return value;
  };

  for (const sheet of workbook.sheets) for (const address of Object.keys(sheet.cells)) resolveCell(sheet.id, address);
  return bySheet && { bySheet };
}

export function formatWorkbookValue(value: WorkbookValue | SpreadsheetError, format?: WorkbookCellFormat) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" && value.startsWith("#")) return value;
  const type = format?.numberFormat ?? "general";
  if (type === "text") return String(value);
  if (type === "date") {
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(date);
  }
  if (typeof value !== "number") return String(value);
  const decimals = format?.decimals ?? 2;
  if (type === "currency") return new Intl.NumberFormat(undefined, { style: "currency", currency: format?.currency || "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  if (type === "percent") return new Intl.NumberFormat(undefined, { style: "percent", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  if (type === "number") return new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(12)));
}

export function matrixFromSheet(sheet: WorkbookSheet, evaluated?: EvaluatedWorkbook, formulas = false) {
  const used = sheetUsedRange(sheet);
  const matrix: Array<Array<string | number | boolean | null>> = [];
  for (let row = 1; row <= used.end.row; row += 1) {
    const values: Array<string | number | boolean | null> = [];
    for (let column = 1; column <= used.end.column; column += 1) {
      const address = cellAddress(row, column);
      const cell = sheet.cells[address];
      if (formulas && cell?.formula) values.push(cell.formula);
      else values.push(evaluated?.bySheet[sheet.id]?.[address] ?? cell?.value ?? null);
    }
    matrix.push(values);
  }
  return matrix;
}
