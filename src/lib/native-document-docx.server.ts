import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  type ParagraphChild,
} from "docx";
import type { Json } from "@/integrations/supabase/types";
import {
  htmlToPlainText,
  normalizeNativeDocumentContent,
  type NativeDocumentAlignment,
  type NativeDocumentBlock,
} from "@/lib/native-document";

const A4 = { width: 11906, height: 16838 };
const LETTER = { width: 12240, height: 15840 };
const ORDERED_LIST_REFERENCE = "officekonnect-ordered-list";

function mmToTwips(mm: number) {
  return Math.round(mm * 56.6929133858);
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function normalizeHexColor(value: string | undefined) {
  if (!value) return undefined;
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase();
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return hex
      .split("")
      .map((part) => `${part}${part}`)
      .join("")
      .toUpperCase();
  }
  return undefined;
}

function colorFromTag(tag: string) {
  const styleColor = tag.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,6})/i)?.[1];
  if (styleColor) return normalizeHexColor(styleColor);
  const fontColor = tag.match(/\bcolor\s*=\s*["']?(#[0-9a-f]{3,6})/i)?.[1];
  return normalizeHexColor(fontColor);
}

type InlineStyle = {
  bold: boolean;
  italics: boolean;
  underline: boolean;
  strike: boolean;
  color?: string;
  href?: string;
};

type InlineFrame = {
  tag: string;
  style: InlineStyle;
};

function cloneStyle(style: InlineStyle): InlineStyle {
  return { ...style };
}

function inlineChildren(html: string): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  const stack: InlineFrame[] = [];
  let style: InlineStyle = {
    bold: false,
    italics: false,
    underline: false,
    strike: false,
  };

  const pushText = (raw: string) => {
    const text = decodeHtml(raw);
    if (!text) return;

    const run = new TextRun({
      text,
      bold: style.bold || undefined,
      italics: style.italics || undefined,
      underline: style.underline ? { type: UnderlineType.SINGLE } : undefined,
      strike: style.strike || undefined,
      color: style.color,
      font: "Aptos",
      size: 22,
    });

    if (style.href && /^(https?:|mailto:)/i.test(style.href)) {
      children.push(
        new ExternalHyperlink({
          link: style.href,
          children: [
            new TextRun({
              text,
              bold: style.bold || undefined,
              italics: style.italics || undefined,
              underline: { type: UnderlineType.SINGLE },
              strike: style.strike || undefined,
              color: style.color ?? "0563C1",
              font: "Aptos",
              size: 22,
            }),
          ],
        }),
      );
    } else {
      children.push(run);
    }
  };

  const tokens = html.split(/(<[^>]+>)/g).filter(Boolean);
  for (const token of tokens) {
    if (!token.startsWith("<")) {
      pushText(token);
      continue;
    }

    const normalized = token.trim();
    if (/^<br\s*\/?\s*>$/i.test(normalized)) {
      children.push(new TextRun({ break: 1 }));
      continue;
    }

    const closing = normalized.match(/^<\/\s*([a-z0-9]+)[^>]*>$/i);
    if (closing) {
      const tag = closing[1].toLowerCase();
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].tag !== tag) continue;
        style = cloneStyle(stack[index].style);
        stack.splice(index);
        break;
      }
      continue;
    }

    const opening = normalized.match(/^<\s*([a-z0-9]+)([^>]*)>$/i);
    if (!opening || normalized.endsWith("/>")) continue;
    const tag = opening[1].toLowerCase();
    if (!["b", "strong", "i", "em", "u", "s", "strike", "del", "span", "font", "a"].includes(tag)) {
      continue;
    }

    stack.push({ tag, style: cloneStyle(style) });
    style = cloneStyle(style);
    if (tag === "b" || tag === "strong") style.bold = true;
    if (tag === "i" || tag === "em") style.italics = true;
    if (tag === "u") style.underline = true;
    if (tag === "s" || tag === "strike" || tag === "del") style.strike = true;
    const color = colorFromTag(opening[2]);
    if (color) style.color = color;
    if (tag === "a") {
      const href = opening[2].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
      if (href) style.href = decodeHtml(href);
    }
  }

  return children.length > 0 ? children : [new TextRun("")];
}

