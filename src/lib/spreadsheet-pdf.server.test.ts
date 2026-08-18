import { describe, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { buildSpreadsheetPdf } from "@/lib/spreadsheet-pdf.server";
import {
  addSheet,
  createEmptyWorkbook,
  setWorkbookSheet,
  updateCellFormat,
  updateCellInput,
  parseRange,
} from "@/lib/spreadsheet";

describe("OfficeKonnect Sheets PDF renderer", () => {
  test("renders selected worksheets into a real deterministic PDF", async () => {
    let workbook = createEmptyWorkbook();
    let first = workbook.sheets[0]!;
    first = { ...first, name: "Summary" };
    first = updateCellInput(first, "A1", "Department");
    first = updateCellInput(first, "B1", "Budget");
    first = updateCellInput(first, "A2", "Operations");
    first = updateCellInput(first, "B2", "1200");
    first = updateCellInput(first, "B3", "=B2*1.1");
    first = updateCellFormat(first, parseRange("A1:B1")!, { bold: true, backgroundColor: "#e2e8f0", border: true });
    first = { ...first, print: { ...first.print, printArea: "A1:B3", repeatHeaderRows: 1 } };
    workbook = setWorkbookSheet(workbook, first);
    workbook = addSheet(workbook, "Landscape");
    let second = workbook.sheets.find((sheet) => sheet.name === "Landscape")!;
    second = updateCellInput(second, "A1", "A wide printable sheet");
    second = { ...second, print: { ...second.print, orientation: "landscape" } };
    workbook = setWorkbookSheet(workbook, second);

    const rendered = await buildSpreadsheetPdf({
      title: "Quarterly workbook",
      content: workbook,
      renderedAt: "2026-08-18T04:00:00.000Z",
    });
    const pdf = await PDFDocument.load(rendered.bytes);

    expect(rendered.pageCount).toBeGreaterThanOrEqual(2);
    expect(pdf.getPageCount()).toBe(rendered.pageCount);
    expect(pdf.getTitle()).toBe("Quarterly workbook");
    expect(pdf.getAuthor()).toBe("OfficeKonnect");
    expect(pdf.getCreator()).toBe("OfficeKonnect Sheets");
    const pages = pdf.getPages();
    expect(pages[0]!.getWidth()).toBeLessThan(pages[0]!.getHeight());
    expect(pages.at(-1)!.getWidth()).toBeGreaterThan(pages.at(-1)!.getHeight());
  });

  test("renders only explicitly selected worksheets", async () => {
    let workbook = createEmptyWorkbook();
    workbook = addSheet(workbook, "Second");
    const second = workbook.sheets.find((sheet) => sheet.name === "Second")!;
    const rendered = await buildSpreadsheetPdf({
      title: "Single sheet export",
      content: workbook,
      sheetIds: [second.id],
      renderedAt: "2026-08-18T04:00:00.000Z",
    });
    const pdf = await PDFDocument.load(rendered.bytes);
    expect(pdf.getPageCount()).toBe(1);
  });
});
