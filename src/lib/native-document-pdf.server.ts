import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import {
  htmlToPlainText,
  normalizeNativeDocumentContent,
  type NativeDocumentAlignment,
  type NativeDocumentBlock,
  type NativeDocumentContent,
} from "@/lib/native-document";

const MM_TO_PT = 72 / 25.4;
const PAGE_SIZES = {
  A4: [595.28, 841.89] as const,
  LETTER: [612, 792] as const,
};
const DEFAULT_RENDER_DATE = new Date("2000-01-01T00:00:00.000Z");

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
  renderedAt?: Date | string | null;
}

interface RendererState {
  pdf: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
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
  contentTop: number;
  contentBottom: number;
}

interface InlineStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: RGB;
  background?: RGB;
}

interface InlineRun extends InlineStyle {
  text: string;
}

interface PositionedRun extends InlineRun {
  font: PDFFont;
  width: number;
}

function pageDimensions(content: NativeDocumentContent) {
  const [baseWidth, baseHeight] = PAGE_SIZES[content.page.size];
  return content.page.orientation === "landscape"
    ? { width: baseHeight, height: baseWidth }
    : { width: baseWidth, height: baseHeight };
}

function safeWinAnsi(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "•")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");
}

function parseCssColor(value: string | undefined): RGB | undefined {
  if (!value) return undefined;
  const input = value.trim().toLowerCase();
  const shortHex = input.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("").map((digit) => parseInt(`${digit}${digit}`, 16) / 255);
    return rgb(r, g, b);
  }
  const hex = input.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return rgb(
      parseInt(hex[1].slice(0, 2), 16) / 255,
      parseInt(hex[1].slice(2, 4), 16) / 255,
      parseInt(hex[1].slice(4, 6), 16) / 255,
    );
  }
  const functional = input.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (functional) {
    return rgb(
      Math.min(255, Number(functional[1])) / 255,
      Math.min(255, Number(functional[2])) / 255,
      Math.min(255, Number(functional[3])) / 255,
    );
  }
  return undefined;
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function styleFromTag(tag: string, attributes: string, parent: InlineStyle): InlineStyle {
  const next = { ...parent };
  const normalized = tag.toLowerCase();
  if (normalized === "b" || normalized === "strong") next.bold = true;
  if (normalized === "i" || normalized === "em") next.italic = true;
  if (normalized === "u") next.underline = true;
  if (normalized === "s" || normalized === "strike") next.strike = true;

  const styleMatch = attributes.match(/\bstyle\s*=\s*["']([^"']*)["']/i);
  if (styleMatch) {
    for (const declaration of styleMatch[1].split(";")) {
      const [property, ...rest] = declaration.split(":");
      const value = rest.join(":").trim();
      if (property?.trim().toLowerCase() === "color") next.color = parseCssColor(value) ?? next.color;
      if (property?.trim().toLowerCase() === "background-color") {
        next.background = parseCssColor(value) ?? next.background;
      }
    }
  }
  return next;
}

function parseInlineHtml(html: string): InlineRun[] {
  const source = html.replace(/<br\s*\/?>/gi, "\n");
  const runs: InlineRun[] = [];
  const stack: Array<{ tag: string; style: InlineStyle }> = [{ tag: "root", style: {} }];
  const tokenPattern = /<\/?([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(source))) {
    if (match[3] != null) {
      const text = safeWinAnsi(decodeEntities(match[3]));
      if (text) runs.push({ text, ...stack[stack.length - 1].style });
      continue;
    }

    const full = match[0];
    const tag = (match[1] ?? "").toLowerCase();
    const isClosing = full.startsWith("</");
    if (isClosing) {
      const index = stack.map((entry) => entry.tag).lastIndexOf(tag);
      if (index > 0) stack.splice(index);
      continue;
    }
    if (tag === "br") {
      runs.push({ text: "\n", ...stack[stack.length - 1].style });
      continue;
    }
    if (["b", "strong", "i", "em", "u", "s", "strike", "span", "a"].includes(tag)) {
      stack.push({
        tag,
        style: styleFromTag(tag, match[2] ?? "", stack[stack.length - 1].style),
      });
    }
  }

  return runs.length > 0 ? runs : [{ text: safeWinAnsi(htmlToPlainText(html)) }];
}

function fontForStyle(state: RendererState, style: InlineStyle) {
  if (style.bold && style.italic) return state.boldItalic;
  if (style.bold) return state.bold;
  if (style.italic) return state.italic;
  return state.regular;
}

function tokenizeRuns(state: RendererState, runs: InlineRun[], size: number): PositionedRun[] {
  const tokens: PositionedRun[] = [];
  for (const run of runs) {
    const parts = run.text.split(/(\n|\s+)/).filter((part) => part.length > 0);
    const font = fontForStyle(state, run);
    for (const part of parts) {
      tokens.push({ ...run, text: part, font, width: font.widthOfTextAtSize(part, size) });
    }
  }
  return tokens;
}

