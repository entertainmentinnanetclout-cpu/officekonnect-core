import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const assets = join(root, ".output/public/assets");
const limits = {
  ".js": 640 * 1024,
  ".css": 150 * 1024,
};

const findings = [];
for (const name of readdirSync(assets)) {
  const path = join(assets, name);
  if (!statSync(path).isFile()) continue;
  const ext = name.endsWith(".js") ? ".js" : name.endsWith(".css") ? ".css" : null;
  if (!ext) continue;
  const bytes = statSync(path).size;
  const limit = limits[ext];
  if (bytes > limit) {
    findings.push(
      `${relative(root, path)} is ${(bytes / 1024).toFixed(1)} KiB; budget is ${(limit / 1024).toFixed(0)} KiB`,
    );
  }
}

if (findings.length) {
  console.error(
    "Phase 10 production asset budget failed:\n" +
      findings.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log("Phase 10 production asset budget passed (JS <= 640 KiB, CSS <= 150 KiB per asset).");
