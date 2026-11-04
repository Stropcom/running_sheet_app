import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Confirms and deletes one CTO Weekly Tasking: its supervisor contacts,
 * priority board, calendar and posted marker (admin only; the server limits it
 * to the caller's Command). Notifications already sent stay in people's
 * inboxes. `label` is the week as shown ("26 Oct – 01 Nov").
 */
export function DeleteWeekDialog({
  weekStart,
  label,
  onOpenChange,
  onDeleted,
}: {
  /** The week to delete; null keeps the dialog closed. */
  weekStart: string | null;
  label: string;
  onOpenChange: (open: boolean) => void;
  onDeleted: (weekStart: string) => void;
}) {
  const utils = trpc.useUtils();
  const del = trpc.opManager.deleteWeek.useMutation();

  async function confirm() {
    if (!weekStart) return;
    try {
      await del.mutateAsync({ weekStart });
      await Promise.all([
        utils.opManager.listAllWeeks.invalidate(),
        utils.opManager.getPostedWeeks.invalidate(),
        utils.opManager.isWeekPosted.invalidate(),
        utils.opManager.getPriorityBoard.invalidate(),
        utils.opManager.getTaskingCalendar.invalidate(),
        utils.opManager.getSupervisorContacts.invalidate(),
        utils.opManager.copySourceWeek.invalidate(),
      ]);
      toast.success(`Deleted the weekly tasking for ${label}.`);
      onDeleted(weekStart);
    } catch {
      toast.error("Couldn't delete the weekly tasking.");
    }
    onOpenChange(false);
  }

  return (
    <AlertDialog open={weekStart !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this weekly tasking?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the CTO Weekly Tasking for {label}: its supervisor
            contacts, priority board and calendar. It can't be undone. If it was
            posted, the notifications already sent stay in people's inboxes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={e => {
              e.preventDefault();
              void confirm();
            }}
            disabled={del.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
