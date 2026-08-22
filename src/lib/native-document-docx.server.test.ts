import { describe, expect, test } from "bun:test";
import { buildNativeDocumentDocx } from "@/lib/native-document-docx.server";

const sample = {
  schemaVersion: 1 as const,
  page: {
    size: "A4" as const,
    orientation: "portrait" as const,
    margins: { top: 20, right: 22, bottom: 24, left: 22 },
    header: "OfficeKonnect fidelity test",
    footer: "Confidential",
    showPageNumbers: true,
  },
  blocks: [
    {
      id: "heading",
      type: "heading" as const,
      level: 1 as const,
      html: "<strong>Structured Word export</strong>",
      align: "center" as const,
    },
    {
      id: "paragraph",
      type: "paragraph" as const,
      html: 'A <strong>bold</strong>, <em>italic</em>, <u>underlined</u> and <span style="color:#1f4e79">coloured</span> paragraph with <a href="https://example.com">a link</a>.<br>Second line.',
      align: "justify" as const,
    },
    {
      id: "bullets",
      type: "bulletList" as const,
      items: ["First bullet", "Second <strong>bullet</strong>"],
      indent: 1,
    },
    {
      id: "numbers",
      type: "orderedList" as const,
      items: ["First numbered item", "Second numbered item"],
    },
    {
      id: "table",
      type: "table" as const,
      rows: [
        ["Name", "Status"],
        ["OfficeKonnect", "Ready"],
      ],
    },
    { id: "break", type: "pageBreak" as const },
    {
      id: "quote",
      type: "quote" as const,
      html: "A quoted paragraph on the second page.",
      indent: 1,
    },
  ],
};

describe("native document DOCX renderer", () => {
  test("produces a real OOXML ZIP package from structured content", async () => {
    const rendered = await buildNativeDocumentDocx({ title: "Fidelity test", content: sample });

    expect(rendered.bytes.byteLength).toBeGreaterThan(2_000);
    expect(rendered.bytes[0]).toBe(0x50);
    expect(rendered.bytes[1]).toBe(0x4b);
  });

  test("supports Letter landscape page geometry", async () => {
    const rendered = await buildNativeDocumentDocx({
      title: "Landscape",
      content: {
        ...sample,
        page: {
          ...sample.page,
          size: "LETTER",
          orientation: "landscape",
        },
      },
    });

    expect(rendered.bytes.byteLength).toBeGreaterThan(2_000);
    expect(new TextDecoder().decode(rendered.bytes.slice(0, 2))).toBe("PK");
  });
});
