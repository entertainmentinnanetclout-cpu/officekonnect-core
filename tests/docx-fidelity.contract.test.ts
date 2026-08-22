import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("DOCX fidelity contract", () => {
  test("uploaded DOCX files render from the preserved binary", () => {
    const workspace = read("src/components/document/uploaded-document-workspace.tsx");
    const preview = read("src/components/document/docx-workspace.tsx");
    const uploader = read("src/lib/document-client.ts");

    expect(workspace).toContain("<DocxWorkspace");
    expect(workspace).toContain("Original Word layout");
    expect(workspace).toContain("Download original");
    expect(preview).toContain('import("docx-preview")');
    expect(preview).toContain("ignoreWidth: false");
    expect(preview).toContain("ignoreHeight: false");
    expect(preview).toContain("ignoreFonts: false");
    expect(preview).toContain("renderHeaders: true");
    expect(preview).toContain("renderFooters: true");
    expect(preview).toContain("breakPages: true");
    expect(uploader).toContain('.from("documents")');
    expect(uploader).toContain("storage_path: storagePath");
    expect(uploader).toContain('document_kind: "file"');
  });

  test("native documents export to a structured WordprocessingML document", () => {
    const exporter = read("src/lib/native-document-docx.server.ts");
    const saveAs = read("src/lib/document-save-as.functions.ts");
    const route = read("src/routes/dashboard/documents/$documentId.tsx");

    for (const marker of [
      "new Document({",
      "new Header({",
      "new Footer({",
      "new Table({",
      "new PageBreak()",
      "PageNumber.CURRENT",
      "LevelFormat.DECIMAL",
    ]) {
      expect(exporter).toContain(marker);
    }

    expect(saveAs).toContain("saveNativeDocumentAsDocx");
    expect(saveAs).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(route).toContain("Word document (.docx)");
    expect(route).toContain("Structured editable Office Open XML document");
  });

  test("does not advertise the old lossy Word-normalization contract", () => {
    const files = [
      "src/components/document/uploaded-document-workspace.tsx",
      "src/routes/dashboard/documents/$documentId.tsx",
      "src/routes/dashboard/documents/index.tsx",
    ].map(read);
    const source = files.join("\n");

    expect(source).not.toContain("Word and text files are normalized into a browser-editable page");
    expect(source).not.toContain("DOCX export is a visual snapshot of the completed page");
  });
});
