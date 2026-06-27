import { useState, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Eraser,
  RotateCcw,
  Type,
  Upload,
  PenTool,
  Save,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface SignatureManagerProps {
  onSave?: (signatureUrl: string) => void;
}

export function SignatureManager({ onSave }: SignatureManagerProps) {
  const [activeTab, setActiveTab] = useState("draw");
  const [typedName, setTypedName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const sigCanvas = useRef<SignatureCanvas>(null);
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (dataUrl: string) => {
      setIsSaving(true);
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not authenticated");

      // Resolve workspace first — storage policies require workspace_id as the first folder.
      const { data: profile } = await supabase
        .from("profiles")
        .select("default_workspace_id")
        .single();
      const workspaceId = profile?.default_workspace_id;
      if (!workspaceId) throw new Error("No workspace found");

      // 1. Upload signature image to storage (path: <workspace>/<user>/sig-*.png)
      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `sig-${Date.now()}.png`;
      const filePath = `${workspaceId}/${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("signatures")
        .upload(filePath, blob, { contentType: "image/png", upsert: false });

      if (uploadError) throw uploadError;

      // Bucket is private — generate a long-lived signed URL for display.
      const { data: signed } = await supabase.storage
        .from("signatures")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365);
      const publicUrl = signed?.signedUrl ?? "";

      const { data, error } = await supabase.from("user_signatures").insert({
        name: typedName || "My Signature",
        signature_image_url: publicUrl,
        storage_path: filePath,
        workspace_id: workspaceId,
        created_by: user.id,
        is_default: true, // Auto-set as default for V1
      }).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Signature saved successfully");
      if (onSave) onSave(data.signature_image_url);
      setIsSaving(false);
    },
    onError: (error: any) => {
      toast.error(`Failed to save signature: ${error.message}`);
      setIsSaving(false);
    }
  });

  const handleClear = () => {
    sigCanvas.current?.clear();
  };

  const handleSave = () => {
    let dataUrl = "";

    if (activeTab === "draw") {
      if (sigCanvas.current?.isEmpty()) {
        toast.error("Please provide a signature first");
        return;
      }
      // react-signature-canvas v2: use getCanvas() directly (getTrimmedCanvas was removed).
      dataUrl = sigCanvas.current?.getCanvas().toDataURL("image/png") || "";
    } else if (activeTab === "type") {
      if (!typedName) {
        toast.error("Please type your name");
        return;
      }
      // Create a canvas to render the text
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 200;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = "italic 48px 'Brush Script MT', cursive";
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(typedName, 200, 100);
        dataUrl = canvas.toDataURL("image/png");
      }
    }

    if (dataUrl) {
      saveMutation.mutate(dataUrl);
    }
  };

  return (
    <div className="space-y-6">
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
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="draw" className="mt-4">
          <div className="relative rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <SignatureCanvas
              ref={sigCanvas}
              penColor="black"
              canvasProps={{
                className: "h-64 w-full cursor-crosshair rounded-xl",
              }}
            />
            <div className="absolute bottom-4 right-4 flex gap-2">
              <Button variant="outline" size="sm" onClick={handleClear} className="h-8">
                <Eraser className="mr-2 h-3 w-3" />
                Clear
              </Button>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">
            Use your mouse or touch screen to draw your signature
          </p>
        </TabsContent>

        <TabsContent value="type" className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sig-name">Type your name</Label>
            <Input
              id="sig-name"
              placeholder="Your full name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              className="text-lg italic"
            />
          </div>
          <div className="flex h-32 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
            {typedName ? (
              <span className="text-4xl italic font-serif" style={{ fontFamily: "'Brush Script MT', cursive" }}>
                {typedName}
              </span>
            ) : (
              <span className="text-slate-400 italic">Signature preview</span>
            )}
          </div>
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-12 dark:border-slate-800">
            <Upload className="mb-4 h-10 w-10 text-slate-300" />
            <p className="mb-2 text-sm font-medium">Upload signature image</p>
            <p className="text-xs text-slate-400">PNG with transparent background preferred</p>
            <Button variant="outline" size="sm" className="mt-4">Choose File</Button>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
        <Button variant="ghost" onClick={handleClear} disabled={isSaving}>Reset</Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
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
