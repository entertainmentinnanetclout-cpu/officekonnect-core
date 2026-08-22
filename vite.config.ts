// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },
  // OfficeKonnect's canonical production target is Vercel. Keeping this explicit prevents
  // a fresh clone from silently emitting the wrapper's Cloudflare-oriented default output.
  // Alternate hosts may override the deployment configuration in their own downstream clone.
  nitro: {
    preset: "vercel",
  },
  vite: {
    resolve: {
      alias: {
        // Keep legacy browser-only interaction packages out of the TanStack Start SSR graph.
        // OfficeKonnect supplies the small runtime API surface it actually uses.
        "react-signature-canvas": fileURLToPath(
          new URL("./src/components/signature-canvas.tsx", import.meta.url),
        ),
        "react-rnd": fileURLToPath(
          new URL("./src/components/resizable-draggable.tsx", import.meta.url),
        ),
      },
    },
  },
});
