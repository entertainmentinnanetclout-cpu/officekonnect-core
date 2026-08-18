import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import {
  cellAddress,
  columnIndexToLabel,
  evaluateWorkbook,
  formatWorkbookValue,
  mergeForCell,
  normalizeWorkbookContent,
  parseRange,
  sheetUsedRange,
  type CellRange,
  type WorkbookCell,
  type WorkbookContent,
  type WorkbookSheet,
} from "@/lib/spreadsheet";

const MM_TO_PT = 72 / 25.4;
const A4 = [595.28, 841.89] as const;
const DEFAULT_RENDER_DATE = new Date("2000-01-01T00:00:00.000Z");
const DEFAULT_COLUMN_WIDTH_PT = 84;
const DEFAULT_ROW_HEIGHT_PT = 22.5;
const HEADER_GAP_PT = 22;
const FOOTER_GAP_PT = 20;
const FONT_SIZE = 8.5;
const CELL_PADDING = 3;

export interface SpreadsheetPdfOptions {
  title: string;
  content: unknown;
  sheetIds?: string[];
  renderedAt?: Date | string | null;
}

export interface SpreadsheetPdfResult {
  bytes: Uint8Array;
  pageCount: number;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

interface PageContext {
  page: PDFPage;
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  scale: number;
  columnStart: number;
  columnEnd: number;
  rows: number[];
  headerRows: number[];
}

function safeWinAnsi(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, (character) =>
      character === "\n" || character === "\r" || character === "\t" ? character : "?",
    );
}

function parseHex(value?: string): RGB | undefined {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return undefined;
  return rgb(
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  );
}

function fontForCell(cell: WorkbookCell | undefined, fonts: Fonts) {
  if (cell?.format?.bold && cell.format.italic) return fonts.boldItalic;
  if (cell?.format?.bold) return fonts.bold;
  if (cell?.format?.italic) return fonts.italic;
  return fonts.regular;
}

function dimensions(sheet: WorkbookSheet) {
  const [baseWidth, baseHeight] = A4;
  return sheet.print.orientation === "landscape"
    ? { width: baseHeight, height: baseWidth }
    : { width: baseWidth, height: baseHeight };
}

function columnWidth(sheet: WorkbookSheet, column: number) {
  return (sheet.columnWidths[columnIndexToLabel(column)] ?? 112) * 0.75;
}

function rowHeight(sheet: WorkbookSheet, row: number) {
  return (sheet.rowHeights[String(row)] ?? 30) * 0.75;
}

function printableRange(sheet: WorkbookSheet): CellRange {
  const explicit = sheet.print.printArea ? parseRange(sheet.print.printArea) : null;
  const used = sheetUsedRange(sheet);
  return explicit ?? used;
}

function sumColumnWidths(sheet: WorkbookSheet, start: number, end: number) {
  let width = 0;
  for (let column = start; column <= end; column += 1) width += columnWidth(sheet, column);
  return width;
}

function columnSegments(sheet: WorkbookSheet, range: CellRange, availableWidth: number) {
  if (sheet.print.fitToWidth) return [{ start: range.start.column, end: range.end.column }];
  const segments: Array<{ start: number; end: number }> = [];
  let start = range.start.column;
  let width = 0;
  for (let column = range.start.column; column <= range.end.column; column += 1) {
    const nextWidth = columnWidth(sheet, column);
    if (width > 0 && width + nextWidth > availableWidth) {
      segments.push({ start, end: column - 1 });
      start = column;
      width = 0;
    }
    width += nextWidth;
  }
  segments.push({ start, end: range.end.column });
  return segments;
}

function pageRowGroups(sheet: WorkbookSheet, range: CellRange, availableHeight: number, scale: number) {
  const repeatCount = Math.min(sheet.print.repeatHeaderRows ?? 0, range.end.row);
  const headerRows = Array.from({ length: repeatCount }, (_, index) => index + 1).filter(
    (row) => row >= range.start.row && row <= range.end.row,
  );
  const headerHeight = headerRows.reduce((total, row) => total + rowHeight(sheet, row) * scale, 0);
  const bodyRows = Array.from(
    { length: range.end.row - range.start.row + 1 },
    (_, offset) => range.start.row + offset,
  ).filter((row) => !headerRows.includes(row));
  const groups: number[][] = [];
  let current: number[] = [];
  let height = headerHeight;
  for (const row of bodyRows) {
    const nextHeight = rowHeight(sheet, row) * scale;
    if (current.length > 0 && height + nextHeight > availableHeight) {
      groups.push(current);
      current = [];
      height = headerHeight;
    }
    current.push(row);
    height += nextHeight;
  }
  if (current.length > 0 || bodyRows.length === 0) groups.push(current);
  return { headerRows, groups };
}

