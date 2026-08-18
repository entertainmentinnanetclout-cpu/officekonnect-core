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
        .map((recipient) => ({
          email: recipient.email.trim().toLowerCase(),
          fullName: recipient.fullName.trim(),
        }))
        .filter((recipient) => /.+@.+\..+/.test(recipient.email));
      if (cleaned.length === 0) throw new Error("Add at least one recipient email");
      return createDraftFn({
        data: {
          documentId,
          title,
          message,
          signingOrder: "parallel",
          participants: cleaned.map((recipient, index) => ({
            email: recipient.email,
            fullName: recipient.fullName || null,
            userId: null,
            role: "signer" as const,
            orderIndex: index,
          })),
        },
      });
    },
    onSuccess: (result) => {
      toast.success("Signing draft created. Continue in the preparation workspace to place required fields.");
      onSent?.();
      onOpenChange(false);
      setRecipients([{ email: "", fullName: "" }]);
      setMessage("");
      window.location.assign(`/dashboard/signing/${result.request.id}/prepare`);
    },
    onError: (error) => toastError(error, "Failed to create signing draft"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create signing request</DialogTitle>
          <DialogDescription>
            Create the participant draft first. Signature and initial fields must be assigned in the
            preparation workspace before the secure request can be sent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Signers</Label>
            {recipients.map((recipient, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="Name (optional)"
                  value={recipient.fullName}
                  onChange={(event) =>
                    setRecipients((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, fullName: event.target.value } : item,
                      ),
                    )
                  }
                  className="w-40"
                />
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={recipient.email}
                  onChange={(event) =>
                    setRecipients((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, email: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setRecipients((current) => current.filter((_, itemIndex) => itemIndex !== index))
                  }
                  disabled={recipients.length === 1}
                  aria-label={`Remove signer ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRecipients((current) => [...current, { email: "", fullName: "" }])
              }
            >
              <Plus className="mr-2 h-4 w-4" /> Add signer
            </Button>
          </div>

          <div className="space-y-1">
            <Label>Message (optional)</Label>
            <Textarea
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
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
            Create & prepare
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
