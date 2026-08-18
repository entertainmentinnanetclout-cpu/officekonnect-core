import { useQuery } from "@tanstack/react-query";
import { Download, FileText, LockKeyhole, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { htmlToPlainText, normalizeNativeDocumentContent } from "@/lib/native-document";
import { cellAddress, normalizeWorkbookContent } from "@/lib/spreadsheet";

interface WorkflowSnapshotProps {
  documentKind: string;
  fileType: string | null;
  content: Json | null;
  storagePath: string | null;
  versionNumber: number;
  title: string;
}

function NativeSnapshot({ content }: { content: Json | null }) {
  const document = normalizeNativeDocumentContent(content);
  return (
    <div className="mx-auto max-w-4xl rounded-xl border bg-white px-8 py-10 shadow-sm dark:bg-slate-950">
      {document.page.header && (
        <div className="mb-8 border-b pb-3 text-xs text-muted-foreground">
          {document.page.header}
        </div>
      )}
      <div className="space-y-4">
        {document.blocks.map((block) => {
          const indent = "indent" in block && block.indent ? block.indent * 24 : 0;
          if (block.type === "heading") {
            const Tag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
            return (
              <Tag
                key={block.id}
                className={
                  block.level === 1
                    ? "text-2xl font-bold"
                    : block.level === 2
                      ? "text-xl font-semibold"
                      : "text-lg font-semibold"
                }
                style={{ marginLeft: indent, textAlign: block.align ?? "left" }}
              >
                {htmlToPlainText(block.html)}
              </Tag>
            );
          }
          if (block.type === "paragraph" || block.type === "quote") {
            return (
              <p
                key={block.id}
                className={
                  block.type === "quote"
                    ? "border-l-4 pl-4 italic text-muted-foreground"
                    : "whitespace-pre-wrap text-sm leading-7"
                }
                style={{ marginLeft: indent, textAlign: block.align ?? "left" }}
              >
                {htmlToPlainText(block.html)}
              </p>
            );
          }
          if (block.type === "bulletList" || block.type === "orderedList") {
            const List = block.type === "bulletList" ? "ul" : "ol";
            return (
              <List
                key={block.id}
                className={
                  block.type === "bulletList"
                    ? "list-disc space-y-1 pl-6"
                    : "list-decimal space-y-1 pl-6"
                }
                style={{ marginLeft: indent }}
              >
                {block.items.map((item, index) => (
                  <li key={`${block.id}-${index}`} className="text-sm leading-6">
                    {htmlToPlainText(item)}
                  </li>
                ))}
              </List>
            );
          }
          if (block.type === "table") {
            return (
              <div key={block.id} className="overflow-x-auto rounded-lg border">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={`${block.id}-${rowIndex}`}>
                        {row.map((cell, cellIndex) => (
                          <td
                            key={`${block.id}-${rowIndex}-${cellIndex}`}
                            className="border p-2 align-top"
                          >
                            {htmlToPlainText(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          if (block.type === "rule") return <hr key={block.id} />;
          return (
            <div
              key={block.id}
              className="my-8 border-t border-dashed pt-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground"
            >
              Page break
            </div>
          );
        })}
      </div>
      {document.page.footer && (
        <div className="mt-8 border-t pt-3 text-xs text-muted-foreground">
          {document.page.footer}
        </div>
      )}
    </div>
  );
}

function SpreadsheetSnapshot({ content }: { content: Json | null }) {
  const workbook = normalizeWorkbookContent(content);
  const sheet =
    workbook.sheets.find((item) => item.id === workbook.activeSheetId) ?? workbook.sheets[0]!;
  const populated = Object.keys(sheet.cells)
    .map((address) => /([A-Z]+)(\d+)/.exec(address))
    .filter(Boolean)
    .map((match) => ({ column: match![1]!, row: Number(match![2]) }));
  const lastRow = Math.min(50, Math.max(12, ...populated.map((cell) => cell.row)));
  const columnLabels = Array.from({ length: 12 }, (_, index) => String.fromCharCode(65 + index));

  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3 text-sm font-medium">
        <Table2 className="h-4 w-4" />
        {sheet.name}
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          Read-only submission snapshot
        </span>
      </div>
      <div className="max-h-[680px] overflow-auto">
        <table className="min-w-[900px] border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="w-12 border p-2 text-muted-foreground">#</th>
              {columnLabels.map((label) => (
                <th key={label} className="min-w-28 border p-2 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: lastRow }, (_, rowIndex) => rowIndex + 1).map((row) => (
              <tr key={row}>
                <th className="sticky left-0 border bg-muted/70 p-2 font-normal text-muted-foreground">
                  {row}
                </th>
                {columnLabels.map((_, columnIndex) => {
                  const address = cellAddress(row, columnIndex + 1);
                  const cell = sheet.cells[address];
                  return (
                    <td key={address} className="h-9 border px-2 align-middle">
                      {cell?.formula ||
                        (cell?.value === null || cell?.value === undefined
                          ? ""
                          : String(cell.value))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FileSnapshot({
  storagePath,
  fileType,
  title,
}: Pick<WorkflowSnapshotProps, "storagePath" | "fileType" | "title">) {
  const { data: signedUrl, isLoading } = useQuery({
    queryKey: ["workflow-immutable-file", storagePath],
    enabled: Boolean(storagePath),
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(storagePath!, 60 * 15);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (!storagePath) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        The submitted version has no stored binary.
      </div>
    );
  }
  if (isLoading) return <div className="h-80 animate-pulse rounded-xl bg-muted" />;
  if (fileType === "application/pdf" && signedUrl) {
    return (
      <iframe
        title={`Immutable snapshot of ${title}`}
        src={signedUrl}
        className="h-[720px] w-full rounded-xl border bg-white"
      />
    );
  }
  return (
    <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border bg-background p-8 text-center">
      <FileText className="h-10 w-10 text-muted-foreground" />
      <p className="mt-4 font-medium">Immutable uploaded file</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        This file type is reviewed from the exact submitted binary. Downloading does not open or
        modify the working document.
      </p>
      {signedUrl && (
        <Button asChild className="mt-5">
          <a href={signedUrl} download>
            <Download className="mr-2 h-4 w-4" />
            Download submitted version
          </a>
        </Button>
      )}
    </div>
  );
}

export function WorkflowSnapshot(props: WorkflowSnapshotProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <LockKeyhole className="h-4 w-4" />
        <span className="font-medium text-foreground">
          Immutable submitted version {props.versionNumber}
        </span>
        <span>
          Review decisions always reference this snapshot until an authorised resubmission creates
          the next revision.
        </span>
      </div>
      {props.documentKind === "native" ? (
        <NativeSnapshot content={props.content} />
      ) : props.documentKind === "spreadsheet" ? (
        <SpreadsheetSnapshot content={props.content} />
      ) : (
        <FileSnapshot
          storagePath={props.storagePath}
          fileType={props.fileType}
          title={props.title}
        />
      )}
    </div>
  );
}
