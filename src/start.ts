import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

function isServerFunctionRequest(): boolean {
  try {
    const request = getRequest();
    if (!request) return false;
    const url = new URL(request.url);
    if (url.pathname.includes("/_serverFn/")) return true;
    if (url.searchParams.has("_serverFnId")) return true;
    return request.headers.get("x-tsr-redirect") !== null;
  } catch {
    return false;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error != null && typeof error === "object") {
    const candidate = error as { message?: unknown; error_description?: unknown };
    if (typeof candidate.message === "string") return candidate.message;
    if (typeof candidate.error_description === "string") return candidate.error_description;
    try {
      return JSON.stringify(error);
    } catch {
      return "Unexpected server error";
    }
  }
  return "Unexpected server error";
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);

    // Server-function (RPC) callers must receive the real message, not an HTML page.
    if (isServerFunctionRequest()) {
      return new Response(JSON.stringify({ error: describeError(error) }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});


export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
