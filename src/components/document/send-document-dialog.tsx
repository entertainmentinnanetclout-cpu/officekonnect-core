import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { OfficeKonnectAccountPicker } from "@/components/signing/officekonnect-account-picker";
import { Button } from "@/components/ui/button";
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
import { toastError } from "@/lib/errors";
import type { OfficeKonnectDirectoryEntry } from "@/lib/signing-account.functions";
import { createSigningDraft } from "@/lib/signing.functions";

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
  const [signers, setSigners] = useState<OfficeKonnectDirectoryEntry[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const createDraftFn = useServerFn(createSigningDraft);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Enter a request title");
      if (signers.length === 0) {
        throw new Error("Choose at least one registered OfficeKonnect signer");
      }
      return createDraftFn({
        data: {
          documentId,
          title: title.trim(),
          message,
          signingOrder: "parallel",
          participants: signers.map((signer, index) => ({
            userId: signer.user_id,
            email: signer.email,
            fullName: signer.full_name,
            role: "signer" as const,
            orderIndex: index,
          })),
        },
      });
    },
    onSuccess: (result) => {
      toast.success("Signing draft created. Place the required fields before sending.");
      onSent?.();
      onOpenChange(false);
      setSigners([]);
      setMessage("");
      window.location.assign(`/dashboard/signing/${result.request.id}/prepare`);
    },
    onError: (error) => toastError(error, "Failed to create signing draft"),
  });

  const removeSigner = (userId: string) => {
    setSigners((current) => current.filter((signer) => signer.user_id !== userId));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create signing request</DialogTitle>
            <DialogDescription>
              Choose registered OfficeKonnect accounts, then continue to place signature, initial,
              text or date fields. External guest email signers are not permitted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Registered signers</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add account
                </Button>
              </div>
              <div className="rounded-lg border">
                {signers.length === 0 ? (
                  <div className="p-5 text-center text-sm text-muted-foreground">
                    Search OfficeKonnect by name, email or @username to add a signer.
                  </div>
                ) : (
                  signers.map((signer) => (
                    <div
                      key={signer.user_id}
                      className="flex items-center gap-3 border-b p-3 last:border-b-0"
                    >
                      <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
                        {signer.avatar_url ? (
                          <img
                            src={signer.avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <UserRound className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {signer.full_name?.trim() || signer.email}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {signer.username ? `@${signer.username} • ` : ""}
                          {signer.email}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${signer.full_name || signer.email}`}
                        onClick={() => removeSigner(signer.user_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                You can add your own OfficeKonnect account in Prepare if you want to sign first
                before sending to the remaining recipients.
              </p>
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
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSignature className="mr-2 h-4 w-4" />
              )}
              Create & prepare
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OfficeKonnectAccountPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludeUserIds={signers.map((signer) => signer.user_id)}
        title="Add a registered signer"
        onSelect={(entry) =>
          setSigners((current) =>
            current.some((signer) => signer.user_id === entry.user_id)
              ? current
              : [...current, entry],
          )
        }
      />
    </>
  );
}
