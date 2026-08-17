import { useState, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eraser, Type, Upload, PenTool, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toastError } from "@/lib/errors";

interface SignatureManagerProps {
  onSave?: (signatureUrl: string) => void;
}

export function SignatureManager({ onSave }: SignatureManagerProps) {
  const [activeTab, setActiveTab] = useState("draw");
  const [typedName, setTypedName] = useState("");
  const [sigName, setSigName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const sigCanvas = useRef<SignatureCanvas>(null);
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (dataUrl: string) => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not authenticated");

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("default_workspace_id")
        .single();
      if (profileErr) throw profileErr;
      const workspaceId = profile?.default_workspace_id;
      if (!workspaceId) throw new Error("No workspace found");

      // Decide default: explicit toggle, or auto-default if this is the user's first signature.
      const { count } = await supabase
        .from("user_signatures")
        .select("id", { count: "exact", head: true })
        .eq("created_by", user.id);
      const isDefault = makeDefault || (count ?? 0) === 0;

      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `sig-${Date.now()}.png`;
      const filePath = `${workspaceId}/${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("signatures")
        .upload(filePath, blob, { contentType: "image/png", upsert: false });
      if (uploadError) throw uploadError;

      const { data: signed } = await supabase.storage
        .from("signatures")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365);
      const publicUrl = signed?.signedUrl ?? "";

      const { data, error } = await supabase
        .from("user_signatures")
        .insert({
          name: sigName || typedName || "My Signature",
          signature_image_url: publicUrl,
          storage_path: filePath,
          workspace_id: workspaceId,
          created_by: user.id,
          is_default: isDefault,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["signatures"] });
      toast.success("Signature saved");
      sigCanvas.current?.clear();
      setTypedName("");
      setSigName("");
      setMakeDefault(false);
      if (onSave) onSave(data.signature_image_url);
    },
    onError: (error) => {
      toastError(error, "Failed to save signature");
    },
  });

  const handleClear = () => sigCanvas.current?.clear();

  const handleSave = () => {
    let dataUrl = "";
    if (activeTab === "draw") {
      if (sigCanvas.current?.isEmpty()) return toast.error("Please draw your signature first");
      dataUrl = sigCanvas.current?.getCanvas().toDataURL("image/png") || "";
    } else if (activeTab === "type") {
      if (!typedName) return toast.error("Please type your name");
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 200;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = "italic 64px 'Brush Script MT', cursive";
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(typedName, 300, 100);
        dataUrl = canvas.toDataURL("image/png");
      }
    }
    if (dataUrl) saveMutation.mutate(dataUrl);
  };

  const isSaving = saveMutation.isPending;

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="draw" className="gap-2">
            <PenTool className="h-4 w-4" />
            Draw
          </TabsTrigger>
          <TabsTrigger value="type" className="gap-2">
            <Type className="h-4 w-4" />
            Type
          </TabsTrigger>
          <TabsTrigger value="upload" className="gap-2" disabled>
            <Upload className="h-4 w-4" />
            Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="draw" className="mt-4">
          <div className="relative rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <SignatureCanvas
              ref={sigCanvas}
              penColor="black"
              canvasProps={{ className: "h-56 w-full cursor-crosshair rounded-xl" }}
            />
            <div className="absolute bottom-3 right-3">
              <Button variant="outline" size="sm" onClick={handleClear} className="h-8">
                <Eraser className="mr-2 h-3 w-3" />
                Clear
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="type" className="mt-4 space-y-3">
          <Input
            placeholder="Your full name"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            className="text-lg italic"
          />
          <div className="flex h-28 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
            {typedName ? (
              <span
                className="text-4xl italic"
                style={{ fontFamily: "'Brush Script MT', cursive" }}
              >
                {typedName}
              </span>
            ) : (
              <span className="text-slate-400 italic">Preview</span>
            )}
          </div>
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-8 dark:border-slate-800">
            <Upload className="mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium">Coming soon</p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="sig-label">Signature label</Label>
          <Input
            id="sig-label"
            placeholder="e.g. Business signature"
            value={sigName}
            onChange={(e) => setSigName(e.target.value)}
          />
        </div>
        <label className="flex h-10 items-center gap-2 text-sm">
          <Checkbox checked={makeDefault} onCheckedChange={(v) => setMakeDefault(!!v)} />
          Set as default
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Button variant="ghost" onClick={handleClear} disabled={isSaving}>
          Reset
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Signature
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
