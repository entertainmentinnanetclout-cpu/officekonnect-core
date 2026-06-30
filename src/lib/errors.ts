import { toast } from "sonner";

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (!err) return fallback;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

export function toastError(err: unknown, fallback = "Something went wrong"): string {
  const msg = errorMessage(err, fallback);
  // eslint-disable-next-line no-console
  console.error("[error]", err);
  toast.error(msg);
  return msg;
}
