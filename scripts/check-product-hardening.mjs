import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src");
const extensions = new Set([".ts", ".tsx"]);
const ignored = new Set(["src/routeTree.gen.ts"]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const stat = statSync(path);
    return stat.isDirectory() ? walk(path) : [path];
  });
}

const checks = [
  {
    name: "internal upgrade programme text",
    pattern: /Upgrade programme|PR #\d+ carries|Phases? 0[–-]11/i,
  },
  { name: "fake/dead implementation wording", pattern: /\bfake\b|\bdead control\b/i },
  { name: "legacy V1 residue", pattern: /\bV1\b/ },
  { name: "raw console logging", pattern: /console\.(?:log|debug)\s*\(/ },
  { name: "native browser alert", pattern: /(?:window\.)?alert\s*\(/ },
  { name: "dead href/to target", pattern: /(?:href|to)\s*=\s*["'](?:#["']|javascript:)/i },
  { name: "internal dashboard hard reload", pattern: /<a\s+[^>]*href=["']\/dashboard(?:\/|["'])/i },
  {
    name: "browser service-role exposure",
    pattern: /(?:VITE_|PUBLIC_).*SERVICE_ROLE|SERVICE_ROLE.*(?:VITE_|PUBLIC_)/i,
  },
  {
    name: "persistent token storage",
    pattern: /localStorage[^\n]*(?:token|secret)|(?:token|secret)[^\n]*localStorage/i,
  },
];

const findings = [];
for (const absolute of walk(sourceRoot)) {
  const ext = absolute.slice(absolute.lastIndexOf("."));
  if (!extensions.has(ext)) continue;
  const file = relative(root, absolute).replaceAll("\\", "/");
  if (ignored.has(file)) continue;
  const text = readFileSync(absolute, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const check of checks) {
      if (check.pattern.test(line))
        findings.push(`${file}:${index + 1} ${check.name}: ${line.trim()}`);
      check.pattern.lastIndex = 0;
    }
  });
}

if (findings.length) {
  console.error(
    "Phase 9 product hardening audit failed:\n" + findings.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log("Phase 9 product hardening audit passed.");
