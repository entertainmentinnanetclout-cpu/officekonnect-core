import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import {
  htmlToPlainText,
  normalizeNativeDocumentContent,
  type NativeDocumentBlock,
  type NativeDocumentContent,
} from "@/lib/native-document";

const MM_TO_PT = 72 / 25.4;
const PAGE_SIZES = {
  A4: [595.28, 841.89] as const,
  LETTER: [612, 792] as const,
};

export interface NativeDocumentPdfLetterhead {
  name?: string | null;
  header_content?: string | null;
  footer_content?: string | null;
  company_details?: unknown;
}

export interface NativeDocumentPdfOptions {
  title: string;
  content: unknown;
  letterhead?: NativeDocumentPdfLetterhead | null;
  logoBytes?: Uint8Array | null;
  logoMimeType?: string | null;
}

interface RendererState {
  pdf: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  content: NativeDocumentContent;
  title: string;
  letterhead?: NativeDocumentPdfLetterhead | null;
  logo?: PDFImage | null;
  page: PDFPage;
  y: number;
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function pageDimensions(content: NativeDocumentContent) {
  const [baseWidth, baseHeight] = PAGE_SIZES[content.page.size];
  return content.page.orientation === "landscape"
    ? { width: baseHeight, height: baseWidth }
    : { width: baseWidth, height: baseHeight };
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const paragraphs = text.replace(/\r/g, "").split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || current.length === 0) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

function plainCompanyDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value as Record<string, unknown>)
    .filter(([, detail]) => typeof detail === "string" || typeof detail === "number")
    .map(([key, detail]) => `${key.replace(/_/g, " ")}: ${String(detail)}`)
    .join(" • ");
}

function createPage(state: Omit<RendererState, "page" | "y">) {
  const page = state.pdf.addPage([state.width, state.height]);
  return {
    ...state,
    page,
    y: state.height - state.top,
  } satisfies RendererState;
}

function ensureSpace(state: RendererState, needed: number) {
  if (state.y - needed >= state.bottom) return state;
  return createPage(state);
}

function drawTextBlock(
  state: RendererState,
  text: string,
  options: {
    size: number;
    font?: PDFFont;
    lineHeight?: number;
    indent?: number;
    before?: number;
    after?: number;
    color?: ReturnType<typeof rgb>;
  },
) {
  const font = options.font ?? state.regular;
  const lineHeight = options.lineHeight ?? options.size * 1.35;
  const indent = options.indent ?? 0;
  const before = options.before ?? 0;
  const after = options.after ?? 0;
  const color = options.color ?? rgb(0.08, 0.1, 0.14);
  let next = ensureSpace(state, before + lineHeight);
  next.y -= before;

  const availableWidth = next.width - next.left - next.right - indent;
  const lines = wrapText(text, font, options.size, availableWidth);

  for (const line of lines) {
    next = ensureSpace(next, lineHeight);
    if (line) {
      next.page.drawText(line, {
        x: next.left + indent,
        y: next.y - options.size,
        size: options.size,
        font,
        color,
        maxWidth: availableWidth,
      });
    }
    next.y -= lineHeight;
  }

  next.y -= after;
  return next;
}

function drawTable(state: RendererState, rows: string[][]) {
  if (rows.length === 0) return state;
  const maxColumns = Math.max(...rows.map((row) => row.length), 1);
  const tableWidth = state.width - state.left - state.right;
  const columnWidth = tableWidth / maxColumns;
  const padding = 5;
  const fontSize = 8.5;
  const lineHeight = 11;
  let next = state;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const wrapped = Array.from({ length: maxColumns }, (_, columnIndex) =>
      wrapText(
        htmlToPlainText(row[columnIndex] ?? ""),
        rowIndex === 0 ? next.bold : next.regular,
        fontSize,
        columnWidth - padding * 2,
      ),
    );
    const rowHeight =
      Math.max(...wrapped.map((cell) => Math.max(cell.length, 1))) * lineHeight + padding * 2;
    next = ensureSpace(next, rowHeight + 5);

    for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
      const x = next.left + columnIndex * columnWidth;
      const y = next.y - rowHeight;
      next.page.drawRectangle({
        x,
        y,
        width: columnWidth,
        height: rowHeight,
        borderColor: rgb(0.78, 0.8, 0.84),
        borderWidth: 0.7,
        color: rowIndex === 0 ? rgb(0.96, 0.97, 0.98) : undefined,
      });
      const font = rowIndex === 0 ? next.bold : next.regular;
      wrapped[columnIndex].forEach((line, lineIndex) => {
        if (!line) return;
        next.page.drawText(line, {
          x: x + padding,
          y: next.y - padding - fontSize - lineIndex * lineHeight,
          size: fontSize,
          font,
          color: rgb(0.1, 0.12, 0.16),
          maxWidth: columnWidth - padding * 2,
        });
      });
    }
    next.y -= rowHeight;
  }

  next.y -= 10;
  return next;
}

