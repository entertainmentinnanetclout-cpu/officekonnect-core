import { supabase } from "@/integrations/supabase/client";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

interface RpcErrorShape {
  message: string;
}

interface RpcResponse<T> {
  data: T | null;
  error: RpcErrorShape | null;
}

type RpcInvoker = (
  functionName: string,
  args?: Record<string, unknown>,
) => PromiseLike<RpcResponse<unknown>>;

const invokeRpc = supabase.rpc as unknown as RpcInvoker;

export async function phase8Rpc<T>(
  functionName: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await invokeRpc(functionName, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface WorkspaceNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  data: unknown;
  delivered_channels: unknown;
  effective_read_at: string | null;
  created_at: string;
  is_broadcast: boolean;
}

export interface WorkspaceActivityItem {
  source: string;
  event_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_id: string | null;
  actor_name: string;
  occurred_at: string;
  metadata: unknown;
  route: string;
}

export interface WorkspaceMemberDirectoryItem {
  user_id: string;
  full_name: string | null;
  email: string;
  role: WorkspaceRole;
}

export interface WorkspaceInvitationItem {
  invitation_id: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  invited_by: string;
  inviter_name: string;
  expires_at: string;
  created_at: string;
}

export interface MyWorkspaceInvitationItem extends WorkspaceInvitationItem {
  workspace_id: string;
  workspace_name: string;
}

export interface CreatedInvitation {
  invitation_id: string;
  raw_token: string;
  expires_at: string;
}

export interface AcceptedInvitation {
  workspace_id: string;
  workspace_name: string;
  role: WorkspaceRole;
}

export interface CreatedWorkspace {
  workspace_id: string;
  name: string;
  slug: string;
}

export function listWorkspaceNotifications(
  workspaceId: string,
  unreadOnly = false,
  limit = 100,
  offset = 0,
) {
  return phase8Rpc<WorkspaceNotification[]>("list_workspace_notifications", {
    p_workspace_id: workspaceId,
    p_unread_only: unreadOnly,
    p_limit: limit,
    p_offset: offset,
  });
}

export function countUnreadWorkspaceNotifications(workspaceId: string) {
  return phase8Rpc<number>("count_unread_workspace_notifications", {
    p_workspace_id: workspaceId,
  });
}

export function markWorkspaceNotificationRead(notificationId: string) {
  return phase8Rpc<undefined>("mark_notification_read", { p_notification_id: notificationId });
}

export function markAllWorkspaceNotificationsRead(workspaceId: string) {
  return phase8Rpc<number>("mark_all_workspace_notifications_read", {
    p_workspace_id: workspaceId,
  });
}

export function listWorkspaceActivity(workspaceId: string, limit = 150, offset = 0) {
  return phase8Rpc<WorkspaceActivityItem[]>("list_workspace_activity", {
    p_workspace_id: workspaceId,
    p_limit: limit,
    p_offset: offset,
  });
}

export function listWorkspaceMemberDirectory(workspaceId: string) {
  return phase8Rpc<WorkspaceMemberDirectoryItem[]>("list_workspace_member_directory", {
    p_workspace_id: workspaceId,
  });
}

export function listWorkspaceInvitations(workspaceId: string) {
  return phase8Rpc<WorkspaceInvitationItem[]>("list_workspace_invitations", {
    p_workspace_id: workspaceId,
  });
}

export function listMyWorkspaceInvitations() {
  return phase8Rpc<MyWorkspaceInvitationItem[]>("list_my_workspace_invitations");
}

export async function createWorkspaceInvitation(input: {
  workspaceId: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  expiresInDays: number;
}) {
  const rows = await phase8Rpc<CreatedInvitation[]>("create_workspace_invitation", {
    p_workspace_id: input.workspaceId,
    p_email: input.email,
    p_role: input.role,
    p_expires_in_days: input.expiresInDays,
  });
  const invitation = rows[0];
  if (!invitation) throw new Error("Invitation could not be created");
  return invitation;
}

export function revokeWorkspaceInvitation(invitationId: string) {
  return phase8Rpc<undefined>("revoke_workspace_invitation", {
    p_invitation_id: invitationId,
  });
}

export async function acceptWorkspaceInvitationById(invitationId: string) {
  const rows = await phase8Rpc<AcceptedInvitation[]>("accept_workspace_invitation_by_id", {
    p_invitation_id: invitationId,
  });
  const accepted = rows[0];
  if (!accepted) throw new Error("Invitation could not be accepted");
  return accepted;
}

export async function acceptWorkspaceInvitationToken(token: string) {
  const rows = await phase8Rpc<AcceptedInvitation[]>("accept_workspace_invitation", {
    p_token: token,
  });
  const accepted = rows[0];
  if (!accepted) throw new Error("Invitation could not be accepted");
  return accepted;
}

export function updateWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
  role: Exclude<WorkspaceRole, "owner">,
) {
  return phase8Rpc<undefined>("update_workspace_member_role", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_role: role,
  });
}

export function removeWorkspaceMember(workspaceId: string, userId: string) {
  return phase8Rpc<undefined>("remove_workspace_member", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  });
}

export async function createOfficeWorkspace(name: string) {
  const rows = await phase8Rpc<CreatedWorkspace[]>("create_workspace", { p_name: name });
  const workspace = rows[0];
  if (!workspace) throw new Error("Workspace could not be created");
  return workspace;
}

export function getNotificationRoute(notification: WorkspaceNotification): string | null {
  if (
    notification.data &&
    typeof notification.data === "object" &&
    !Array.isArray(notification.data)
  ) {
    const route = (notification.data as Record<string, unknown>).route;
    if (typeof route === "string" && route.startsWith("/")) return route;
  }
  if (!notification.entity_id) return null;
  switch (notification.entity_type) {
    case "document":
    case "documents":
      return `/dashboard/documents/${notification.entity_id}`;
    case "workflow":
      return `/dashboard/workflows/${notification.entity_id}`;
    case "signing_request":
      return `/dashboard/signing/${notification.entity_id}`;
    case "task":
      return `/dashboard/tasks?task=${notification.entity_id}`;
    case "workspace_invitation":
    case "workspace_member":
      return "/dashboard/team";
    default:
      return null;
  }
}
