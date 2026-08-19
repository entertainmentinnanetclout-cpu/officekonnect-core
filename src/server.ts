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
  const pathname = url.pathname.replace(/\/+$/, "");
  return (
    pathname === "/_serverFn" ||
    pathname.startsWith("/_serverFn/") ||
    url.searchParams.has("_serverFnId") ||
    request.headers.get("x-tsr-redirect") !== null ||
    request.headers.get("x-tsr-server-fn") !== null ||
    request.headers.get("x-tanstack-server-fn") !== null
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
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function responseError(response: Response) {
  const captured = consumeLastCapturedError();
  if (captured) return captured;

  const body = await response.clone().text();
  if (body) {
    try {
      const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
      if (typeof parsed.error === "string" && parsed.error.trim()) return new Error(parsed.error);
      if (typeof parsed.message === "string" && parsed.message.trim())
        return new Error(parsed.message);
    } catch {
      const title = body.match(/<title>(.*?)<\/title>/is)?.[1]?.trim();
      if (title) return new Error(title);
      const heading = body
        .match(/<h1[^>]*>(.*?)<\/h1>/is)?.[1]
        ?.replace(/<[^>]+>/g, "")
        .trim();
      if (heading) return new Error(heading);
    }
  }

  return new Error(`Server request failed with HTTP ${response.status}`);
}

// Never allow TanStack/Nitro/Lovable's branded HTML SSR fallback to cross the
// server-function RPC boundary. The browser expects a serialized data/error
// response; receiving HTML is what caused OfficeKonnect to render the full
// "This page didn't load" document inside upload/create/signature errors.
async function normalizeCatastrophicSsrResponse(
  request: Request,
  response: Response,
): Promise<Response> {
  if (response.status < 500) return response;

  if (isServerFunctionRequest(request)) {
    const error = await responseError(response);
    console.error(error);
    return jsonServerFunctionError(error, response.status);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const capturedError =
    consumeLastCapturedError() ?? new Error(`h3 swallowed server error: ${body}`);
  console.error(capturedError);

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