function layoutRuns(tokens: PositionedRun[], maxWidth: number) {
  const lines: PositionedRun[][] = [[]];
  let lineWidth = 0;

  for (const token of tokens) {
    if (token.text === "\n") {
      lines.push([]);
      lineWidth = 0;
      continue;
    }
    const isSpace = /^\s+$/.test(token.text);
    if (!isSpace && lineWidth > 0 && lineWidth + token.width > maxWidth) {
      lines.push([]);
      lineWidth = 0;
    }
    if (isSpace && lineWidth === 0) continue;
    lines[lines.length - 1].push(token);
    lineWidth += token.width;
  }

  return lines.length > 0 ? lines : [[]];
}

function lineWidth(line: PositionedRun[]) {
  return line.reduce((sum, run) => sum + run.width, 0);
}

function alignmentOffset(align: NativeDocumentAlignment | undefined, width: number, used: number) {
  if (align === "center") return Math.max(0, (width - used) / 2);
  if (align === "right") return Math.max(0, width - used);
  return 0;
}

function plainCompanyDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.entries(value as Record<string, unknown>)
    .filter(([, detail]) => typeof detail === "string" || typeof detail === "number")
    .map(([key, detail]) => `${key.replace(/_/g, " ")}: ${String(detail)}`)
    .join(" • ");
}

function chromeReservation(state: Omit<RendererState, "page" | "y">) {
  const hasHeader = Boolean(
    state.logo ||
      state.letterhead?.header_content?.trim() ||
      plainCompanyDetails(state.letterhead?.company_details) ||
      state.content.page.header.trim(),
  );
  const hasFooter = Boolean(
    state.letterhead?.footer_content?.trim() ||
      state.content.page.footer.trim() ||
      state.content.page.showPageNumbers,
  );
  return {
    contentTop: Math.max(state.top, hasHeader ? 54 : state.top),
    contentBottom: Math.max(state.bottom, hasFooter ? 36 : state.bottom),
  };
}

function createPage(state: Omit<RendererState, "page" | "y">) {
  const page = state.pdf.addPage([state.width, state.height]);
  return {
    ...state,
    page,
    y: state.height - state.contentTop,
  } satisfies RendererState;
}

function ensureSpace(state: RendererState, needed: number) {
  if (state.y - needed >= state.contentBottom) return state;
  return createPage(state);
}

function drawRichTextBlock(
  state: RendererState,
  html: string,
  options: {
    size: number;
    lineHeight?: number;
    before?: number;
    after?: number;
    indent?: number;
    align?: NativeDocumentAlignment;
    baseStyle?: InlineStyle;
    color?: RGB;
  },
) {
  const lineHeight = options.lineHeight ?? options.size * 1.35;
  const before = options.before ?? 0;
  const after = options.after ?? 0;
  const indent = Math.max(0, options.indent ?? 0);
  let next = ensureSpace(state, before + lineHeight);
  next.y -= before;

  const availableWidth = Math.max(12, next.width - next.left - next.right - indent);
  const parsed = parseInlineHtml(html).map((run) => ({
    ...options.baseStyle,
    ...run,
    color: run.color ?? options.color ?? options.baseStyle?.color,
  }));
  const lines = layoutRuns(tokenizeRuns(next, parsed, options.size), availableWidth);

  for (const line of lines) {
    next = ensureSpace(next, lineHeight);
    const usedWidth = lineWidth(line);
    let x = next.left + indent + alignmentOffset(options.align, availableWidth, usedWidth);
    const baseline = next.y - options.size;

    for (const run of line) {
      if (run.background && run.text.trim()) {
        next.page.drawRectangle({
          x,
          y: baseline - 1.5,
          width: run.width,
          height: options.size + 3,
          color: run.background,
        });
      }
      if (run.text) {
        next.page.drawText(run.text, {
          x,
          y: baseline,
          size: options.size,
          font: run.font,
          color: run.color ?? rgb(0.08, 0.1, 0.14),
        });
      }
      if (run.underline && run.text.trim()) {
        next.page.drawLine({
          start: { x, y: baseline - 1.5 },
          end: { x: x + run.width, y: baseline - 1.5 },
          thickness: 0.6,
          color: run.color ?? rgb(0.08, 0.1, 0.14),
        });
      }
      if (run.strike && run.text.trim()) {
        next.page.drawLine({
          start: { x, y: baseline + options.size * 0.34 },
          end: { x: x + run.width, y: baseline + options.size * 0.34 },
          thickness: 0.6,
          color: run.color ?? rgb(0.08, 0.1, 0.14),
        });
      }
      x += run.width;
    }
    next.y -= lineHeight;
  }

  next.y -= after;
  return next;
}