function alignment(value?: NativeDocumentAlignment) {
  if (value === "center") return AlignmentType.CENTER;
  if (value === "right") return AlignmentType.RIGHT;
  if (value === "justify") return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function indentFor(level?: number) {
  return level && level > 0 ? { left: level * 540 } : undefined;
}

function paragraphForRichHtml(
  html: string,
  options: {
    align?: NativeDocumentAlignment;
    indent?: number;
    heading?: 1 | 2 | 3;
    quote?: boolean;
    bullet?: boolean;
    ordered?: boolean;
    listInstance?: number;
  } = {},
) {
  const heading =
    options.heading === 1
      ? HeadingLevel.HEADING_1
      : options.heading === 2
        ? HeadingLevel.HEADING_2
        : options.heading === 3
          ? HeadingLevel.HEADING_3
          : undefined;

  return new Paragraph({
    children: inlineChildren(html),
    alignment: alignment(options.align),
    heading,
    indent: options.quote
      ? { left: (options.indent ?? 0) * 540 + 720, right: 360 }
      : indentFor(options.indent),
    spacing: { after: options.heading ? 180 : 120, line: 276 },
    bullet: options.bullet ? { level: Math.min(8, Math.max(0, options.indent ?? 0)) } : undefined,
    numbering: options.ordered
      ? {
          reference: ORDERED_LIST_REFERENCE,
          level: Math.min(8, Math.max(0, options.indent ?? 0)),
          instance: options.listInstance,
        }
      : undefined,
  });
}

function blockChildren(block: NativeDocumentBlock, listInstance: number): Array<Paragraph | Table> {
  if (block.type === "paragraph") {
    return [paragraphForRichHtml(block.html, { align: block.align, indent: block.indent })];
  }

  if (block.type === "heading") {
    return [
      paragraphForRichHtml(block.html, {
        align: block.align,
        indent: block.indent,
        heading: block.level,
      }),
    ];
  }

  if (block.type === "quote") {
    return [
      paragraphForRichHtml(block.html, {
        align: block.align,
        indent: block.indent,
        quote: true,
      }),
    ];
  }

  if (block.type === "bulletList") {
    return block.items.map((item) =>
      paragraphForRichHtml(item, { indent: block.indent, bullet: true }),
    );
  }

  if (block.type === "orderedList") {
    return block.items.map((item) =>
      paragraphForRichHtml(item, {
        indent: block.indent,
        ordered: true,
        listInstance,
      }),
    );
  }

  if (block.type === "table") {
    const columnCount = Math.max(1, ...block.rows.map((row) => row.length));
    return [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: block.rows.map(
          (row) =>
            new TableRow({
              children: Array.from(
                { length: columnCount },
                (_, index) =>
                  new TableCell({
                    width: { size: 100 / columnCount, type: WidthType.PERCENTAGE },
                    margins: { top: 80, right: 100, bottom: 80, left: 100 },
                    children: [
                      new Paragraph({
                        children: inlineChildren(row[index] ?? ""),
                        spacing: { after: 0 },
                      }),
                    ],
                  }),
              ),
            }),
        ),
      }),
    ];
  }

  if (block.type === "rule") {
    return [new Paragraph({ thematicBreak: true, spacing: { before: 120, after: 120 } })];
  }

  return [new Paragraph({ children: [new PageBreak()] })];
}

export async function buildNativeDocumentDocx({
  title,
  content,
}: {
  title: string;
  content: Json | unknown;
}) {
  const native = normalizeNativeDocumentContent(content);
  const portraitSize = native.page.size === "LETTER" ? LETTER : A4;
  const isLandscape = native.page.orientation === "landscape";
  const width = isLandscape ? portraitSize.height : portraitSize.width;
  const height = isLandscape ? portraitSize.width : portraitSize.height;

  let orderedListInstance = 0;
  const children = native.blocks.flatMap((block) => {
    if (block.type === "orderedList") orderedListInstance += 1;
    return blockChildren(block, orderedListInstance);
  });

  const headerText = htmlToPlainText(native.page.header);
  const footerText = htmlToPlainText(native.page.footer);
  const footerChildren: ParagraphChild[] = [];
  if (footerText) footerChildren.push(new TextRun({ text: footerText, font: "Aptos", size: 18 }));
  if (native.page.showPageNumbers) {
    if (footerChildren.length > 0) footerChildren.push(new TextRun("   •   Page "));
    else footerChildren.push(new TextRun("Page "));
    footerChildren.push(PageNumber.CURRENT);
  }

  const document = new Document({
    creator: "OfficeKonnect",
    title,
    description: "Structured Word document exported by OfficeKonnect",
    numbering: {
      config: [
        {
          reference: ORDERED_LIST_REFERENCE,
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 720 + level * 540, hanging: 360 },
              },
            },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width,
              height,
              orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: mmToTwips(native.page.margins.top),
              right: mmToTwips(native.page.margins.right),
              bottom: mmToTwips(native.page.margins.bottom),
              left: mmToTwips(native.page.margins.left),
            },
          },
        },
        headers: headerText
          ? {
              default: new Header({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: headerText, font: "Aptos", size: 18 })],
                    spacing: { after: 0 },
                  }),
                ],
              }),
            }
          : undefined,
        footers:
          footerChildren.length > 0
            ? {
                default: new Footer({
                  children: [
                    new Paragraph({
                      children: footerChildren,
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 0 },
                    }),
                  ],
                }),
              }
            : undefined,
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  return { bytes: new Uint8Array(buffer) };
}
