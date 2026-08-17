import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Mic,
  Square,
  Play,
  Search,
  Filter,
  MoreVertical,
  Clock,
  Calendar,
  FileText,
  Loader2,
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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/dashboard/voice/")({
  component: VoiceNotesIndex,
});

function VoiceNotesIndex() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const queryClient = useQueryClient();

  const { data: voiceNotes, isLoading } = useQuery({
    queryKey: ["voice-notes", searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("voice_notes")
        .select("*")
        .order("created_at", { ascending: false });
      if (searchQuery) query = query.ilike("title", `%${searchQuery}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => {
      const rows = (q.state.data as Array<{ transcript: string | null }> | undefined) ?? [];
      return rows.some((n) => !n.transcript) ? 5000 : false;
    },
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        void saveRecording(blob);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((p) => p + 1), 1000);
    } catch (err) {
      console.error(err);
      toast.error("Microphone permission denied or unavailable");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const saveRecording = async (blob: Blob) => {
    setIsSaving(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("default_workspace_id")
        .single();
      const workspaceId = profile?.default_workspace_id;
      if (!workspaceId) throw new Error("No workspace found");

      const id = crypto.randomUUID();
      const storagePath = `${workspaceId}/${user.id}/${id}.webm`;
      const { error: upErr } = await supabase.storage
        .from("voice-notes")
        .upload(storagePath, blob, { contentType: blob.type, upsert: false });
      if (upErr) throw upErr;

      const { data: signed } = await supabase.storage
        .from("voice-notes")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

      const { data: row, error: insErr } = await supabase
        .from("voice_notes")
        .insert({
          title: `Voice Note ${format(new Date(), "MMM d, h:mm a")}`,
          duration_seconds: recordingTime,
          audio_url: signed?.signedUrl ?? "",
          storage_path: storagePath,
          workspace_id: workspaceId,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      // Enqueue transcription job
      await supabase.from("jobs").insert({
        workspace_id: workspaceId,
        created_by: user.id,
        kind: "audio_transcribe",
        input: { voiceNoteId: row.id, storagePath, bucket: "voice-notes" },
        entity_type: "voice_note",
        entity_id: row.id,
        provider: "openai",
        status: "queued",
      });

      toast.success("Recording saved — transcription in progress");
      queryClient.invalidateQueries({ queryKey: ["voice-notes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setDialogOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (note: { id: string; storage_path: string | null }) => {
      if (note.storage_path) {
        await supabase.storage.from("voice-notes").remove([note.storage_path]);
      }
      const { error } = await supabase.from("voice_notes").delete().eq("id", note.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voice-notes"] });
      toast.success("Voice note deleted");
    },
  });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Voice Notes</h1>
          <p className="text-slate-500">Record, transcribe, and organize your audio notes.</p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(o) => {
            if (!isRecording && !isSaving) setDialogOpen(o);
          }}
        >
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
                Capture your thoughts. We'll transcribe them with Whisper.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-12">
              <div
                className={cn(
                  "relative flex h-32 w-32 items-center justify-center rounded-full bg-slate-100 transition-all dark:bg-slate-800",
                  isRecording && "scale-110 ring-4 ring-primary/20",
                )}
              >
                {isRecording && (
                  <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                )}
                <div
                  className={cn(
                    "flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl",
                    isRecording ? "bg-red-500" : "bg-primary",
                  )}
                >
                  <Mic className="h-10 w-10" />
                </div>
              </div>
              <div className="mt-8 text-center">
                <p className="text-3xl font-mono font-bold">{formatTime(recordingTime)}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {isSaving
                    ? "Uploading…"
                    : isRecording
                      ? "Recording in progress…"
                      : "Ready to record"}
                </p>
              </div>
            </div>
            <DialogFooter className="sm:justify-center">
              {!isRecording ? (
                <Button
                  onClick={startRecording}
                  size="lg"
                  className="rounded-full px-12"
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Start Recording
                </Button>
              ) : (
                <Button
                  onClick={stopRecording}
                  variant="destructive"
                  size="lg"
                  className="rounded-full px-12"
                >
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
            <VoiceNoteCard
              key={note.id}
              note={note as Parameters<typeof VoiceNoteCard>[0]["note"]}
              onDelete={() =>
                deleteMutation.mutate({ id: note.id, storage_path: note.storage_path })
              }
              formatTime={formatTime}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VoiceNoteCard({
  note,
  onDelete,
  formatTime,
}: {
  note: {
    id: string;
    title: string | null;
    duration_seconds: number | null;
    created_at: string;
    transcript: string | null;
    storage_path: string | null;
    audio_url: string | null;
    workspace_id?: string | null;
    created_by?: string | null;
  };
  onDelete: () => void;
  formatTime: (s: number) => string;
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const queryClient = useQueryClient();

  const loadAudio = async () => {
    if (audioUrl) return;
    if (!note.storage_path) {
      if (note.audio_url) setAudioUrl(note.audio_url);
      return;
    }
    const { data, error } = await supabase.storage
      .from("voice-notes")
      .createSignedUrl(note.storage_path, 60 * 60);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data?.signedUrl) setAudioUrl(data.signedUrl);
  };

  const retry = async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_workspace_id")
      .single();
    const user = (await supabase.auth.getUser()).data.user;
    const workspaceId = note.workspace_id ?? profile?.default_workspace_id;
    if (!workspaceId || !user) return toast.error("Workspace unavailable");
    const { error } = await supabase.from("jobs").insert({
      workspace_id: workspaceId,
      created_by: user.id,
      kind: "audio_transcribe",
      input: { voiceNoteId: note.id, storagePath: note.storage_path, bucket: "voice-notes" },
      entity_type: "voice_note",
      entity_id: note.id,
      provider: "openai",
      status: "queued",
    });
    if (error) return toast.error(error.message);
    toast.success("Transcription re-queued");
    queryClient.invalidateQueries({ queryKey: ["voice-notes"] });
  };

  const downloadTranscript = () => {
    if (!note.transcript) return;
    const blob = new Blob([note.transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${note.title || "transcript"}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="group hover:border-primary/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-900/20">
            <Mic className="h-5 w-5" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowTranscript((s) => !s)}>
                {showTranscript ? "Hide transcript" : "Show transcript"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={retry}>Retry transcription</DropdownMenuItem>
              <DropdownMenuItem onClick={downloadTranscript} disabled={!note.transcript}>
                Download transcript
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={onDelete}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CardTitle className="text-base mt-4 line-clamp-1">
          {note.title || "Untitled Note"}
        </CardTitle>
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
      <CardContent className="space-y-3">
        {audioUrl ? (
          <audio src={audioUrl} controls className="w-full h-8" />
        ) : (
          <Button variant="secondary" size="sm" className="h-8 w-full gap-2" onClick={loadAudio}>
            <Play className="h-3 w-3 fill-current" />
            Load audio
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full gap-2"
          onClick={() => setShowTranscript((s) => !s)}
          disabled={!note.transcript}
        >
          <FileText className="h-3 w-3" />
          {note.transcript
            ? showTranscript
              ? "Hide transcript"
              : "Show transcript"
            : "Transcribing…"}
        </Button>
        {showTranscript && note.transcript && (
          <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-auto rounded-md bg-slate-50 dark:bg-slate-800/50 p-2">
            {note.transcript}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
