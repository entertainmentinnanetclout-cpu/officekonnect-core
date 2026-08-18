import { describe, expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { buildNativeDocumentPdf } from "@/lib/native-document-pdf.server";

describe("OfficeKonnect native document PDF renderer", () => {
  test("renders rich structured content across deterministic pages", async () => {
    const rendered = await buildNativeDocumentPdf({
      title: "Phase 2 Renderer",
      renderedAt: "2026-08-18T00:00:00.000Z",
      content: {
        schemaVersion: 1,
        page: {
          size: "A4",
          orientation: "portrait",
          margins: { top: 20, right: 20, bottom: 20, left: 20 },
          header: "OfficeKonnect",
          footer: "Internal document",
          showPageNumbers: true,
        },
        blocks: [
          {
            id: "heading",
            type: "heading",
            level: 1,
            html: '<strong>Professional <span style="color:#1f2937">document</span></strong>',
            align: "center",
          },
          {
            id: "paragraph",
            type: "paragraph",
            html: 'Normal <strong>bold</strong> <em>italic</em> <u>underline</u> <s>strike</s> <span style="background-color:#fff3bf">highlight</span>.',
            indent: 2,
          },
          {
            id: "table",
            type: "table",
            rows: [
              ["Item", "Value"],
              ["Campus", "Pretoria"],
            ],
          },
          { id: "break", type: "pageBreak" },
          { id: "after", type: "paragraph", html: "Second page content." },
        ],
      },
    });

    expect(rendered.pageCount).toBe(2);
    expect(rendered.bytes.byteLength).toBeGreaterThan(1000);

    const pdf = await PDFDocument.load(rendered.bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getTitle()).toBe("Phase 2 Renderer");
    expect(pdf.getAuthor()).toBe("OfficeKonnect");
    expect(pdf.getCreator()).toBe("OfficeKonnect Native Document Engine");
    expect(pdf.getCreationDate().toISOString()).toBe("2026-08-18T00:00:00.000Z");
  });

  test("honors Letter landscape page dimensions", async () => {
    const rendered = await buildNativeDocumentPdf({
      title: "Landscape",
      renderedAt: "2026-08-18T00:00:00.000Z",
      content: {
        schemaVersion: 1,
        page: {
          size: "LETTER",
          orientation: "landscape",
          margins: { top: 15, right: 15, bottom: 15, left: 15 },
          header: "",
          footer: "",
          showPageNumbers: false,
        },
        blocks: [{ id: "p", type: "paragraph", html: "Landscape content" }],
      },
    });

    const pdf = await PDFDocument.load(rendered.bytes);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBe(792);
    expect(height).toBe(612);
  });
});
