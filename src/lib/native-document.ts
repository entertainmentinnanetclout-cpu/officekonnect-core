import type { Json } from "@/integrations/supabase/types";

export type NativeDocumentPageSize = "A4" | "LETTER";
export type NativeDocumentOrientation = "portrait" | "landscape";
export type NativeDocumentAlignment = "left" | "center" | "right" | "justify";

export interface NativeDocumentMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface NativeDocumentPageSettings {
  size: NativeDocumentPageSize;
  orientation: NativeDocumentOrientation;
  margins: NativeDocumentMargins;
  header: string;
  footer: string;
  showPageNumbers: boolean;
}

interface IndentableBlock {
  indent?: number;
}

export type NativeDocumentBlock =
  | ({
      id: string;
      type: "paragraph";
      html: string;
      align?: NativeDocumentAlignment;
    } & IndentableBlock)
  | ({
      id: string;
      type: "heading";
      level: 1 | 2 | 3;
      html: string;
      align?: NativeDocumentAlignment;
    } & IndentableBlock)
  | ({
      id: string;
      type: "quote";
      html: string;
      align?: NativeDocumentAlignment;
    } & IndentableBlock)
  | ({
      id: string;
      type: "bulletList" | "orderedList";
      items: string[];
    } & IndentableBlock)
  | {
      id: string;
      type: "table";
      rows: string[][];
    }
  | {
      id: string;
      type: "rule";
    }
  | {
      id: string;
      type: "pageBreak";
    };

export interface NativeDocumentContent {
  schemaVersion: 1;
  page: NativeDocumentPageSettings;
  blocks: NativeDocumentBlock[];
}

export const DEFAULT_NATIVE_DOCUMENT_PAGE: NativeDocumentPageSettings = {
  size: "A4",
  orientation: "portrait",
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  header: "",
  footer: "",
  showPageNumbers: true,
};

function blockId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createEmptyNativeDocument(): NativeDocumentContent {
  return {
    schemaVersion: 1,
    page: {
      ...DEFAULT_NATIVE_DOCUMENT_PAGE,
      margins: { ...DEFAULT_NATIVE_DOCUMENT_PAGE.margins },
    },
    blocks: [{ id: blockId(), type: "paragraph", html: "" }],
  };
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeAlign(value: unknown): NativeDocumentAlignment | undefined {
  return value === "left" || value === "center" || value === "right" || value === "justify"
    ? value
    : undefined;
}

function normalizeIndent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const indent = Math.max(0, Math.min(8, Math.round(value)));
  return indent > 0 ? indent : undefined;
}

function normalizeBlock(raw: unknown): NativeDocumentBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const block = raw as Record<string, unknown>;
  const id = stringOr(block.id) || blockId();
  const type = block.type;
  const indent = normalizeIndent(block.indent);

  if (type === "paragraph") {
    return {
      id,
      type,
      html: stringOr(block.html, stringOr(block.text)),
      align: normalizeAlign(block.align),
      indent,
    };
  }

  if (type === "heading") {
    const level = block.level === 1 || block.level === 2 || block.level === 3 ? block.level : 2;
    return {
      id,
      type,
      level,
      html: stringOr(block.html, stringOr(block.text)),
      align: normalizeAlign(block.align),
      indent,
    };
  }

  if (type === "quote") {
    return {
      id,
      type,
      html: stringOr(block.html, stringOr(block.text)),
      align: normalizeAlign(block.align),
      indent,
    };
  }

  if (type === "bulletList" || type === "orderedList") {
    const items = Array.isArray(block.items)
      ? block.items.map((item) => stringOr(item)).filter((item) => item.length > 0)
      : [];
    return { id, type, items, indent };
  }

  if (type === "table") {
    const rows = Array.isArray(block.rows)
      ? block.rows.map((row) => (Array.isArray(row) ? row.map((cell) => stringOr(cell)) : []))
      : [];
    return { id, type, rows: rows.filter((row) => row.length > 0) };
  }

  if (type === "rule" || type === "pageBreak") {
    return { id, type };
  }

  const legacyText = stringOr(block.html, stringOr(block.text, stringOr(block.content)));
  return legacyText ? { id, type: "paragraph", html: legacyText, indent } : null;
}

export function normalizeNativeDocumentContent(value: Json | unknown): NativeDocumentContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyNativeDocument();
  }

  const raw = value as Record<string, unknown>;
  const rawPage =
    raw.page && typeof raw.page === "object" && !Array.isArray(raw.page)
      ? (raw.page as Record<string, unknown>)
      : {};
  const rawMargins =
    rawPage.margins && typeof rawPage.margins === "object" && !Array.isArray(rawPage.margins)
      ? (rawPage.margins as Record<string, unknown>)
      : {};

  const page: NativeDocumentPageSettings = {
    size: rawPage.size === "LETTER" ? "LETTER" : "A4",
    orientation: rawPage.orientation === "landscape" ? "landscape" : "portrait",
    margins: {
      top: Math.max(
        5,
        Math.min(60, numberOr(rawMargins.top, DEFAULT_NATIVE_DOCUMENT_PAGE.margins.top)),
      ),
      right: Math.max(
        5,
        Math.min(60, numberOr(rawMargins.right, DEFAULT_NATIVE_DOCUMENT_PAGE.margins.right)),
      ),
      bottom: Math.max(
        5,
        Math.min(60, numberOr(rawMargins.bottom, DEFAULT_NATIVE_DOCUMENT_PAGE.margins.bottom)),
      ),
      left: Math.max(
        5,
        Math.min(60, numberOr(rawMargins.left, DEFAULT_NATIVE_DOCUMENT_PAGE.margins.left)),
      ),
    },
    header: stringOr(rawPage.header),
    footer: stringOr(rawPage.footer),
    showPageNumbers: rawPage.showPageNumbers !== false,
  };

  const blocks = Array.isArray(raw.blocks)
    ? raw.blocks.map(normalizeBlock).filter((block): block is NativeDocumentBlock => block !== null)
    : [];

  return {
    schemaVersion: 1,
    page,
    blocks: blocks.length > 0 ? blocks : [{ id: blockId(), type: "paragraph", html: "" }],
  };
}

export function nativeDocumentWordCount(content: NativeDocumentContent) {
  const text = content.blocks
    .flatMap((block) => {
      if (block.type === "bulletList" || block.type === "orderedList") return block.items;
      if (block.type === "table") return block.rows.flat();
      if (block.type === "paragraph" || block.type === "heading" || block.type === "quote") {
        return [htmlToPlainText(block.html)];
      }
      return [];
    })
    .join(" ")
    .trim();

  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

export function htmlToPlainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function nativeDocumentToJson(content: NativeDocumentContent): Json {
  return content as unknown as Json;
}
