import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20260818082337_phase_8_notifications_team_workspace_activity.sql",
  ),
  "utf8",
);
const invitationDirectoryMigration = readFileSync(
  join(root, "supabase/migrations/20260818082454_phase_8_workspace_invitation_directory.sql"),
  "utf8",
);
const shell = readFileSync(join(root, "src/components/officekonnect-shell.tsx"), "utf8");
const settings = readFileSync(join(root, "src/routes/dashboard/settings/index.tsx"), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").toLowerCase();
}

describe("Phase 8 operational contracts", () => {
  test("broadcast notification read state is per-user and RLS protected", () => {
    const sql = normalized(migration);
    expect(sql).toContain("create table public.notification_receipts");
    expect(sql).toContain("primary key (notification_id, user_id)");
    expect(sql).toContain("alter table public.notification_receipts enable row level security");
    expect(sql).toContain("users manage own notification receipts");
    expect(sql).toContain("case when n.user_id is null then nr.read_at else n.read_at end");
  });

  test("workspace invitation bearer tokens are hash-only and expire", () => {
    const sql = normalized(migration);
    expect(sql).toContain("token_hash text not null unique");
    expect(sql).toContain("extensions.gen_random_bytes(32)");
    expect(sql).toContain("extensions.digest(v_token,'sha256')");
    expect(sql).toContain("expires_at timestamptz not null");
    expect(sql).not.toContain("raw_token text not null");
    expect(sql).toContain("workspace_invitations_role_check check (role <> 'owner'");
  });

  test("Phase 8 RPCs are authenticated-only at the SQL ACL boundary", () => {
    const sql = normalized(`${migration}\n${invitationDirectoryMigration}`);
    const functions = [
      "list_workspace_notifications",
      "count_unread_workspace_notifications",
      "mark_notification_read",
      "mark_all_workspace_notifications_read",
      "create_workspace_invitation",
      "list_my_workspace_invitations",
      "list_workspace_invitations",
      "accept_workspace_invitation_by_id",
      "accept_workspace_invitation",
      "revoke_workspace_invitation",
      "update_workspace_member_role",
      "remove_workspace_member",
      "create_workspace",
      "list_workspace_activity",
    ];
    for (const name of functions) {
      expect(sql).toContain(`revoke all on function public.${name}`);
      expect(sql).toContain(`grant execute on function public.${name}`);
      expect(sql).toContain("to authenticated");
    }
  });

  test("team role changes preserve owner/admin hierarchy", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "if p_role='owner' then raise exception 'owner transfer is not supported here'",
    );
    expect(sql).toContain(
      "if v_target='owner' then raise exception 'the workspace owner role cannot be changed'",
    );
    expect(sql).toContain("if v_actor='admin' and (v_target='admin' or p_role='admin')");
    expect(sql).toContain(
      "if v_target='owner' then raise exception 'the workspace owner cannot leave or be removed'",
    );
  });

  test("activity aggregates canonical audit ledgers instead of copying them", () => {
    const sql = normalized(migration);
    expect(sql).toContain("from public.activity_logs");
    expect(sql).toContain("from public.workflow_events");
    expect(sql).toContain("from public.signing_events");
    expect(sql).toContain("create trigger aud_tasks");
    expect(sql).toContain("create trigger aud_calendar_events");
    expect(sql).toContain("create trigger tasks_notify_assignment");
    expect(sql).not.toContain("create table public.workspace_activity");
  });

  test("Phase 8 surfaces are active and settings contain no coming-soon controls", () => {
    expect(shell).toContain('href: "/dashboard/notifications"');
    expect(shell).toContain('href: "/dashboard/team"');
    expect(shell).toContain('href: "/dashboard/activity"');
    expect(shell).toContain('href: "/dashboard/workspace"');
    expect(shell).toContain("<NotificationBell workspaceId={workspace.activeWorkspaceId} />");
    expect(settings).not.toContain("Coming soon");
    expect(settings).not.toContain("Delete Account");
    expect(settings).toContain("No fake upgrade/checkout action");
    expect(settings).toContain("does not expose fake Connect actions");
  });
});
