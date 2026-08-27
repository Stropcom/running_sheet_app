/**
 * Full-text pop-up for a Facial Recognition match notification — the
 * notification bell's own preview line-clamps the body, too little room
 * for the full "identified in X, from an image in Y, review Z" wording.
 *
 * Only shows when the officer explicitly clicked this notification in the
 * bell (see FaceMatchNotificationContext) — it used to show automatically
 * just from being on the sheet with an unread match notification, which
 * fired the instant the bell was opened even without clicking into it.
 * Re-clicking an already-acknowledged notification still reopens this, so
 * it's not gated on unread state.
 */
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScanFace, Check } from "lucide-react";
import { useFaceMatchNotification } from "@/contexts/FaceMatchNotificationContext";

export function FaceMatchAckDialog({ sheetId }: { sheetId: number }) {
  const { activeNotificationId, clearActiveNotification, clearIfActive } =
    useFaceMatchNotification();
  const { data: list } = trpc.notifications.list.useQuery(undefined, {
    enabled: activeNotificationId != null,
  });
  const utils = trpc.useUtils();

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const current = (list ?? []).find(
    n =>
      n.id === activeNotificationId &&
      n.sourceModule === "faceRecognition" &&
      n.url === `/sheet/${sheetId}`
  );

  // Leaving the sheet resets the trigger — a later, unrelated visit to this
  // same sheet must not silently reopen the pop-up; only a fresh click in
  // the bell should. clearIfActive (not an unconditional clear) so
  // navigating straight from this sheet to a DIFFERENT sheet that also has
  // a just-clicked notification can't wipe out the id that click just set.
  useEffect(() => {
    if (activeNotificationId == null) return;
    const id = activeNotificationId;
    return () => clearIfActive(id);
  }, [activeNotificationId, clearIfActive]);

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

        <div className="flex justify-end pt-2">
          <Button
            disabled={markRead.isPending}
            onClick={() => {
              markRead.mutate({ id: current.id });
              clearActiveNotification();
            }}
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
