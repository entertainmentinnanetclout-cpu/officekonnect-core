export interface SpreadsheetPdfOptions {
  title: string;
  content: unknown;
  sheetIds?: string[];
  renderedAt?: Date | string | null;
}

export interface SpreadsheetPdfResult {
  bytes: Uint8Array;
  pageCount: number;
}

/**
 * Keep the heavy pdf-lib renderer out of the TanStack Start module graph used by
 * basic spreadsheet operations. The renderer is loaded only when PDF output is
 * actually requested.
 */
export async function buildSpreadsheetPdf(
  options: SpreadsheetPdfOptions,
): Promise<SpreadsheetPdfResult> {
  const renderer = await import("@/lib/spreadsheet-pdf-renderer.server");
  return renderer.buildSpreadsheetPdf(options);
}
