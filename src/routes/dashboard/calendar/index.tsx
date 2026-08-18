import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileSignature,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { toastError } from "@/lib/errors";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/lib/calendar.functions";

export const Route = createFileRoute("/dashboard/calendar/")({ component: CalendarPage });

type ManualEvent = Tables<"calendar_events">;

type CalendarSource = "manual" | "task" | "workflow" | "workflow_step" | "signing";

type CalendarItem = {
  id: string;
  source: CalendarSource;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location?: string | null;
  route?: string | null;
  description?: string | null;
  manual?: ManualEvent;
};

type Editor = {
  id?: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string;
};

const emptyEditor = (day = new Date()): Editor => {
  const start = new Date(day);
  start.setHours(9, 0, 0, 0);
  const end = new Date(day);
  end.setHours(10, 0, 0, 0);
  return {
    title: "",
    description: "",
    startsAt: localDateInput(start.toISOString()),
    endsAt: localDateInput(end.toISOString()),
    allDay: false,
    location: "",
  };
};

function localDateInput(value: string) {
  const date = new Date(value);
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function sourceLabel(source: CalendarSource) {
  if (source === "workflow_step") return "Workflow step";
  return source[0].toUpperCase() + source.slice(1);
}

function sourceClass(source: CalendarSource) {
  if (source === "task") return "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
  if (source === "workflow" || source === "workflow_step") return "border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200";
  if (source === "signing") return "border-violet-300 bg-violet-50 text-violet-800 dark:bg-violet-950/30 dark:text-violet-200";
  return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200";
}

function CalendarPage() {
  const queryClient = useQueryClient();
  const createFn = useServerFn(createCalendarEvent);
  const updateFn = useServerFn(updateCalendarEvent);
  const deleteFn = useServerFn(deleteCalendarEvent);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<Editor>(() => emptyEditor());
  const [enabledSources, setEnabledSources] = useState<Record<CalendarSource, boolean>>({
    manual: true,
    task: true,
    workflow: true,
    workflow_step: true,
    signing: true,
  });

  const { data: context } = useQuery({
    queryKey: ["calendar-context"],
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

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const rangeStart = gridStart.toISOString();
  const rangeEnd = new Date(gridEnd.getTime() + 86_399_999).toISOString();

  const { data: manualEvents, isLoading } = useQuery({
    queryKey: ["calendar-manual-events", context?.workspaceId, rangeStart, rangeEnd],
    enabled: Boolean(context?.workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("workspace_id", context!.workspaceId)
        .lte("starts_at", rangeEnd)
        .gte("ends_at", rangeStart)
        .order("starts_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks } = useQuery({
    queryKey: ["calendar-tasks", context?.workspaceId, rangeStart, rangeEnd],
    enabled: Boolean(context?.workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("workspace_id", context!.workspaceId)
        .neq("status", "cancelled")
        .or(`due_at.gte.${rangeStart},start_at.gte.${rangeStart}`)
        .order("due_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: workflows } = useQuery({
    queryKey: ["calendar-workflows", context?.workspaceId, rangeStart, rangeEnd],
    enabled: Boolean(context?.workspaceId),
    queryFn: async () => {
      const { data: runs, error: runsError } = await supabase
        .from("workflow_runs")
        .select("id,title,status,due_at,updated_at")
        .eq("workspace_id", context!.workspaceId)
        .not("due_at", "is", null)
        .gte("due_at", rangeStart)
        .lte("due_at", rangeEnd)
        .order("due_at");
      if (runsError) throw runsError;
      const runIds = (runs ?? []).map((run) => run.id);
      let steps: Array<Pick<Tables<"workflow_steps">, "id" | "run_id" | "name" | "status" | "due_at">> = [];
      if (runIds.length) {
        const { data, error } = await supabase
          .from("workflow_steps")
          .select("id,run_id,name,status,due_at")
          .in("run_id", runIds)
          .not("due_at", "is", null)
          .gte("due_at", rangeStart)
          .lte("due_at", rangeEnd)
          .order("due_at");
        if (error) throw error;
        steps = data ?? [];
      }
      return { runs: runs ?? [], steps };
    },
  });

  const { data: signingRequests } = useQuery({
    queryKey: ["calendar-signing", context?.workspaceId, rangeStart, rangeEnd],
    enabled: Boolean(context?.workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signing_requests")
        .select("id,title,status,expires_at")
        .eq("workspace_id", context!.workspaceId)
        .not("expires_at", "is", null)
        .gte("expires_at", rangeStart)
        .lte("expires_at", rangeEnd)
        .order("expires_at");
      if (error) throw error;
      return data;
    },
  });

  const items = useMemo<CalendarItem[]>(() => {
    const result: CalendarItem[] = [];
    for (const event of manualEvents ?? []) {
      result.push({
        id: event.id,
        source: "manual",
        title: event.title,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        allDay: event.all_day,
        location: event.location,
        description: event.description,
        manual: event,
      });
    }
    for (const task of tasks ?? []) {
      if (task.start_at && new Date(task.start_at) >= gridStart && new Date(task.start_at) <= gridEnd) {
        result.push({
          id: `${task.id}-start`,
          source: "task",
          title: `Start: ${task.title}`,
          startsAt: task.start_at,
          endsAt: task.start_at,
          allDay: false,
          route: `/dashboard/tasks?task=${task.id}`,
          description: task.description,
        });
      }
      if (task.due_at && new Date(task.due_at) >= gridStart && new Date(task.due_at) <= new Date(rangeEnd)) {
        result.push({
          id: `${task.id}-due`,
          source: "task",
          title: `Due: ${task.title}`,
          startsAt: task.due_at,
          endsAt: task.due_at,
          allDay: false,
          route: `/dashboard/tasks?task=${task.id}`,
          description: task.description,
        });
      }
    }
    for (const run of workflows?.runs ?? []) {
      if (!run.due_at) continue;
      result.push({
        id: `${run.id}-due`,
        source: "workflow",
        title: `Workflow due: ${run.title}`,
        startsAt: run.due_at,
        endsAt: run.due_at,
        allDay: false,
        route: `/dashboard/workflows/${run.id}`,
        description: `Status: ${run.status}`,
      });
    }
    for (const step of workflows?.steps ?? []) {
      if (!step.due_at) continue;
      result.push({
        id: `${step.id}-due`,
        source: "workflow_step",
        title: `Step due: ${step.name}`,
        startsAt: step.due_at,
        endsAt: step.due_at,
        allDay: false,
        route: `/dashboard/workflows/${step.run_id}`,
        description: `Status: ${step.status}`,
      });
    }
    for (const request of signingRequests ?? []) {
      if (!request.expires_at || ["completed", "declined", "cancelled"].includes(request.status)) continue;
      result.push({
        id: `${request.id}-expires`,
        source: "signing",
        title: `Signature expires: ${request.title}`,
        startsAt: request.expires_at,
        endsAt: request.expires_at,
        allDay: false,
        route: `/dashboard/signing/${request.id}`,
        description: `Status: ${request.status}`,
      });
    }
    return result.filter((item) => enabledSources[item.source]);
  }, [manualEvents, tasks, workflows, signingRequests, enabledSources, gridStart, gridEnd, rangeEnd]);

  const monthDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const selectedItems = items
    .filter((item) => isSameDay(new Date(item.startsAt), selectedDay))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const openEditor = (event?: ManualEvent, day?: Date) => {
    if (event) {
      setEditor({
        id: event.id,
        title: event.title,
        description: event.description ?? "",
        startsAt: localDateInput(event.starts_at),
        endsAt: localDateInput(event.ends_at),
        allDay: event.all_day,
        location: event.location ?? "",
      });
    } else setEditor(emptyEditor(day ?? selectedDay));
    setEditorOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: editor.title,
        description: editor.description,
        startsAt: new Date(editor.startsAt).toISOString(),
        endsAt: new Date(editor.endsAt).toISOString(),
        allDay: editor.allDay,
        location: editor.location,
      };
      return editor.id
        ? updateFn({ data: { eventId: editor.id, ...payload } })
        : createFn({ data: payload });
    },
    onSuccess: async () => {
      toast.success(editor.id ? "Event updated" : "Event created");
      setEditorOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["calendar-manual-events"] });
    },
    onError: (error) => toastError(error, "Could not save calendar event"),
  });

  const removeEvent = async (event: ManualEvent) => {
    if (!confirm(`Delete “${event.title}”?`)) return;
    try {
      await deleteFn({ data: { eventId: event.id } });
      toast.success("Event deleted");
      await queryClient.invalidateQueries({ queryKey: ["calendar-manual-events"] });
    } catch (error) {
      toastError(error, "Could not delete event");
    }
  };

  const canEdit = (event: ManualEvent) =>
    event.created_by === context?.userId || ["owner", "admin"].includes(context?.role ?? "");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            One operational timeline for manual events, tasks, workflow deadlines and signature expiries.
          </p>
        </div>
        <Button onClick={() => openEditor()}><Plus className="mr-2 h-4 w-4" />New event</Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setMonth((value) => subMonths(value, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" onClick={() => { setMonth(startOfMonth(new Date())); setSelectedDay(new Date()); }}>Today</Button>
                <Button variant="outline" size="icon" onClick={() => setMonth((value) => addMonths(value, 1))}><ChevronRight className="h-4 w-4" /></Button>
                <h2 className="ml-2 font-semibold">{format(month, "MMMM yyyy")}</h2>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {(Object.keys(enabledSources) as CalendarSource[]).map((source) => (
                  <label key={source} className="flex items-center gap-1.5 rounded-md border px-2 py-1">
                    <Checkbox checked={enabledSources[source]} onCheckedChange={(value) => setEnabledSources((current) => ({ ...current, [source]: Boolean(value) }))} />
                    {sourceLabel(source)}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-7 border-b bg-muted/30 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="p-2">{day}</div>)}
            </div>
            {isLoading ? <div className="flex h-96 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
              <div className="grid grid-cols-7">
                {monthDays.map((day) => {
                  const dayItems = items.filter((item) => isSameDay(new Date(item.startsAt), day)).slice(0, 4);
                  const selected = isSameDay(day, selectedDay);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => setSelectedDay(day)}
                      onDoubleClick={() => openEditor(undefined, day)}
                      className={`min-h-28 border-b border-r p-1.5 text-left transition hover:bg-muted/30 ${!isSameMonth(day, month) ? "bg-muted/20 text-muted-foreground" : ""} ${selected ? "ring-2 ring-inset ring-primary" : ""}`}
                    >
                      <span className={`inline-grid h-7 w-7 place-items-center rounded-full text-xs ${isSameDay(day, new Date()) ? "bg-primary font-semibold text-primary-foreground" : ""}`}>{format(day, "d")}</span>
                      <div className="mt-1 space-y-1">{dayItems.map((item) => <div key={item.id} className={`truncate rounded border px-1.5 py-1 text-[9px] ${sourceClass(item.source)}`}>{item.allDay ? "" : `${format(new Date(item.startsAt), "HH:mm")} `}{item.title}</div>)}{items.filter((item) => isSameDay(new Date(item.startsAt), day)).length > 4 && <p className="pl-1 text-[9px] text-muted-foreground">+ more</p>}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Agenda</p><h2 className="mt-1 font-semibold">{format(selectedDay, "EEEE, MMMM d")}</h2></div><Button size="icon" variant="outline" onClick={() => openEditor(undefined, selectedDay)}><Plus className="h-4 w-4" /></Button></div><div className="mt-4 space-y-2">{selectedItems.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">No events on this day.</div> : selectedItems.map((item) => <div key={item.id} className={`rounded-lg border p-3 ${sourceClass(item.source)}`}><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.title}</p><div className="mt-1 flex flex-wrap gap-2 text-[10px] opacity-75"><span>{sourceLabel(item.source)}</span>{!item.allDay && <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{format(new Date(item.startsAt), "HH:mm")}</span>}{item.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.location}</span>}</div>{item.description && <p className="mt-2 line-clamp-2 text-xs opacity-80">{item.description}</p>}</div>{item.manual && canEdit(item.manual) && <div className="flex"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditor(item.manual)}><Pencil className="h-3 w-3" /></Button><Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => void removeEvent(item.manual!)}><Trash2 className="h-3 w-3" /></Button></div>}</div>{item.route && <Button asChild size="sm" variant="ghost" className="mt-2 h-7 px-2"><Link to={item.route as never}>Open source</Link></Button>}</div>)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Calendar sources</p><div className="mt-3 grid gap-2 text-xs">{[[CalendarDays, "Manual", "Editable workspace events"], [Clock3, "Tasks", "Task start and due dates"], [Workflow, "Workflows", "Run and step deadlines"], [FileSignature, "Signatures", "Active request expiry dates"]].map(([Icon, label, description]) => <div key={String(label)} className="flex gap-2"><Icon className="mt-0.5 h-4 w-4 text-muted-foreground" /><div><p className="font-medium">{String(label)}</p><p className="text-muted-foreground">{String(description)}</p></div></div>)}</div></CardContent></Card>
        </aside>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{editor.id ? "Edit event" : "New event"}</DialogTitle><DialogDescription>Manual events are workspace records. Operational deadlines are derived from their source modules and are not duplicated here.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Title</Label><Input value={editor.title} onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))} /></div><div className="space-y-2"><Label>Description</Label><Textarea value={editor.description} onChange={(event) => setEditor((current) => ({ ...current, description: event.target.value }))} /></div><label className="flex items-center gap-2 text-sm"><Checkbox checked={editor.allDay} onCheckedChange={(value) => setEditor((current) => ({ ...current, allDay: Boolean(value) }))} />All day</label><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Starts</Label><Input type="datetime-local" value={editor.startsAt} onChange={(event) => setEditor((current) => ({ ...current, startsAt: event.target.value }))} /></div><div className="space-y-2"><Label>Ends</Label><Input type="datetime-local" value={editor.endsAt} onChange={(event) => setEditor((current) => ({ ...current, endsAt: event.target.value }))} /></div></div><div className="space-y-2"><Label>Location</Label><Input value={editor.location} onChange={(event) => setEditor((current) => ({ ...current, location: event.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save event</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
