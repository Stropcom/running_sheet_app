import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * A shortcut chip marked "Own row" on the Shortcuts page (TP, TEXT …): one tap
 * adds a new row with the current time that starts with the target's SURNAME
 * and then the shortcut's text (the rule is shared/shortcutRow.ts, the row is
 * written by the server's row.addShortcutRow). Undo is in the toast, like the
 * other one-tap rows.
 *
 * When the sheet has no person target there is no name to put first, so
 * nothing is created and `fallback` runs — the screen inserts the text like any
 * other chip.
 */
export function useOwnRowShortcut(onChanged: (sheetId: number) => void) {
  const add = trpc.row.addShortcutRow.useMutation({
    onError: e => toast.error(e.message),
  });
  const remove = trpc.row.delete.useMutation({
    onError: e => toast.error(e.message),
  });
  const press = (
    args: { sheetId: number; shortcutId: number; label: string },
    fallback: () => void
  ) =>
    add.mutate(
      { sheetId: args.sheetId, shortcutId: args.shortcutId },
      {
        onSuccess: res => {
          if (!res.created) {
            fallback();
            return;
          }
          onChanged(args.sheetId);
          toast.success(`${args.label} row added`, {
            duration: 9000,
            action: {
              label: "Undo",
              onClick: () =>
                remove.mutate(
                  { id: res.id },
                  { onSuccess: () => onChanged(args.sheetId) }
                ),
            },
          });
        },
      }
    );
  return { press, isPending: add.isPending };
}
