import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
// Support the client output layouts used by local/Nitro and canonical Vercel builds.
const candidates = [
  join(root, ".vercel/output/static/assets"),
  join(root, "dist/client/assets"),
  join(root, ".output/public/assets"),
];
const assets = candidates.find((candidate) => existsSync(candidate));

if (!assets) {
  console.error(
    "Phase 10 production asset budget failed: no client asset directory found. Run `bun run build` first.\nLooked in:\n" +
      candidates.map((candidate) => `- ${relative(root, candidate)}`).join("\n"),
  );
  process.exit(1);
}

if (process.env.VERCEL && !existsSync(join(root, ".vercel/output/config.json"))) {
  console.error(
    "Phase 10 production asset budget failed: Vercel build did not emit .vercel/output/config.json.",
  );
  process.exit(1);
}

for (const cloudflareWorker of [
  join(root, ".output/server/_worker.js"),
  join(root, "dist/server/_worker.js"),
]) {
  if (existsSync(cloudflareWorker)) {
    console.error(
      `Phase 10 production asset budget failed: unexpected Cloudflare worker artifact ${relative(root, cloudflareWorker)} in the canonical Vercel build.`,
    );
    process.exit(1);
  }
}

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
    "Phase 10 production asset budget failed:\n" + findings.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log("Phase 10 production asset budget passed (JS <= 640 KiB, CSS <= 150 KiB per asset).");
