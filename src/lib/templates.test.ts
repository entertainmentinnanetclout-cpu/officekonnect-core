import { describe, expect, test } from "bun:test";
import {
  normalizeTemplateCategory,
  normalizeTemplateKind,
  TEMPLATE_CATEGORIES,
  templateSummary,
} from "@/lib/templates";
import { createEmptyWorkbook, updateCellInput, setWorkbookSheet, workbookToJson } from "@/lib/spreadsheet";
import { nativeDocumentToJson, type NativeDocumentContent } from "@/lib/native-document";

describe("OfficeKonnect document templates", () => {
  test("keeps the canonical generic template category set", () => {
    expect(TEMPLATE_CATEGORIES).toEqual([
      "General",
      "Letters",
      "Reports",
      "Meeting Notes",
      "Agreements",
      "Forms",
      "Policies",
      "Proposals",
      "Internal Memos",
      "Spreadsheets",
    ]);
    expect(normalizeTemplateCategory("meeting notes")).toBe("Meeting Notes");
    expect(normalizeTemplateCategory("unknown legacy category")).toBe("General");
  });

  test("does not invent a second template kind contract", () => {
    expect(normalizeTemplateKind("spreadsheet")).toBe("spreadsheet");
    expect(normalizeTemplateKind("document")).toBe("document");
    expect(normalizeTemplateKind("legacy")).toBe("document");
  });

  test("summarizes persisted native document content", () => {
    const content: NativeDocumentContent = {
      schemaVersion: 1,
      page: {
        size: "A4",
        orientation: "portrait",
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        header: "",
        footer: "",
        showPageNumbers: true,
      },
      blocks: [
        { id: "h1", type: "heading", level: 1, html: "Quarterly Report" },
        { id: "p1", type: "paragraph", html: "Actual office performance." },
      ],
    };
    const summary = templateSummary("document", nativeDocumentToJson(content));
    expect(summary.label).toBe("2 blocks");
    expect(summary.detail).toContain("Quarterly Report");
    expect(summary.detail).toContain("Actual office performance.");
  });

  test("summarizes the canonical workbook without flattening formulas", () => {
    let workbook = createEmptyWorkbook();
    const sheet = workbook.sheets[0]!;
    const nextSheet = updateCellInput(updateCellInput(sheet, "A1", "10"), "A2", "=A1*2");
    workbook = setWorkbookSheet(workbook, nextSheet);
    const summary = templateSummary("spreadsheet", workbookToJson(workbook));
    expect(summary.label).toContain("1 sheet");
    expect(summary.label).toContain("2 populated cells");
    expect(summary.detail).toContain(nextSheet.name);
  });
});
