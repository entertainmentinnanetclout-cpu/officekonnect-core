import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function isServerFunctionRequest(request: Request) {
  const url = new URL(request.url);
  return (
    url.pathname.includes("/_serverFn/") ||
    url.searchParams.has("_serverFnId") ||
    request.headers.get("x-tsr-redirect") !== null
  );
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message || "Internal server error";
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; error?: unknown };
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
    if (typeof candidate.error === "string" && candidate.error.trim()) return candidate.error;
  }
  return "Internal server error";
}

function jsonServerFunctionError(error: unknown, status = 500) {
  return new Response(JSON.stringify({ error: describeError(error) }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// h3 can swallow an in-handler throw into a normal 500 JSON response such as
// {"unhandled":true,"message":"HTTPError"}. Browser document requests still
// receive the branded HTML failure page; server functions must stay JSON so the
// client can display the original Supabase/RLS/validation failure.
async function normalizeCatastrophicSsrResponse(
  request: Request,
  response: Response,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const capturedError =
    consumeLastCapturedError() ?? new Error(`h3 swallowed server error: ${body}`);
  console.error(capturedError);

  if (isServerFunctionRequest(request)) {
    return jsonServerFunctionError(capturedError, response.status);
  }

  return new Response(renderErrorPage(), {
    status: response.status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(request, response);
    } catch (error) {
      console.error(error);

      if (isServerFunctionRequest(request)) {
        return jsonServerFunctionError(error);
      }

      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
