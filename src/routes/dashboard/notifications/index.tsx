import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Inbox, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceShell } from "@/hooks/use-workspace-shell";
import { toastError } from "@/lib/errors";
import {
  getNotificationRoute,
  listWorkspaceNotifications,
  markAllWorkspaceNotificationsRead,
  markWorkspaceNotificationRead,
} from "@/lib/phase8.functions";

export const Route = createFileRoute("/dashboard/notifications/")({ component: NotificationsPage });

function NotificationsPage() {
  const { user } = useAuth();
  const workspace = useWorkspaceShell(user);
  const workspaceId = workspace.activeWorkspaceId;
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const queryKey = ["phase8-notification-center", workspaceId, unreadOnly] as const;

  const { data: notifications = [], isLoading } = useQuery({
    queryKey,
    enabled: Boolean(workspaceId),
    queryFn: () => listWorkspaceNotifications(workspaceId!, unreadOnly, 150),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["phase8-notification-center"] }),
      queryClient.invalidateQueries({ queryKey: ["phase8-notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["phase8-notification-count"] }),
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

  const unreadCount = notifications.filter(
    (notification) => !notification.effective_read_at,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Workflow, signing, task and workspace updates for the active workspace.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={unreadOnly ? "default" : "outline"}
            onClick={() => setUnreadOnly((value) => !value)}
          >
            {unreadOnly ? "Showing unread" : "Unread only"}
          </Button>
          <Button
            variant="outline"
            disabled={!workspaceId || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark all read
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Visible" value={notifications.length} icon={Bell} />
        <Metric label="Unread" value={unreadCount} icon={Inbox} />
        <Metric label="Workspace" value={workspace.activeWorkspace?.name ?? "—"} icon={Bell} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading || workspace.isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !workspaceId ? (
            <Empty text="Select or create a workspace to use notifications." />
          ) : notifications.length === 0 ? (
            <Empty text={unreadOnly ? "No unread notifications." : "No notifications yet."} />
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const route = getNotificationRoute(notification);
                const unread = !notification.effective_read_at;
                return (
                  <div key={notification.id} className="flex gap-4 px-5 py-4 hover:bg-muted/30">
                    <span
                      className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${unread ? "bg-blue-600" : "bg-muted"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{notification.title}</p>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {notification.kind.replaceAll("_", " ")}
                        </span>
                        {notification.is_broadcast ? (
                          <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                            Workspace
                          </span>
                        ) : null}
                      </div>
                      {notification.body ? (
                        <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                      ) : null}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {new Date(notification.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {unread ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markRead.mutate(notification.id)}
                        >
                          Mark read
                        </Button>
                      ) : null}
                      {route ? (
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={route}
                            onClick={() => {
                              if (unread) markRead.mutate(notification.id);
                            }}
                          >
                            Open
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Bell;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="py-20 text-center">
      <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
