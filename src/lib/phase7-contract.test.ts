import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260818062157_phase_7_tasks_calendar_search.sql"),
  "utf8",
);

describe("OfficeKonnect Phase 7 persistence contract", () => {
  test("persists tasks and manual calendar events as workspace records", () => {
    expect(migration).toContain("create table public.tasks");
    expect(migration).toContain("create table public.calendar_events");
    expect(migration).toContain("workspace_id uuid not null references public.workspaces(id)");
  });

  test("keeps both operational tables behind RLS", () => {
    expect(migration).toContain("alter table public.tasks enable row level security");
    expect(migration).toContain("alter table public.calendar_events enable row level security");
    expect(migration).toContain('create policy "Task participants update tasks"');
    expect(migration).toContain('create policy "Event creators or admins update calendar events"');
  });

  test("global search remains membership checked and server side", () => {
    expect(migration).toContain("create or replace function public.search_workspace_objects");
    expect(migration).toContain("security definer");
    expect(migration).toContain("private.is_workspace_member(p_workspace_id)");
    expect(migration).toContain("grant execute on function public.search_workspace_objects");
  });

  test("global search covers the core OfficeKonnect operational objects", () => {
    for (const objectType of ["document", "template", "workflow", "signature", "task", "member"]) {
      expect(migration).toContain(`'${objectType}'`);
    }
  });
});
