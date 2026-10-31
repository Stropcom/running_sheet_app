import { useLayoutEffect } from "react";
import { CircleStop } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

/**
 * "Cease" — as a chip at the end of the target / shortcuts chips (the same look
 * as every other chip), or, when the sheet has no chip row showing, as a button
 * in the toolbar beside Add Row. One tap adds the
 * "Surveillance ceased in the vicinity of [place]" row with the current time
 * and every CIN that has not already ceased (rules in shared/ceaseRow.ts, row
 * written by the server's row.cease). The place is where the sheet last logged
 * the target, only when he is at a place; otherwise the row is left open for the
 * officer to finish. Undo is in the toast, like the other one-tap rows.
 */
export function CeaseRowButton({
  sheetId,
  getPlace,
  onChanged,
  onOpenForTyping,
  variant = "button",
  onPresence,
}: {
  sheetId: number;
  /** "chip": a quick-insert chip, styled like ShortcutChip. */
  variant?: "button" | "chip";
  /** Told when this is on screen, so the sheet shows only one of the two. */
  onPresence?: (shown: boolean) => void;
  /** Where the target was last logged (shared/ceaseRow.ts `ceasePlaceOf`). */
  getPlace: () => string | null;
  /** The rows changed — reload them. */
  onChanged: () => void;
  /** Open this new row's observation for typing, caret at the end. */
  onOpenForTyping: (rowId: number) => void;
}) {
  const cease = trpc.row.cease.useMutation({
    onError: e => toast.error(e.message),
  });
  const remove = trpc.row.delete.useMutation({
    onSuccess: onChanged,
    onError: e => toast.error(e.message),
  });
  // Before paint, so the toolbar button never shows for a frame beside the chip.
  useLayoutEffect(() => {
    onPresence?.(true);
    return () => onPresence?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const press = () =>
    cease.mutate(
      { sheetId, place: getPlace() },
      {
        onSuccess: res => {
          onChanged();
          if (!res.complete) onOpenForTyping(res.id);
          toast.success(
            res.complete
              ? "Surveillance ceased added"
              : "Surveillance ceased added — finish the address",
            {
              duration: 9000,
              action: {
                label: "Undo",
                onClick: () => remove.mutate({ id: res.id }),
              },
            }
          );
        },
      }
    );
  const title = "Add the Surveillance ceased row, with everyone still on";
  if (variant === "chip")
    return (
      <button
        onMouseDown={e => e.preventDefault()}
        onClick={press}
        disabled={cease.isPending}
        title={title}
        data-testid="cease-row"
        className="flex items-center gap-1 px-2 py-0.5 rounded border border-primary/30 bg-primary/8 hover:bg-primary/15 active:scale-95 transition-all select-none cursor-pointer disabled:opacity-50"
      >
        <span className="text-xs font-bold text-primary uppercase tracking-wide">
          Cease
        </span>
      </button>
    );
  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-2 shrink-0"
      data-testid="cease-row"
      title={title}
      disabled={cease.isPending}
      onClick={press}
    >
      <CircleStop className="w-4 h-4" />
      Cease
    </Button>
  );
}
