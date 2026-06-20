import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import {
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  Search,
  Filter,
  MoreVertical,
  Clock,
  Calendar,
  FileText,
  Copy,
  Download,
  Loader2,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";

export const Route = createFileRoute("/dashboard/voice/")({
  component: VoiceNotesIndex,
});

function VoiceNotesIndex() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const timerRef = useRef<any>(null);
  const queryClient = useQueryClient();

  const { data: voiceNotes, isLoading } = useQuery({
    queryKey: ["voice-notes", searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("voice_notes")
        .select("*")
        .order("created_at", { ascending: false });

      if (searchQuery) {
        query = query.ilike("title", `%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const startRecording = () => {
    setIsRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const stopRecording = () => {
    setIsRecording(false);
    clearInterval(timerRef.current);
    toast.success("Voice note recorded! Saving...");
    // Mock saving for now - in reality, we'd use MediaRecorder API
    saveMutation.mutate();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("default_workspace_id")
        .single();

      const workspaceId = profile?.default_workspace_id;
      if (!workspaceId) throw new Error("No workspace found");

      const { error } = await supabase.from("voice_notes").insert({
        title: `Meeting Note ${format(new Date(), "MMM d, h:mm a")}`,
        duration_seconds: recordingTime,
        audio_url: "mock-url",
        workspace_id: workspaceId,
        created_by: user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voice-notes"] });
      toast.success("Voice note saved");
    }
  });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Voice Notes</h1>
          <p className="text-slate-500">Record, transcribe, and organize your audio notes.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="rounded-full px-6 shadow-lg shadow-primary/20">
              <Mic className="mr-2 h-4 w-4" />
              New Recording
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Record Voice Note</DialogTitle>
              <DialogDescription>
                Capture your thoughts instantly. We'll transcribe it for you.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-12">
              <div className={cn(
                "relative flex h-32 w-32 items-center justify-center rounded-full bg-slate-100 transition-all dark:bg-slate-800",
                isRecording && "scale-110 ring-4 ring-primary/20"
              )}>
                {isRecording && (
                  <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                )}
                <div className={cn(
                  "flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl",
                  isRecording ? "bg-red-500" : "bg-primary"
                )}>
                  <Mic className="h-10 w-10" />
                </div>
              </div>
              <div className="mt-8 text-center">
                <p className="text-3xl font-mono font-bold">{formatTime(recordingTime)}</p>
                <p className="text-sm text-slate-500 mt-1">{isRecording ? "Recording in progress..." : "Ready to record"}</p>
              </div>
            </div>
            <DialogFooter className="sm:justify-center">
              {!isRecording ? (
                <Button onClick={startRecording} size="lg" className="rounded-full px-12">
                  Start Recording
                </Button>
              ) : (
                <Button onClick={stopRecording} variant="destructive" size="lg" className="rounded-full px-12">
                  <Square className="mr-2 h-4 w-4 fill-current" />
                  Stop & Save
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search notes..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" size="icon">
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : voiceNotes?.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-24 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-800">
            <Mic className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium">No voice notes</h3>
          <p className="mt-1 text-slate-500">Record your first note to see it here.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {voiceNotes?.map((note) => (
            <Card key={note.id} className="group hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-900/20">
                    <Mic className="h-5 w-5" />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Rename</DropdownMenuItem>
                      <DropdownMenuItem>Transcribe</DropdownMenuItem>
                      <DropdownMenuItem>Download</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardTitle className="text-base mt-4 line-clamp-1">{note.title || "Untitled Note"}</CardTitle>
                <CardDescription className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(note.duration_seconds || 0)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(note.created_at), "MMM d")}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" className="h-8 w-full gap-2">
                    <Play className="h-3 w-3 fill-current" />
                    Listen
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 w-full gap-2">
                    <FileText className="h-3 w-3" />
                    Transcript
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
