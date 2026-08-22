import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./docx-workspace.css";

interface DocxWorkspaceProps {
  url: string;
  title: string;
}

export function DocxWorkspace({ url, title }: DocxWorkspaceProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [renderKey, setRenderKey] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function renderWordDocument() {
      const body = bodyRef.current;
      const styles = styleRef.current;
      if (!body || !styles) return;

      setState("loading");
      setErrorMessage("");
      body.replaceChildren();
      styles.replaceChildren();

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Could not load the Word file (${response.status})`);
        }

        const blob = await response.blob();
        if (cancelled) return;

        const { renderAsync } = await import("docx-preview");
        if (cancelled) return;

        await renderAsync(blob, body, styles, {
          className: "officekonnect-docx",
          inWrapper: true,
          hideWrapperOnPrint: false,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          experimental: true,
          trimXmlDeclaration: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderComments: false,
          debug: false,
        });

        if (!cancelled) setState("ready");
      } catch (error) {
        if (cancelled) return;
        setState("error");
        setErrorMessage(
          error instanceof Error ? error.message : "The Word file could not be rendered",
        );
      }
    }

    void renderWordDocument();

    return () => {
      cancelled = true;
    };
  }, [url, renderKey]);

  return (
    <div className="relative h-full min-h-0 overflow-auto bg-slate-200/70 dark:bg-slate-950">
      <div ref={styleRef} />

      {state === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3 text-sm shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Rendering {title}…
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="max-w-lg rounded-xl border bg-background p-6 text-center shadow-sm">
            <AlertCircle className="mx-auto h-8 w-8 text-amber-600" />
            <h2 className="mt-3 font-semibold">Word preview unavailable</h2>
            <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => setRenderKey((key) => key + 1)}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Retry preview
            </Button>
          </div>
        </div>
      )}

      <div
        ref={bodyRef}
        className="officekonnect-docx-host min-h-full py-6 sm:py-8"
        aria-label={`Word document preview for ${title}`}
      />
    </div>
  );
}
