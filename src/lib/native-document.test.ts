import { describe, expect, test } from "bun:test";
import {
  createEmptyNativeDocument,
  htmlToPlainText,
  nativeDocumentWordCount,
  normalizeNativeDocumentContent,
} from "@/lib/native-document";

describe("native document contract", () => {
  test("creates a canonical empty OfficeKonnect document", () => {
    const content = createEmptyNativeDocument();
    expect(content.schemaVersion).toBe(1);
    expect(content.page.size).toBe("A4");
    expect(content.page.orientation).toBe("portrait");
    expect(content.blocks).toHaveLength(1);
    expect(content.blocks[0]?.type).toBe("paragraph");
  });

  test("normalizes unsafe page values and persisted indent", () => {
    const content = normalizeNativeDocumentContent({
      schemaVersion: 1,
      page: {
        size: "OTHER",
        orientation: "sideways",
        margins: { top: -20, right: 200, bottom: 17, left: 0 },
        showPageNumbers: false,
      },
      blocks: [
        { id: "p1", type: "paragraph", html: "Hello", indent: 3.4, align: "center" },
        { id: "p2", type: "paragraph", html: "World", indent: 99 },
      ],
    });

    expect(content.page.size).toBe("A4");
    expect(content.page.orientation).toBe("portrait");
    expect(content.page.margins).toEqual({ top: 5, right: 60, bottom: 17, left: 5 });
    expect(content.page.showPageNumbers).toBe(false);
    expect(content.blocks[0]).toMatchObject({ id: "p1", indent: 3, align: "center" });
    expect(content.blocks[1]).toMatchObject({ id: "p2", indent: 8 });
  });

  test("counts rich text, list and table words without markup", () => {
    const content = normalizeNativeDocumentContent({
      schemaVersion: 1,
      page: {},
      blocks: [
        { id: "h", type: "heading", level: 1, html: "<strong>Quarterly report</strong>" },
        { id: "p", type: "paragraph", html: "Revenue &amp; costs" },
        { id: "l", type: "bulletList", items: ["North campus", "South campus"] },
        { id: "t", type: "table", rows: [["Approved budget", "R 100"]] },
      ],
    });

    expect(nativeDocumentWordCount(content)).toBe(13);
    expect(htmlToPlainText("A &amp; B<br>C &#x27;D&#x27;")).toBe("A & B\nC 'D'");
  });
});
