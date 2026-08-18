import { describe, expect, test } from "bun:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  applySigningFieldsToPdf,
  type SigningPdfField,
} from "../supabase/functions/_shared/signing-pdf";

const pixelPng = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
    "base64",
  ),
);

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(digest).toString("hex");
}

async function createThreePageSource() {
  const pdf = await PDFDocument.create();
  pdf.setTitle("OfficeKonnect deterministic three-page signing fixture");
  pdf.setProducer("OfficeKonnect Phase 10");
  pdf.setCreator("OfficeKonnect Phase 10");
  const fixed = new Date("2026-08-18T00:00:00.000Z");
  pdf.setCreationDate(fixed);
  pdf.setModificationDate(fixed);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText(`OfficeKonnect signing source page ${pageNumber}`, {
      x: 48,
      y: 780,
      size: 14,
      font,
    });
  }
  return new Uint8Array(await pdf.save());
}

const fields: SigningPdfField[] = [
  {
    id: "signature-page-1",
    page: 1,
    x: 0.12,
    y: 0.68,
    w: 0.3,
    h: 0.08,
    type: "signature",
    signatureStoragePath: "fixture/signature.png",
  },
  {
    id: "name-page-2",
    page: 2,
    x: 0.12,
    y: 0.45,
    w: 0.4,
    h: 0.05,
    type: "text",
    value: "OfficeKonnect Signer",
  },
  {
    id: "date-page-3",
    page: 3,
    x: 0.12,
    y: 0.3,
    w: 0.25,
    h: 0.05,
    type: "date",
    value: "2026-08-18",
  },
];

describe("OfficeKonnect three-page signing PDF finalization", () => {
  test("renders signature/text/date fields across the immutable three-page source deterministically", async () => {
    const source = await createThreePageSource();
    const sourceHash = await sha256(source);
    const resolveSignature = async (path: string) => {
      expect(path).toBe("fixture/signature.png");
      return pixelPng;
    };

    const first = await applySigningFieldsToPdf(source, fields, resolveSignature);
    const second = await applySigningFieldsToPdf(source, fields, resolveSignature);
    const firstPdf = await PDFDocument.load(first);

    expect(firstPdf.getPageCount()).toBe(3);
    expect(first.length).toBeGreaterThan(source.length);
    expect(await sha256(first)).not.toBe(sourceHash);
    expect(await sha256(first)).toBe(await sha256(second));
  });

  test("rejects out-of-page normalized signing geometry before rendering", async () => {
    const source = await createThreePageSource();
    await expect(
      applySigningFieldsToPdf(
        source,
        [{ ...fields[0]!, x: 0.9, w: 0.2 }],
        async () => pixelPng,
      ),
    ).rejects.toThrow("invalid normalized geometry");
  });

  test("rejects fields that reference pages outside the immutable source", async () => {
    const source = await createThreePageSource();
    await expect(
      applySigningFieldsToPdf(
        source,
        [{ ...fields[1]!, page: 4 }],
        async () => pixelPng,
      ),
    ).rejects.toThrow("references an invalid page");
  });
});
