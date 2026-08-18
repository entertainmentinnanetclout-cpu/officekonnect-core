import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Loader2,
  MailPlus,
  ShieldCheck,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceShell } from "@/hooks/use-workspace-shell";
import { toastError } from "@/lib/errors";
import {
  acceptWorkspaceInvitationById,
  createWorkspaceInvitation,
  listMyWorkspaceInvitations,
  listWorkspaceInvitations,
  listWorkspaceMemberDirectory,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  updateWorkspaceMemberRole,
  type WorkspaceMemberDirectoryItem,
  type WorkspaceRole,
} from "@/lib/phase8.functions";

export const Route = createFileRoute("/dashboard/team/")({ component: TeamPage });

type InviteRole = Exclude<WorkspaceRole, "owner">;

function TeamPage() {
  const { user } = useAuth();
  const workspace = useWorkspaceShell(user);
  const workspaceId = workspace.activeWorkspaceId;
  const currentRole = workspace.activeWorkspace?.role as WorkspaceRole | undefined;
  const canAdminister = currentRole === "owner" || currentRole === "admin";
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("member");
  const [inviteDays, setInviteDays] = useState("7");
  const [issuedLink, setIssuedLink] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMemberDirectoryItem | null>(null);

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["phase8-team-members", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => listWorkspaceMemberDirectory(workspaceId!),
  });

  const { data: pending = [] } = useQuery({
    queryKey: ["phase8-team-invitations", workspaceId],
    enabled: Boolean(workspaceId && canAdminister),
    queryFn: () => listWorkspaceInvitations(workspaceId!),
  });

  const { data: myInvitations = [] } = useQuery({
    queryKey: ["phase8-my-invitations", user?.id],
    enabled: Boolean(user),
    queryFn: listMyWorkspaceInvitations,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["phase8-team-members"] }),
      queryClient.invalidateQueries({ queryKey: ["phase8-team-invitations"] }),
      queryClient.invalidateQueries({ queryKey: ["phase8-my-invitations"] }),
      queryClient.invalidateQueries({ queryKey: ["phase8-notifications"] }),
      queryClient.invalidateQueries({ queryKey: ["phase8-notification-count"] }),
    ]);
  };

  const createInvite = useMutation({
    mutationFn: () =>
      createWorkspaceInvitation({
        workspaceId: workspaceId!,
        email: inviteEmail,
        role: inviteRole,
        expiresInDays: Number(inviteDays),
      }),
    onSuccess: async (created) => {
      const link = `${window.location.origin}/invite/${created.raw_token}`;
      setIssuedLink(link);
      toast.success("Invitation created. Copy the secure link now.");
      await refresh();
    },
    onError: (error) => toastError(error, "Could not create invitation"),
  });

  const acceptInvite = useMutation({
    mutationFn: acceptWorkspaceInvitationById,
    onSuccess: async (accepted) => {
      toast.success(`Joined ${accepted.workspace_name}`);
      await refresh();
      await workspace.reload();
    },
    onError: (error) => toastError(error, "Could not accept invitation"),
  });

  const revokeInvite = useMutation({
    mutationFn: revokeWorkspaceInvitation,
    onSuccess: refresh,
    onError: (error) => toastError(error, "Could not revoke invitation"),
  });

  const roleChange = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: InviteRole }) =>
      updateWorkspaceMemberRole(workspaceId!, userId, role),
    onSuccess: async () => {
      toast.success("Role updated");
      await refresh();
    },
    onError: (error) => toastError(error, "Could not update role"),
  });

  const removeMember = useMutation({
    mutationFn: (member: WorkspaceMemberDirectoryItem) =>
      removeWorkspaceMember(workspaceId!, member.user_id),
    onSuccess: async () => {
      setRemoveTarget(null);
      toast.success("Workspace membership updated");
      await refresh();
      await workspace.reload();
    },
    onError: (error) => toastError(error, "Could not remove member"),
  });

  const roleOptions = useMemo<InviteRole[]>(
    () => (currentRole === "owner" ? ["admin", "member", "viewer"] : ["member", "viewer"]),
    [currentRole],
  );

  const closeInvite = () => {
    setInviteOpen(false);
    setIssuedLink(null);
    setInviteEmail("");
    setInviteRole("member");
    setInviteDays("7");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            Members, roles and secure invitations for{" "}
            {workspace.activeWorkspace?.name ?? "the active workspace"}.
          </p>
        </div>
        {canAdminister ? (
          <Button onClick={() => setInviteOpen(true)} disabled={!workspaceId}>
            <MailPlus className="mr-2 h-4 w-4" />
            Invite member
          </Button>
        ) : null}
      </div>

      {myInvitations.length > 0 ? (
        <Card className="border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/20">
          <CardHeader>
            <CardTitle className="text-base">Invitations waiting for you</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {myInvitations.map((invitation) => (
              <div
                key={invitation.invitation_id}
                className="flex flex-col justify-between gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-medium">{invitation.workspace_name}</p>
                  <p className="text-sm text-muted-foreground">
                    Invited by {invitation.inviter_name} as {invitation.role} · expires{" "}
                    {new Date(invitation.expires_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => acceptInvite.mutate(invitation.invitation_id)}
                  disabled={acceptInvite.isPending}
                >
                  <Check className="mr-2 h-4 w-4" />
                  Accept
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Members" value={members.length} />
        <Summary label="Pending invites" value={canAdminister ? pending.length : "—"} />
        <Summary label="Your role" value={currentRole ?? "—"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {membersLoading || workspace.isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No members found.</div>
          ) : (
            <div className="divide-y">
              {members.map((member) => {
                const isSelf = member.user_id === user?.id;
                const targetIsOwner = member.role === "owner";
                const canChange =
                  canAdminister &&
                  !isSelf &&
                  !targetIsOwner &&
                  !(currentRole === "admin" && member.role === "admin");
                const canRemove =
                  !targetIsOwner &&
                  (isSelf ||
                    (canAdminister && !(currentRole === "admin" && member.role === "admin")));
                return (
                  <div
                    key={member.user_id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted font-semibold">
                      {(member.full_name || member.email).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {member.full_name || member.email}
                        {isSelf ? " (you)" : ""}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                    </div>
                    {canChange ? (
                      <Select
                        value={member.role}
                        onValueChange={(value) =>
                          roleChange.mutate({ userId: member.user_id, role: value as InviteRole })
                        }
                        disabled={roleChange.isPending}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="rounded-full border px-3 py-1 text-xs font-semibold uppercase text-muted-foreground">
                        {member.role}
                      </span>
                    )}
                    {canRemove ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setRemoveTarget(member)}
                        title={isSelf ? "Leave workspace" : "Remove member"}
                      >
                        <UserMinus className="h-4 w-4 text-red-600" />
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {canAdminister && pending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invitations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.map((invitation) => (
              <div
                key={invitation.invitation_id}
                className="flex flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-medium">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {invitation.role} · invited by {invitation.inviter_name} · expires{" "}
                    {new Date(invitation.expires_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeInvite.mutate(invitation.invitation_id)}
                  disabled={revokeInvite.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Revoke
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => (open ? setInviteOpen(true) : closeInvite())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite workspace member</DialogTitle>
            <DialogDescription>
              Invitation bearer tokens are shown once and stored only as a hash on the backend.
            </DialogDescription>
          </DialogHeader>
          {issuedLink ? (
            <div className="space-y-3">
              <Label>Secure invitation link</Label>
              <div className="flex gap-2">
                <Input value={issuedLink} readOnly className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(issuedLink)
                      .then(() => toast.success("Invitation link copied"))
                  }
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Copy this link now. OfficeKonnect does not persist the raw bearer token.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email address</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => setInviteRole(value as InviteRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Expires in</Label>
                  <Select value={inviteDays} onValueChange={setInviteDays}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 day</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeInvite}>
              Close
            </Button>
            {!issuedLink ? (
              <Button
                onClick={() => createInvite.mutate()}
                disabled={!inviteEmail.trim() || createInvite.isPending}
              >
                {createInvite.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MailPlus className="mr-2 h-4 w-4" />
                )}
                Create invitation
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {removeTarget?.user_id === user?.id ? "Leave workspace?" : "Remove member?"}
            </DialogTitle>
            <DialogDescription>
              {removeTarget?.user_id === user?.id
                ? "You will lose access to this workspace. The owner cannot leave through this action."
                : `Remove ${removeTarget?.full_name || removeTarget?.email || "this member"} from the active workspace?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeTarget && removeMember.mutate(removeTarget)}
              disabled={removeMember.isPending}
            >
              {removeMember.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserMinus className="mr-2 h-4 w-4" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  const Icon = label === "Your role" ? ShieldCheck : Users;
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold capitalize">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
