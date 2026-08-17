import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Loader2, FileSignature } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createSigningDraft } from "@/lib/signing.functions";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";

interface Recipient {
  email: string;
  fullName: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string;
  defaultTitle: string;
  /** Legacy callback name retained until the Phase 6 signing workspace is routed. */
  onSent?: () => void;
}

export function SendDocumentDialog({
  open,
  onOpenChange,
  documentId,
  defaultTitle,
  onSent,
}: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([{ email: "", fullName: "" }]);
  const createDraftFn = useServerFn(createSigningDraft);

  const mut = useMutation({
    mutationFn: async () => {
      const cleaned = recipients
        .map((r) => ({ ...r, email: r.email.trim() }))
        .filter((r) => /.+@.+\..+/.test(r.email));
      if (cleaned.length === 0) throw new Error("Add at least one recipient email");
      return createDraftFn({
        data: {
          documentId,
          title,
          message,
          recipients: cleaned.map((r) => ({
            email: r.email,
            fullName: r.fullName || undefined,
            isGuest: true,
          })),
        },
      });
    },
    onSuccess: () => {
      toast.success("Signing draft created. Required fields must be prepared before sending.");
      onSent?.();
      onOpenChange(false);
      setRecipients([{ email: "", fullName: "" }]);
      setMessage("");
    },
    onError: (e) => toastError(e, "Failed to create signing draft"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create signing request</DialogTitle>
          <DialogDescription>
            Create the recipient draft first. Signature and initial fields must be assigned before
            the secure request can be sent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Recipients</Label>
            {recipients.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Name (optional)"
                  value={r.fullName}
                  onChange={(e) =>
                    setRecipients((arr) =>
                      arr.map((x, idx) => (idx === i ? { ...x, fullName: e.target.value } : x)),
                    )
                  }
                  className="w-40"
                />
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={r.email}
                  onChange={(e) =>
                    setRecipients((arr) =>
                      arr.map((x, idx) => (idx === i ? { ...x, email: e.target.value } : x)),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRecipients((arr) => arr.filter((_, idx) => idx !== i))}
                  disabled={recipients.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecipients((arr) => [...arr, { email: "", fullName: "" }])}
            >
              <Plus className="mr-2 h-4 w-4" /> Add recipient
            </Button>
          </div>

          <div className="space-y-1">
            <Label>Message (optional)</Label>
            <Textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please review and sign at your earliest convenience."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSignature className="mr-2 h-4 w-4" />
            )}
            Create signing draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
