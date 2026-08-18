import { describe, expect, test } from "bun:test";
import {
  addSheet,
  cellAddress,
  createEmptyWorkbook,
  evaluateWorkbook,
  fillRange,
  getCellInput,
  normalizeWorkbookContent,
  parseRange,
  pasteInputMatrix,
  setWorkbookSheet,
  toggleMerge,
  updateCellInput,
  workbookMetrics,
} from "@/lib/spreadsheet";

describe("OfficeKonnect workbook contract", () => {
  test("normalizes an empty workbook to schemaVersion 1", () => {
    const workbook = normalizeWorkbookContent({ kind: "workbook", schemaVersion: 1, sheets: [] });
    expect(workbook.kind).toBe("workbook");
    expect(workbook.schemaVersion).toBe(1);
    expect(workbook.sheets).toHaveLength(1);
    expect(workbook.activeSheetId).toBe(workbook.sheets[0]!.id);
  });

  test("preserves legacy two-dimensional sheet data inside the canonical workbook", () => {
    const workbook = normalizeWorkbookContent({
      kind: "workbook",
      schemaVersion: 1,
      sheets: [{ id: "legacy", name: "Legacy", data: [["Name", "Total"], ["Office", 42]] }],
    });
    expect(workbook.sheets).toHaveLength(1);
    expect(getCellInput(workbook.sheets[0]!, "A1")).toBe("Name");
    expect(getCellInput(workbook.sheets[0]!, "B2")).toBe("42");
    expect(workbookMetrics(workbook)).toEqual({ sheetCount: 1, cellCount: 4, formulaCount: 0 });
  });

  test("uses stable spreadsheet addresses and ranges", () => {
    expect(cellAddress(1, 1)).toBe("A1");
    expect(cellAddress(12, 28)).toBe("AB12");
    expect(parseRange("C4:A2")).toEqual({
      start: { row: 2, column: 1 },
      end: { row: 4, column: 3 },
    });
  });
});

describe("OfficeKonnect formula engine", () => {
  test("calculates arithmetic, ranges and IF without eval", () => {
    let workbook = createEmptyWorkbook();
    let sheet = workbook.sheets[0]!;
    sheet = updateCellInput(sheet, "A1", "10");
    sheet = updateCellInput(sheet, "A2", "20");
    sheet = updateCellInput(sheet, "B1", "=SUM(A1:A2)");
    sheet = updateCellInput(sheet, "B2", "=IF(B1>=30,\"ready\",\"wait\")");
    sheet = updateCellInput(sheet, "C1", "=(A1+A2)*2");
    workbook = setWorkbookSheet(workbook, sheet);

    const values = evaluateWorkbook(workbook).bySheet[sheet.id]!;
    expect(values.B1).toBe(30);
    expect(values.B2).toBe("ready");
    expect(values.C1).toBe(60);
    expect(workbookMetrics(workbook)).toEqual({ sheetCount: 1, cellCount: 5, formulaCount: 3 });
  });

  test("calculates cross-sheet references", () => {
    let workbook = createEmptyWorkbook();
    const first = workbook.sheets[0]!;
    workbook = addSheet(workbook, "Rates");
    const rates = workbook.sheets.find((sheet) => sheet.name === "Rates")!;
    workbook = setWorkbookSheet(workbook, updateCellInput(rates, "A1", "15"));
    workbook = setWorkbookSheet(workbook, updateCellInput(first, "A1", "='Rates'!A1*2"));

    expect(evaluateWorkbook(workbook).bySheet[first.id]!.A1).toBe(30);
  });

  test("detects formula cycles deterministically", () => {
    let workbook = createEmptyWorkbook();
    let sheet = workbook.sheets[0]!;
    sheet = updateCellInput(sheet, "A1", "=B1");
    sheet = updateCellInput(sheet, "B1", "=A1");
    workbook = setWorkbookSheet(workbook, sheet);
    const values = evaluateWorkbook(workbook).bySheet[sheet.id]!;
    expect(values.A1).toBe("#CYCLE!");
    expect(values.B1).toBe("#CYCLE!");
  });
});

describe("OfficeKonnect spreadsheet editing helpers", () => {
  test("pastes matrices and fills ranges", () => {
    let workbook = createEmptyWorkbook();
    let sheet = workbook.sheets[0]!;
    sheet = pasteInputMatrix(sheet, { row: 1, column: 1 }, [["Name", "Value"], ["Alpha", "4"]]);
    const fill = parseRange("B2:B4")!;
    sheet = fillRange(sheet, fill, "down");
    workbook = setWorkbookSheet(workbook, sheet);
    expect(getCellInput(workbook.sheets[0]!, "B3")).toBe("4");
    expect(getCellInput(workbook.sheets[0]!, "B4")).toBe("4");
  });

  test("stores merge ranges without changing the workbook persistence model", () => {
    const workbook = createEmptyWorkbook();
    const sheet = workbook.sheets[0]!;
    const range = parseRange("A1:C1")!;
    const merged = toggleMerge(sheet, range);
    expect(merged.merges).toEqual([{ range: "A1:C1" }]);
    expect(toggleMerge(merged, range).merges).toHaveLength(0);
  });
});
