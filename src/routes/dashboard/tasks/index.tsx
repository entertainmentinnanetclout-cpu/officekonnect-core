import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, isPast } from "date-fns";
import {
  CheckCircle2,
  Clock3,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toastError } from "@/lib/errors";
import {
  createTask,
  deleteTask,
  updateTask,
  updateTaskStatus,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks.functions";

export const Route = createFileRoute("/dashboard/tasks/")({ component: TasksPage });

type Task = Tables<"tasks">;
type Member = { user_id: string; full_name: string; email: string; role: string };

type EditorState = {
  id?: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  startAt: string;
  dueAt: string;
  entityType: string;
  entityId: string;
};

const columns: Array<{ status: TaskStatus; label: string }> = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];

const emptyEditor = (): EditorState => ({
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  assigneeId: "unassigned",
  startAt: "",
  dueAt: "",
  entityType: "none",
  entityId: "",
});

function localInputDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function priorityClass(priority: string) {
  if (priority === "urgent") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  if (priority === "high")
    return "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300";
  if (priority === "low")
    return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
}

function TasksPage() {
  const queryClient = useQueryClient();
  const createFn = useServerFn(createTask);
  const updateFn = useServerFn(updateTask);
  const statusFn = useServerFn(updateTaskStatus);
  const deleteFn = useServerFn(deleteTask);
  const [view, setView] = useState<"board" | "list">("board");
  const [scope, setScope] = useState<"all" | "mine" | "created">("all");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());

  const { data: context } = useQuery({
    queryKey: ["tasks-context"],
    queryFn: async () => {
      const { data: auth, error } = await supabase.auth.getUser();
      if (error || !auth.user) throw error ?? new Error("Authentication required");
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("default_workspace_id")
        .eq("id", auth.user.id)
        .single();
      if (profileError) throw profileError;
      if (!profile.default_workspace_id) throw new Error("No active workspace selected");
      const { data: membership, error: membershipError } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", profile.default_workspace_id)
        .eq("user_id", auth.user.id)
        .single();
      if (membershipError) throw membershipError;
      return {
        userId: auth.user.id,
        workspaceId: profile.default_workspace_id,
        role: membership.role,
      };
    },
  });

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks", context?.workspaceId],
    enabled: Boolean(context?.workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("workspace_id", context!.workspaceId)
        .neq("status", "cancelled")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: members } = useQuery({
    queryKey: ["tasks-directory", context?.workspaceId],
    enabled: Boolean(context?.workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_workspace_member_directory", {
        p_workspace_id: context!.workspaceId,
      });
      if (error) throw error;
      return data as Member[];
    },
  });

  const { data: linkOptions } = useQuery({
    queryKey: ["task-link-options", context?.workspaceId, editor.entityType, editorOpen],
    enabled: Boolean(context?.workspaceId && editorOpen && editor.entityType !== "none"),
    queryFn: async () => {
      if (editor.entityType === "document") {
        const { data, error } = await supabase
          .from("documents")
          .select("id,title")
          .eq("workspace_id", context!.workspaceId)
          .neq("document_status", "deleted")
          .order("updated_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        return (data ?? []).map((item) => ({ id: item.id, label: item.title }));
      }
      if (editor.entityType === "workflow") {
        const { data, error } = await supabase
          .from("workflow_runs")
          .select("id,title,status")
          .eq("workspace_id", context!.workspaceId)
          .order("updated_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        return (data ?? []).map((item) => ({
          id: item.id,
          label: `${item.title} · ${item.status}`,
        }));
      }
      if (editor.entityType === "signing_request") {
        const { data, error } = await supabase
          .from("signing_requests")
          .select("id,title,status")
          .eq("workspace_id", context!.workspaceId)
          .order("updated_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        return (data ?? []).map((item) => ({
          id: item.id,
          label: `${item.title} · ${item.status}`,
        }));
      }
      return [];
    },
  });

  const memberMap = useMemo(
    () => new Map((members ?? []).map((member) => [member.user_id, member])),
    [members],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (tasks ?? []).filter((task) => {
      if (scope === "mine" && task.assignee_id !== context?.userId) return false;
      if (scope === "created" && task.created_by !== context?.userId) return false;
      if (priority !== "all" && task.priority !== priority) return false;
      return (
        !needle ||
        task.title.toLowerCase().includes(needle) ||
        task.description?.toLowerCase().includes(needle)
      );
    });
  }, [tasks, query, scope, priority, context?.userId]);

  useEffect(() => {
    if (!tasks?.length || typeof window === "undefined") return;
    const taskId = new URLSearchParams(window.location.search).get("task");
    const task = tasks.find((item) => item.id === taskId);
    if (task) openEditor(task);
  }, [tasks]);

  const openEditor = (task?: Task) => {
    if (!task) setEditor(emptyEditor());
    else
      setEditor({
        id: task.id,
        title: task.title,
        description: task.description ?? "",
        status: task.status as TaskStatus,
        priority: task.priority as TaskPriority,
        assigneeId: task.assignee_id ?? "unassigned",
        startAt: localInputDate(task.start_at),
        dueAt: localInputDate(task.due_at),
        entityType: task.entity_type ?? "none",
        entityId: task.entity_id ?? "",
      });
    setEditorOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: editor.title,
        description: editor.description,
        status: editor.status,
        priority: editor.priority,
        assigneeId: editor.assigneeId === "unassigned" ? null : editor.assigneeId,
        startAt: editor.startAt ? new Date(editor.startAt).toISOString() : null,
        dueAt: editor.dueAt ? new Date(editor.dueAt).toISOString() : null,
        entityType: editor.entityType === "none" ? null : editor.entityType,
        entityId: editor.entityType === "none" || !editor.entityId ? null : editor.entityId,
      };
      return editor.id
        ? updateFn({ data: { taskId: editor.id, ...payload } })
        : createFn({ data: payload });
    },
    onSuccess: async () => {
      toast.success(editor.id ? "Task updated" : "Task created");
      setEditorOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => toastError(error, "Could not save task"),
  });

  const moveStatus = async (task: Task, nextStatus: TaskStatus) => {
    try {
      await statusFn({ data: { taskId: task.id, status: nextStatus } });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      toastError(error, "Could not update task status");
    }
  };

  const removeTask = async (task: Task) => {
    if (!confirm(`Delete “${task.title}”?`)) return;
    try {
      await deleteFn({ data: { taskId: task.id } });
      toast.success("Task deleted");
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      toastError(error, "Could not delete task");
    }
  };

  const TaskCard = ({ task }: { task: Task }) => {
    const assignee = task.assignee_id ? memberMap.get(task.assignee_id) : null;
    const overdue = task.due_at && task.status !== "done" && isPast(new Date(task.due_at));
    return (
      <Card className="group">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="text-left font-medium hover:underline"
                  onClick={() => openEditor(task)}
                >
                  {task.title}
                </button>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityClass(task.priority)}`}
                >
                  {task.priority}
                </span>
              </div>
              {task.description && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {task.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                {assignee && (
                  <span className="flex items-center gap-1">
                    <UserRound className="h-3 w-3" />
                    {assignee.full_name || assignee.email}
                  </span>
                )}
                {task.due_at && (
                  <span
                    className={`flex items-center gap-1 ${overdue ? "font-semibold text-red-600" : ""}`}
                  >
                    <Clock3 className="h-3 w-3" />
                    {overdue ? "Overdue · " : ""}
                    {format(new Date(task.due_at), "MMM d, HH:mm")}
                  </span>
                )}
                {task.entity_type && <span>{task.entity_type.replaceAll("_", " ")}</span>}
              </div>
            </div>
            <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
              <Button size="icon" variant="ghost" onClick={() => openEditor(task)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {(task.created_by === context?.userId ||
                ["owner", "admin"].includes(context?.role ?? "")) && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-red-500"
                  onClick={() => void removeTask(task)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          {task.status !== "done" && (
            <div className="mt-3 flex flex-wrap gap-1">
              {columns
                .filter((column) => column.status !== task.status)
                .map((column) => (
                  <Button
                    key={column.status}
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[10px]"
                    onClick={() => void moveStatus(task, column.status)}
                  >
                    Move to {column.label}
                  </Button>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Assign, prioritize and track lightweight office work linked to documents, workflows and
            signature requests.
          </p>
        </div>
        <Button onClick={() => openEditor()}>
          <Plus className="mr-2 h-4 w-4" />
          New task
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            "Open",
            (tasks ?? []).filter((task) => !["done", "cancelled"].includes(task.status)).length,
          ],
          [
            "Mine",
            (tasks ?? []).filter(
              (task) => task.assignee_id === context?.userId && task.status !== "done",
            ).length,
          ],
          [
            "Overdue",
            (tasks ?? []).filter(
              (task) =>
                task.due_at &&
                !["done", "cancelled"].includes(task.status) &&
                isPast(new Date(task.due_at)),
            ).length,
          ],
          ["Completed", (tasks ?? []).filter((task) => task.status === "done").length],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{String(label)}</p>
              <p className="mt-1 text-2xl font-semibold">{Number(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 xl:flex-row xl:items-center">
        <div className="flex flex-wrap gap-2">
          {(["all", "mine", "created"] as const).map((item) => (
            <Button
              key={item}
              size="sm"
              variant={scope === item ? "default" : "outline"}
              onClick={() => setScope(item)}
            >
              {item === "all" ? "All tasks" : item === "mine" ? "Assigned to me" : "Created by me"}
            </Button>
          ))}
        </div>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {["urgent", "high", "medium", "low"].map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks"
          />
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant={view === "board" ? "default" : "outline"}
            onClick={() => setView("board")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant={view === "list" ? "default" : "outline"}
            onClick={() => setView("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : view === "board" ? (
        <div className="grid gap-4 xl:grid-cols-4">
          {columns.map((column) => {
            const rows = filtered.filter((task) => task.status === column.status);
            return (
              <section key={column.status} className="rounded-xl bg-muted/30 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{column.label}</h2>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs">
                    {rows.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {rows.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                  {rows.length === 0 && (
                    <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                      No tasks
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No tasks match these filters.
            </div>
          )}
        </div>
      )}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editor.id ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription>
              Tasks remain lightweight but can be assigned, scheduled and linked to operational
              objects.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={editor.title}
                onChange={(event) =>
                  setEditor((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editor.description}
                onChange={(event) =>
                  setEditor((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editor.status}
                  onValueChange={(value) =>
                    setEditor((current) => ({ ...current, status: value as TaskStatus }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((column) => (
                      <SelectItem key={column.status} value={column.status}>
                        {column.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={editor.priority}
                  onValueChange={(value) =>
                    setEditor((current) => ({ ...current, priority: value as TaskPriority }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["low", "medium", "high", "urgent"].map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assignee</Label>
                <Select
                  value={editor.assigneeId}
                  onValueChange={(value) =>
                    setEditor((current) => ({ ...current, assigneeId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {members?.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.full_name || member.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start</Label>
                <Input
                  type="datetime-local"
                  value={editor.startAt}
                  onChange={(event) =>
                    setEditor((current) => ({ ...current, startAt: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Due</Label>
                <Input
                  type="datetime-local"
                  value={editor.dueAt}
                  onChange={(event) =>
                    setEditor((current) => ({ ...current, dueAt: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Link to</Label>
                <Select
                  value={editor.entityType}
                  onValueChange={(value) =>
                    setEditor((current) => ({ ...current, entityType: value, entityId: "" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked object</SelectItem>
                    <SelectItem value="document">Document / Sheet</SelectItem>
                    <SelectItem value="workflow">Workflow</SelectItem>
                    <SelectItem value="signing_request">Signature request</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editor.entityType !== "none" && (
                <div className="space-y-2">
                  <Label>Object</Label>
                  <Select
                    value={editor.entityId || undefined}
                    onValueChange={(value) =>
                      setEditor((current) => ({ ...current, entityId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose object" />
                    </SelectTrigger>
                    <SelectContent>
                      {linkOptions?.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            {editor.id && (
              <Button
                variant="ghost"
                className="mr-auto text-red-600"
                onClick={() => {
                  const task = tasks?.find((item) => item.id === editor.id);
                  if (task) void removeTask(task);
                  setEditorOpen(false);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Save task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
