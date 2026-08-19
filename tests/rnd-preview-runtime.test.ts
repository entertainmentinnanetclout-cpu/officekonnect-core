import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("document and signing surfaces never import the legacy react-rnd runtime", () => {
  const uploadedWorkspace = source("src/components/document/uploaded-document-workspace.tsx");
  const signingFields = source("src/components/signing/signing-pdf-fields.tsx");

  for (const file of [uploadedWorkspace, signingFields]) {
    expect(file).toContain('from "@/components/resizable-draggable"');
    expect(file).not.toContain('from "react-rnd"');
  }

  expect(existsSync("src/components/rnd.tsx")).toBe(false);
});

test("Vite never pre-bundles the tslib-broken drag resize dependency chain", () => {
  const viteConfig = source("vite.config.ts");
  expect(viteConfig).toContain('exclude: ["react-rnd", "re-resizable"]');
});

test("uploaded document previews resolve private storage before rendering", () => {
  const uploadedWorkspace = source("src/components/document/uploaded-document-workspace.tsx");

  expect(uploadedWorkspace).toContain("getDocumentSignedUrl(document.storage_path");
  expect(uploadedWorkspace).toContain("await fetch(signedFile.url)");
  expect(uploadedWorkspace).toContain("URL.createObjectURL(resolvedFile.blob)");
  expect(uploadedWorkspace).toContain("previewUrl && isImage");
  expect(uploadedWorkspace).toContain("download={document.title}");
});
