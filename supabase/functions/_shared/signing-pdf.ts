import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export interface SigningPdfField {
  id: string;
  page: number | string;
  x: number | string;
  y: number | string;
  w: number | string;
  h: number | string;
  rotation?: number | string | null;
  type: string;
  signatureStoragePath?: string | null;
  value?: unknown;
}

export type SignatureAssetResolver = (storagePath: string) => Promise<Uint8Array>;

function normalizedNumber(value: number | string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number`);
  return parsed;
}

function normalizedBox(field: SigningPdfField) {
  const x = normalizedNumber(field.x, `Signing field ${field.id} x`);
  const y = normalizedNumber(field.y, `Signing field ${field.id} y`);
  const w = normalizedNumber(field.w, `Signing field ${field.id} width`);
  const h = normalizedNumber(field.h, `Signing field ${field.id} height`);
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x > 1 || y > 1 || x + w > 1 || y + h > 1) {
    throw new Error(`Signing field ${field.id} has invalid normalized geometry`);
  }
  return { x, y, w, h };
}

export async function applySigningFieldsToPdf(
  sourceBytes: Uint8Array,
  fields: SigningPdfField[],
  resolveSignatureAsset: SignatureAssetResolver,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const field of fields) {
    const pageIndex = normalizedNumber(field.page, `Signing field ${field.id} page`) - 1;
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pdf.getPageCount()) {
      throw new Error(`Signing field ${field.id} references an invalid page`);
    }

    const box = normalizedBox(field);
    const page = pdf.getPage(pageIndex);
    const { width, height } = page.getSize();
    const x = box.x * width;
    const boxWidth = box.w * width;
    const boxHeight = box.h * height;
    const y = height - box.y * height - boxHeight;
    const rotationValue = normalizedNumber(
      field.rotation ?? 0,
      `Signing field ${field.id} rotation`,
    );
    const rotation = degrees(rotationValue);

    if (field.type === "signature" || field.type === "initial") {
      if (!field.signatureStoragePath) {
        throw new Error(`Signature image missing for required field ${field.id}`);
      }
      const imageBytes = await resolveSignatureAsset(field.signatureStoragePath);
      let image;
      try {
        image = await pdf.embedPng(imageBytes);
      } catch {
        image = await pdf.embedJpg(imageBytes);
      }
      page.drawImage(image, { x, y, width: boxWidth, height: boxHeight, rotate: rotation });
      continue;
    }

    const value = String(field.value ?? "");
    page.drawText(value, {
      x: x + 2,
      y: y + Math.max(2, boxHeight / 2 - 5),
      size: Math.min(11, Math.max(7, boxHeight * 0.42)),
      font,
      color: rgb(0.05, 0.08, 0.13),
      rotate: rotation,
      maxWidth: Math.max(4, boxWidth - 4),
    });
  }

  return new Uint8Array(await pdf.save());
}
