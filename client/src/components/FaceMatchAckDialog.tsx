/**
 * Full-text pop-up for a Facial Recognition match notification when the
 * officer lands on the running sheet it concerns — the notification bell's
 * own preview line-clamps the body, which was too little room for the full
 * "identified in X, from an image in Y, review Z" wording. Requires an
 * explicit Acknowledge tap (which just marks the underlying notification
 * read) rather than being dismissible, so it reliably reappears on the next
 * visit until someone actually reads it.
 */
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScanFace, Check } from "lucide-react";

export function FaceMatchAckDialog({ sheetId }: { sheetId: number }) {
  const { data: list } = trpc.notifications.list.useQuery();
  const utils = trpc.useUtils();

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const pending = (list ?? []).filter(
    n =>
      n.sourceModule === "faceRecognition" &&
      !n.readAt &&
      n.url === `/sheet/${sheetId}`
  );
  const current = pending[0];
  if (!current) return null;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md"
        showCloseButton={false}
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanFace className="h-5 w-5 text-primary" />
            {current.title}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-foreground whitespace-pre-wrap">
          {current.body}
        </p>

        {pending.length > 1 && (
          <p className="text-xs text-muted-foreground">
            {pending.length} Facial Recognition notifications pending review on
            this sheet.
          </p>
        )}

        <div className="flex justify-end pt-2">
          <Button
            disabled={markRead.isPending}
            onClick={() => markRead.mutate({ id: current.id })}
            className="gap-1.5"
          >
            <Check className="h-4 w-4" />
            Acknowledge
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
