import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  countUnreadWorkspaceNotifications,
  getNotificationRoute,
  listWorkspaceNotifications,
  markAllWorkspaceNotificationsRead,
  markWorkspaceNotificationRead,
} from "@/lib/phase8.functions";
import { toastError } from "@/lib/errors";

export function NotificationBell({ workspaceId }: { workspaceId: string | null }) {
  const queryClient = useQueryClient();
  const queryKey = ["phase8-notifications", workspaceId] as const;
  const countKey = ["phase8-notification-count", workspaceId] as const;

  const { data: unread = 0 } = useQuery({
    queryKey: countKey,
    enabled: Boolean(workspaceId),
    queryFn: () => countUnreadWorkspaceNotifications(workspaceId!),
    refetchInterval: 60_000,
  });

  const { data: notifications = [], isLoading } = useQuery({
    queryKey,
    enabled: Boolean(workspaceId),
    queryFn: () => listWorkspaceNotifications(workspaceId!, false, 6),
    refetchInterval: 60_000,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: countKey }),
    ]);
  };

  const markRead = useMutation({
    mutationFn: markWorkspaceNotificationRead,
    onSuccess: refresh,
    onError: (error) => toastError(error, "Could not update notification"),
  });

  const markAll = useMutation({
    mutationFn: () => markAllWorkspaceNotificationsRead(workspaceId!),
    onSuccess: refresh,
    onError: (error) => toastError(error, "Could not mark notifications as read"),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" disabled={!workspaceId}>
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-none text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={(event) => {
                event.preventDefault();
                markAll.mutate();
              }}
              disabled={markAll.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-[360px] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No notifications yet.
            </p>
          ) : (
            notifications.map((notification) => {
              const route = getNotificationRoute(notification);
              const unreadItem = !notification.effective_read_at;
              return (
                <a
                  key={notification.id}
                  href={route ?? "/dashboard/notifications"}
                  className="block border-b px-4 py-3 transition hover:bg-muted/60 last:border-b-0"
                  onClick={() => {
                    if (unreadItem) markRead.mutate(notification.id);
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unreadItem ? "bg-blue-600" : "bg-transparent"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{notification.title}</p>
                      {notification.body ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {notification.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {new Date(notification.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </a>
              );
            })
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <a
          href="/dashboard/notifications"
          className="block px-4 py-3 text-center text-xs font-semibold hover:bg-muted/60"
        >
          View notification center
        </a>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
