import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface WorkspaceShellOption {
  id: string;
  name: string;
  role: string;
}

export function useWorkspaceShell(user: User | null) {
  const [workspaces, setWorkspaces] = useState<WorkspaceShellOption[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(user));
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const [{ data: profile, error: profileError }, { data: memberships, error: membershipError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("default_workspace_id")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("workspace_members")
          .select("workspace_id, role")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),
      ]);

    if (profileError || membershipError) {
      setError(profileError?.message ?? membershipError?.message ?? "Unable to load workspaces.");
      setIsLoading(false);
      return;
    }

    const workspaceIds = (memberships ?? []).map((membership) => membership.workspace_id);
    if (workspaceIds.length === 0) {
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      setIsLoading(false);
      return;
    }

    const { data: workspaceRows, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, name")
      .in("id", workspaceIds);

    if (workspaceError) {
      setError(workspaceError.message);
      setIsLoading(false);
      return;
    }

    const names = new Map((workspaceRows ?? []).map((workspace) => [workspace.id, workspace.name]));
    const options = (memberships ?? []).map((membership) => ({
      id: membership.workspace_id,
      name: names.get(membership.workspace_id) ?? "Workspace",
      role: String(membership.role ?? "member"),
    }));

    setWorkspaces(options);
    setActiveWorkspaceId(
      options.some((workspace) => workspace.id === profile?.default_workspace_id)
        ? (profile?.default_workspace_id ?? options[0]?.id ?? null)
        : (options[0]?.id ?? null),
    );
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!user || workspaceId === activeWorkspaceId) return;
      if (!workspaces.some((workspace) => workspace.id === workspaceId)) return;

      setIsSwitching(true);
      setError(null);
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ default_workspace_id: workspaceId })
        .eq("id", user.id);

      if (updateError) {
        setError(updateError.message);
        setIsSwitching(false);
        return;
      }

      setActiveWorkspaceId(workspaceId);
      setIsSwitching(false);
    },
    [activeWorkspaceId, user, workspaces],
  );

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  );

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    isLoading,
    isSwitching,
    error,
    reload: load,
    switchWorkspace,
  };
}