function drawBlock(state: RendererState, block: NativeDocumentBlock) {
  if (block.type === "pageBreak") return createPage(state);

  if (block.type === "rule") {
    const next = ensureSpace(state, 18);
    next.y -= 8;
    next.page.drawLine({
      start: { x: next.left, y: next.y },
      end: { x: next.width - next.right, y: next.y },
      thickness: 0.8,
      color: rgb(0.72, 0.74, 0.78),
    });
    next.y -= 10;
    return next;
  }

  if (block.type === "table") return drawTable(state, block.rows);

  if (block.type === "bulletList" || block.type === "orderedList") {
    let next = state;
    block.items.forEach((item, index) => {
      const prefix = block.type === "bulletList" ? "•" : `${index + 1}.`;
      next = drawTextBlock(next, `${prefix} ${htmlToPlainText(item)}`, {
        size: 10.5,
        lineHeight: 14,
        indent: 12,
        after: 2,
      });
    });
    next.y -= 4;
    return next;
  }

  if (block.type === "heading") {
    const sizes = { 1: 21, 2: 16, 3: 13 } as const;
    return drawTextBlock(state, htmlToPlainText(block.html), {
      size: sizes[block.level],
      font: state.bold,
      lineHeight: sizes[block.level] * 1.2,
      before: block.level === 1 ? 10 : 7,
      after: block.level === 1 ? 9 : 6,
    });
  }

  if (block.type === "quote") {
    const next = ensureSpace(state, 24);
    const startY = next.y;
    const rendered = drawTextBlock(next, htmlToPlainText(block.html), {
      size: 10,
      font: next.italic,
      lineHeight: 14,
      indent: 18,
      before: 5,
      after: 8,
      color: rgb(0.25, 0.28, 0.34),
    });
    rendered.page.drawLine({
      start: { x: rendered.left + 6, y: startY - 2 },
      end: { x: rendered.left + 6, y: Math.max(rendered.y + 6, rendered.bottom) },
      thickness: 2,
      color: rgb(0.58, 0.62, 0.7),
    });
    return rendered;
  }

  if (block.type === "paragraph") {
    return drawTextBlock(state, htmlToPlainText(block.html), {
      size: 10.5,
      lineHeight: 14.5,
      after: 6,
    });
  }

  return state;
}

function drawPageChrome(
  state: RendererState,
  page: PDFPage,
  pageNumber: number,
  totalPages: number,
) {
  const letterheadHeader = state.letterhead?.header_content?.trim() ?? "";
  const companyDetails = plainCompanyDetails(state.letterhead?.company_details);
  const header = [letterheadHeader, state.content.page.header.trim()].filter(Boolean).join(" • ");
  const footer = [state.letterhead?.footer_content?.trim() ?? "", state.content.page.footer.trim()]
    .filter(Boolean)
    .join(" • ");

  const headerY = state.height - Math.max(18, state.top * 0.45);
  let headerX = state.left;
  if (state.logo) {
    const maxHeight = 26;
    const scale = Math.min(maxHeight / state.logo.height, 90 / state.logo.width, 1);
    const width = state.logo.width * scale;
    const height = state.logo.height * scale;
    page.drawImage(state.logo, {
      x: state.left,
      y: headerY - height + 3,
      width,
      height,
    });
    headerX += width + 10;
  }

  const chromeText = header || companyDetails;
  if (chromeText) {
    const lines = wrapText(chromeText, state.regular, 7.5, state.width - headerX - state.right);
    lines.slice(0, 2).forEach((line, index) => {
      page.drawText(line, {
        x: headerX,
        y: headerY - index * 9,
        size: 7.5,
        font: state.regular,
        color: rgb(0.34, 0.37, 0.42),
      });
    });
  }

  const footerY = Math.max(16, state.bottom * 0.35);
  if (footer) {
    page.drawText(footer.slice(0, 160), {
      x: state.left,
      y: footerY,
      size: 7.5,
      font: state.regular,
      color: rgb(0.4, 0.43, 0.48),
      maxWidth: state.width - state.left - state.right - 70,
    });
  }

  if (state.content.page.showPageNumbers) {
    const label = `${pageNumber} / ${totalPages}`;
    page.drawText(label, {
      x: state.width - state.right - state.regular.widthOfTextAtSize(label, 7.5),
      y: footerY,
      size: 7.5,
      font: state.regular,
      color: rgb(0.4, 0.43, 0.48),
    });
  }
}

export async function buildNativeDocumentPdf(options: NativeDocumentPdfOptions) {
  const content = normalizeNativeDocumentContent(options.content);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const { width, height } = pageDimensions(content);
  const margins = content.page.margins;

  let logo: PDFImage | null = null;
  if (options.logoBytes && options.logoBytes.byteLength > 0) {
    try {
      logo =
        options.logoMimeType?.toLowerCase().includes("jpeg") ||
        options.logoMimeType?.toLowerCase().includes("jpg")
          ? await pdf.embedJpg(options.logoBytes)
          : await pdf.embedPng(options.logoBytes);
    } catch {
      logo = null;
    }
  }

  const base = {
    pdf,
    regular,
    bold,
    italic,
    content,
    title: options.title,
    letterhead: options.letterhead,
    logo,
    width,
    height,
    left: margins.left * MM_TO_PT,
    right: margins.right * MM_TO_PT,
    top: margins.top * MM_TO_PT,
    bottom: margins.bottom * MM_TO_PT,
  };

  let state = createPage(base);
  for (const block of content.blocks) {
    state = drawBlock(state, block);
  }

  const pages = pdf.getPages();
  pages.forEach((page, index) => drawPageChrome(state, page, index + 1, pages.length));

  pdf.setTitle(options.title);
  pdf.setAuthor("OfficeKonnect");
  pdf.setCreator("OfficeKonnect Native Document Engine");
  pdf.setProducer("OfficeKonnect");
  pdf.setCreationDate(new Date());
  pdf.setModificationDate(new Date());

  return {
    bytes: new Uint8Array(await pdf.save()),
    pageCount: pages.length,
    content,
  };
}
