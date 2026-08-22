// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro,
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
//
// IMPORTANT: the wrapper defaults Nitro to a Cloudflare-oriented target. A Vercel
// deployment must explicitly select the Vercel preset or the build can succeed while
// the deployed SSR runtime fails at request time.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isVercelBuild =
  Boolean(process.env.VERCEL && process.env.VERCEL !== "0") ||
  Boolean(process.env.VERCEL_URL) ||
  process.env.npm_lifecycle_event === "build:vercel";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },
  // Fresh clones deployed by Vercel must emit Vercel Build Output API artifacts.
  // Outside Vercel we keep the existing wrapper behavior for local/Lovable development.
  nitro: isVercelBuild ? { preset: "vercel" } : true,
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
