import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, PenTool, Plus, X } from "lucide-react";
import { useState } from "react";
import { SignatureManager } from "@/components/signature-manager";
import { cn } from "@/lib/utils";

export interface ToolboxSignature {
  id: string;
  name: string;
  signature_image_url: string;
  is_default: boolean;
}

interface SignatureToolboxProps {
  selectedId: string | null;
  onSelect: (sig: ToolboxSignature | null) => void;
  onClose: () => void;
}

export function SignatureToolbox({ selectedId, onSelect, onClose }: SignatureToolboxProps) {
  const [creating, setCreating] = useState(false);
  const {
    data: sigs,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["signatures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_signatures")
        .select("id, name, signature_image_url, is_default")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ToolboxSignature[];
    },
  });

  return (
    <aside className="flex h-full w-80 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <PenTool className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Signature Toolbox</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {creating ? (
        <div className="flex-1 overflow-auto p-4">
          <SignatureManager
            onSave={async () => {
              setCreating(false);
              await refetch();
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setCreating(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-auto p-4">
          <p className="text-xs text-slate-500">
            Select a signature, then click on the page to place it. Drag corners to resize.
          </p>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (sigs ?? []).length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-700">
              No signatures yet. Create one to start.
            </p>
          ) : (
            sigs!.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(selectedId === s.id ? null : s)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-2 text-left transition",
                  selectedId === s.id
                    ? "border-primary bg-primary/5"
                    : "border-slate-200 hover:border-primary/40 dark:border-slate-700",
                )}
              >
                <img
                  src={s.signature_image_url}
                  alt={s.name}
                  className="h-12 w-20 rounded bg-slate-50 object-contain dark:bg-slate-800"
                />
                <div className="flex-1 truncate">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  {s.is_default && <p className="text-[10px] uppercase text-primary">Default</p>}
                </div>
              </button>
            ))
          )}
          <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> New signature
          </Button>
        </div>
      )}
    </aside>
  );
}