function truncateToWidth(text: string, font: PDFFont, size: number, width: number) {
  const safe = safeWinAnsi(text).replace(/[\r\n]+/g, " ");
  if (font.widthOfTextAtSize(safe, size) <= width) return safe;
  const suffix = "...";
  let low = 0;
  let high = safe.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${safe.slice(0, middle)}${suffix}`;
    if (font.widthOfTextAtSize(candidate, size) <= width) low = middle;
    else high = middle - 1;
  }
  return `${safe.slice(0, low)}${suffix}`;
}

function isMergeTopLeft(sheet: WorkbookSheet, row: number, column: number) {
  const merge = mergeForCell(sheet, { row, column });
  if (!merge) return { render: true, range: null };
  return {
    render: row === merge.start.row && column === merge.start.column,
    range: merge,
  };
}

function drawTextInCell(
  page: PDFPage,
  text: string,
  cell: WorkbookCell | undefined,
  fonts: Fonts,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
) {
  if (!text) return;
  const font = fontForCell(cell, fonts);
  const size = Math.max(5.5, FONT_SIZE * Math.min(1.2, scale));
  const safeText = truncateToWidth(text, font, size, Math.max(4, width - CELL_PADDING * 2));
  const textWidth = font.widthOfTextAtSize(safeText, size);
  const align =
    cell?.format?.horizontalAlign ??
    (typeof cell?.value === "number" || cell?.format?.numberFormat === "number" || cell?.format?.numberFormat === "currency" || cell?.format?.numberFormat === "percent"
      ? "right"
      : "left");
  const textX =
    align === "center"
      ? x + Math.max(CELL_PADDING, (width - textWidth) / 2)
      : align === "right"
        ? x + Math.max(CELL_PADDING, width - textWidth - CELL_PADDING)
        : x + CELL_PADDING;
  const textY = y + Math.max(2, (height - size) / 2 + 1);
  page.drawText(safeText, {
    x: textX,
    y: textY,
    size,
    font,
    color: parseHex(cell?.format?.textColor) ?? rgb(0.12, 0.14, 0.18),
  });
  if (cell?.format?.underline) {
    page.drawLine({
      start: { x: textX, y: textY - 1 },
      end: { x: textX + textWidth, y: textY - 1 },
      thickness: 0.5,
      color: parseHex(cell.format.textColor) ?? rgb(0.12, 0.14, 0.18),
    });
  }
  if (cell?.format?.strikethrough) {
    page.drawLine({
      start: { x: textX, y: textY + size * 0.42 },
      end: { x: textX + textWidth, y: textY + size * 0.42 },
      thickness: 0.5,
      color: parseHex(cell.format.textColor) ?? rgb(0.12, 0.14, 0.18),
    });
  }
}

function drawSheetPage(
  workbook: WorkbookContent,
  sheet: WorkbookSheet,
  evaluated: ReturnType<typeof evaluateWorkbook>,
  fonts: Fonts,
  context: PageContext,
) {
  const { page, left, top, scale, columnStart, columnEnd, rows, headerRows } = context;
  const rowSequence = [...headerRows, ...rows];
  const xByColumn = new Map<number, number>();
  let x = left;
  for (let column = columnStart; column <= columnEnd; column += 1) {
    xByColumn.set(column, x);
    x += columnWidth(sheet, column) * scale;
  }

  let yTop = top;
  for (const row of rowSequence) {
    const height = rowHeight(sheet, row) * scale;
    const y = yTop - height;
    for (let column = columnStart; column <= columnEnd; column += 1) {
      const mergeInfo = isMergeTopLeft(sheet, row, column);
      if (!mergeInfo.render) continue;
      const address = cellAddress(row, column);
      const cell = sheet.cells[address];
      let width = columnWidth(sheet, column) * scale;
      let mergedHeight = height;
      if (mergeInfo.range) {
        width = 0;
        for (let mergeColumn = column; mergeColumn <= Math.min(mergeInfo.range.end.column, columnEnd); mergeColumn += 1) width += columnWidth(sheet, mergeColumn) * scale;
        mergedHeight = 0;
        for (let mergeRow = row; mergeRow <= mergeInfo.range.end.row; mergeRow += 1) {
          if (rowSequence.includes(mergeRow)) mergedHeight += rowHeight(sheet, mergeRow) * scale;
        }
        if (mergedHeight <= 0) mergedHeight = height;
      }
      const cellX = xByColumn.get(column) ?? left;
      const background = parseHex(cell?.format?.backgroundColor);
      if (background) page.drawRectangle({ x: cellX, y: y - (mergedHeight - height), width, height: mergedHeight, color: background });
      if (sheet.print.gridlines || cell?.format?.border) {
        page.drawRectangle({
          x: cellX,
          y: y - (mergedHeight - height),
          width,
          height: mergedHeight,
          borderWidth: cell?.format?.border ? 0.8 : 0.35,
          borderColor: cell?.format?.border ? rgb(0.25, 0.28, 0.33) : rgb(0.82, 0.84, 0.87),
        });
      }
      const value = evaluated.bySheet[sheet.id]?.[address] ?? cell?.value ?? null;
      const text = formatWorkbookValue(value, cell?.format);
      drawTextInCell(page, text, cell, fonts, cellX, y - (mergedHeight - height), width, mergedHeight, scale);
    }
    yTop -= height;
  }
}

export async function buildSpreadsheetPdf(options: SpreadsheetPdfOptions): Promise<SpreadsheetPdfResult> {
  const workbook = normalizeWorkbookContent(options.content);
  const selectedSheets = options.sheetIds?.length
    ? workbook.sheets.filter((sheet) => options.sheetIds!.includes(sheet.id))
    : workbook.sheets;
  if (selectedSheets.length === 0) throw new Error("Select at least one worksheet for PDF export");

  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const evaluated = evaluateWorkbook(workbook);

  for (const sheet of selectedSheets) {
    const range = printableRange(sheet);
    const { width, height } = dimensions(sheet);
    const left = sheet.print.margins.left * MM_TO_PT;
    const right = width - sheet.print.margins.right * MM_TO_PT;
    const bottom = sheet.print.margins.bottom * MM_TO_PT + FOOTER_GAP_PT;
    const top = height - sheet.print.margins.top * MM_TO_PT - HEADER_GAP_PT;
    const availableWidth = Math.max(60, right - left);
    const availableHeight = Math.max(80, top - bottom);
    const segments = columnSegments(sheet, range, availableWidth);

    for (const segment of segments) {
      const unscaledWidth = sumColumnWidths(sheet, segment.start, segment.end);
      const fitScale = sheet.print.fitToWidth ? Math.min(1, availableWidth / Math.max(1, unscaledWidth)) : 1;
      const scale = fitScale * Math.max(0.25, Math.min(2, sheet.print.scale / 100));
      const { headerRows, groups } = pageRowGroups(sheet, range, availableHeight, scale);
      for (const rows of groups) {
        if (pdf.getPageCount() >= 500) throw new Error("Spreadsheet PDF exceeds the 500-page safety limit");
        const page = pdf.addPage([width, height]);
        page.drawText(safeWinAnsi(`${options.title} — ${sheet.name}`), {
          x: left,
          y: height - sheet.print.margins.top * MM_TO_PT - 10,
          size: 8.5,
          font: fonts.bold,
          color: rgb(0.25, 0.28, 0.33),
        });
        drawSheetPage(workbook, sheet, evaluated, fonts, {
          page,
          width,
          height,
          left,
          right,
          top,
          bottom,
          scale,
          columnStart: segment.start,
          columnEnd: segment.end,
          rows,
          headerRows,
        });
      }
    }
  }

  const pageCount = pdf.getPageCount();
  pdf.getPages().forEach((page, index) => {
    const { width } = page.getSize();
    const text = `Page ${index + 1} of ${pageCount}`;
    const size = 7.5;
    page.drawText(text, {
      x: width - 36 - fonts.regular.widthOfTextAtSize(text, size),
      y: 18,
      size,
      font: fonts.regular,
      color: rgb(0.45, 0.48, 0.52),
    });
  });

  const renderedAt = options.renderedAt ? new Date(options.renderedAt) : DEFAULT_RENDER_DATE;
  const metadataDate = Number.isNaN(renderedAt.getTime()) ? DEFAULT_RENDER_DATE : renderedAt;
  pdf.setTitle(safeWinAnsi(options.title));
  pdf.setAuthor("OfficeKonnect");
  pdf.setCreator("OfficeKonnect Sheets");
  pdf.setProducer("OfficeKonnect Sheets PDF Engine");
  pdf.setCreationDate(metadataDate);
  pdf.setModificationDate(metadataDate);

  return { bytes: await pdf.save(), pageCount };
}
