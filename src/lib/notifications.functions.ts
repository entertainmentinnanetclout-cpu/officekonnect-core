import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface RpcErrorShape {
  message: string;
}
interface RpcResponse<T> {
  data: T | null;
  error: RpcErrorShape | null;
}
type RpcInvoker = (
  name: string,
  args?: Record<string, unknown>,
) => PromiseLike<RpcResponse<unknown>>;

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const rpc = context.supabase.rpc as unknown as RpcInvoker;
    const { error } = await rpc("mark_notification_read", { p_notification_id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    const rpc = context.supabase.rpc as unknown as RpcInvoker;
    const { data: count, error } = (await rpc("mark_all_workspace_notifications_read", {
      p_workspace_id: data.workspaceId,
    })) as RpcResponse<number>;
    if (error) throw new Error(error.message);
    return { ok: true, count: count ?? 0 };
  });
