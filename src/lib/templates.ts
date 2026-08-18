import type { Json } from "@/integrations/supabase/types";
import { htmlToPlainText, normalizeNativeDocumentContent } from "@/lib/native-document";
import { normalizeWorkbookContent, workbookMetrics } from "@/lib/spreadsheet";

export const TEMPLATE_CATEGORIES = [
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
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export function normalizeTemplateCategory(value: string | null | undefined): TemplateCategory {
  const normalized = value?.trim().toLowerCase();
  return TEMPLATE_CATEGORIES.find((category) => category.toLowerCase() === normalized) ?? "General";
}

export function normalizeTemplateKind(value: string | null | undefined) {
  return value === "spreadsheet" ? "spreadsheet" : "document";
}

export function templateSummary(kind: string, content: Json | unknown) {
  if (normalizeTemplateKind(kind) === "spreadsheet") {
    const workbook = normalizeWorkbookContent(content);
    const metrics = workbookMetrics(workbook);
    return {
      label: `${metrics.sheetCount} sheet${metrics.sheetCount === 1 ? "" : "s"} · ${metrics.cellCount.toLocaleString()} populated cell${metrics.cellCount === 1 ? "" : "s"}`,
      detail:
        workbook.sheets
          .map((sheet) => sheet.name)
          .slice(0, 5)
          .join(", ") || "Blank workbook",
    };
  }

  const document = normalizeNativeDocumentContent(content);
  const plain = document.blocks
    .flatMap((block) => {
      if (block.type === "paragraph" || block.type === "heading" || block.type === "quote") {
        return [htmlToPlainText(block.html)];
      }
      if (block.type === "bulletList" || block.type === "orderedList") return block.items;
      if (block.type === "table") return block.rows.flat();
      return [];
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    label: `${document.blocks.length} block${document.blocks.length === 1 ? "" : "s"}`,
    detail: plain ? `${plain.slice(0, 180)}${plain.length > 180 ? "…" : ""}` : "Blank document",
  };
}