function drawPlainTextBlock(
  state: RendererState,
  text: string,
  options: {
    size: number;
    lineHeight?: number;
    before?: number;
    after?: number;
    indent?: number;
    align?: NativeDocumentAlignment;
    baseStyle?: InlineStyle;
    color?: RGB;
  },
) {
  return drawRichTextBlock(state, safeWinAnsi(text).replace(/&/g, "&amp;").replace(/</g, "&lt;"), options);
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
    const font = rowIndex === 0 ? next.bold : next.regular;
    const wrapped = Array.from({ length: maxColumns }, (_, columnIndex) => {
      const words = safeWinAnsi(htmlToPlainText(row[columnIndex] ?? "")).split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, fontSize) <= columnWidth - padding * 2 || !current) {
          current = candidate;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
      return lines.length > 0 ? lines : [""];
    });
    const rowHeight = Math.max(...wrapped.map((cell) => cell.length)) * lineHeight + padding * 2;
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

function indentPoints(block: NativeDocumentBlock) {
  return "indent" in block && block.indent ? block.indent * 18 : 0;
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
    const indent = 12 + indentPoints(block);
    block.items.forEach((item, index) => {
      const prefix = block.type === "bulletList" ? "•" : `${index + 1}.`;
      next = drawPlainTextBlock(next, `${prefix} ${htmlToPlainText(item)}`, {
        size: 10.5,
        lineHeight: 14,
        indent,
        after: 2,
      });
    });
    next.y -= 4;
    return next;
  }

  if (block.type === "heading") {
    const sizes = { 1: 21, 2: 16, 3: 13 } as const;
    return drawRichTextBlock(state, block.html, {
      size: sizes[block.level],
      baseStyle: { bold: true },
      lineHeight: sizes[block.level] * 1.2,
      before: block.level === 1 ? 10 : 7,
      after: block.level === 1 ? 9 : 6,
      align: block.align,
      indent: indentPoints(block),
    });
  }

  if (block.type === "quote") {
    const beforeY = state.y;
    const rendered = drawRichTextBlock(state, block.html, {
      size: 10,
      baseStyle: { italic: true },
      lineHeight: 14,
      indent: 18 + indentPoints(block),
      before: 5,
      after: 8,
      color: rgb(0.25, 0.28, 0.34),
      align: block.align,
    });
    if (rendered.page === state.page) {
      rendered.page.drawLine({
        start: { x: rendered.left + 6 + indentPoints(block), y: beforeY - 2 },
        end: { x: rendered.left + 6 + indentPoints(block), y: Math.max(rendered.y + 6, rendered.contentBottom) },
        thickness: 2,
        color: rgb(0.58, 0.62, 0.7),
      });
    }
    return rendered;
  }

  if (block.type === "paragraph") {
    return drawRichTextBlock(state, block.html, {
      size: 10.5,
      lineHeight: 14.5,
      after: 6,
      align: block.align,
      indent: indentPoints(block),
    });
  }

  return state;
}

function drawPageChrome(state: RendererState, page: PDFPage, pageNumber: number, totalPages: number) {
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
    page.drawImage(state.logo, { x: state.left, y: headerY - height + 3, width, height });
    headerX += width + 10;
  }

  const chromeText = safeWinAnsi(header || companyDetails);
  if (chromeText) {
    const maxWidth = state.width - headerX - state.right;
    const words = chromeText.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (state.regular.widthOfTextAtSize(candidate, 7.5) <= maxWidth || !current) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
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
    page.drawText(safeWinAnsi(footer).slice(0, 160), {
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

function renderDate(value: NativeDocumentPdfOptions["renderedAt"]) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return DEFAULT_RENDER_DATE;
}

export async function buildNativeDocumentPdf(options: NativeDocumentPdfOptions) {
  const content = normalizeNativeDocumentContent(options.content);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
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

  const baseWithoutReservation = {
    pdf,
    regular,
    bold,
    italic,
    boldItalic,
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
  const reservation = chromeReservation({
    ...baseWithoutReservation,
    contentTop: 0,
    contentBottom: 0,
  } as Omit<RendererState, "page" | "y">);
  const base = { ...baseWithoutReservation, ...reservation };

  let state = createPage(base);
  for (const block of content.blocks) state = drawBlock(state, block);

  const pages = pdf.getPages();
  pages.forEach((page, index) => drawPageChrome(state, page, index + 1, pages.length));

  const timestamp = renderDate(options.renderedAt);
  pdf.setTitle(safeWinAnsi(options.title));
  pdf.setAuthor("OfficeKonnect");
  pdf.setCreator("OfficeKonnect Native Document Engine");
  pdf.setProducer("OfficeKonnect");
  pdf.setCreationDate(timestamp);
  pdf.setModificationDate(timestamp);

  return {
    bytes: new Uint8Array(await pdf.save({ useObjectStreams: false })),
    pageCount: pages.length,
    content,
  };
}
