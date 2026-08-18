import { toast } from "sonner";

function sanitize(message: string, fallback: string): string {
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  // Never surface a raw HTML error page as a toast body.
  if (/^<!doctype html|^<html/i.test(trimmed)) {
    return "The server hit an unexpected error. Please try again.";
  }
  if (trimmed.length > 400) return `${trimmed.slice(0, 400)}…`;
  return trimmed;
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (!err) return fallback;
  if (err instanceof Error) return sanitize(err.message || fallback, fallback);
  if (typeof err === "string") return sanitize(err, fallback);
  if (typeof err === "object") {
    const source = err as { message?: unknown; error?: unknown };
    const m = typeof source.message === "string" ? source.message : undefined;
    if (m) return sanitize(m, fallback);
    if (typeof source.error === "string") return sanitize(source.error, fallback);
  }
  return fallback;
}


export function toastError(err: unknown, fallback = "Something went wrong"): string {
  const msg = errorMessage(err, fallback);

  console.error("[error]", err);
  toast.error(msg);
  return msg;
}
