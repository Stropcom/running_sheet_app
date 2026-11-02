import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const SHEET_CHIP =
  "flex items-center gap-1 px-2 py-0.5 rounded border border-primary/30 bg-primary/8 hover:bg-primary/15 active:scale-95 transition-all select-none cursor-pointer disabled:opacity-50";

/**
 * "Cease" — a chip at the end of the target chips (the same look as every other
 * chip), on the running sheet and in RS Quick Entry on the Map. One tap adds the
 * "Surveillance ceased in the vicinity of [place]" row with the current time and
 * every CIN that has not already ceased (rules in shared/ceaseRow.ts, row
 * written by the server's row.cease). The place is where the sheet last logged
 * the target, only when he is at a place; otherwise the row is left open for the
 * officer to finish. Undo is in the toast, like the other one-tap rows.
 */
export function CeaseRowButton({
  sheetId,
  getPlace,
  onChanged,
  onOpenForTyping,
  chipClassName,
}: {
  sheetId: number;
  /** Where the target was last logged (shared/ceaseRow.ts `ceasePlaceOf`). */
  getPlace: () => string | null;
  /** The rows changed — reload them. */
  onChanged: () => void;
  /** Open this new row's observation for typing, caret at the end. */
  onOpenForTyping: (rowId: number) => void;
  /** The look of the neighbouring chips, where they differ from the sheet's
   * (RS Quick Entry's are blue and smaller). */
  chipClassName?: string;
}) {
  const cease = trpc.row.cease.useMutation({
    onError: e => toast.error(e.message),
  });
  const remove = trpc.row.delete.useMutation({
    onSuccess: onChanged,
    onError: e => toast.error(e.message),
  });
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
  return (
    <button
      onMouseDown={e => e.preventDefault()}
      onClick={press}
      disabled={cease.isPending}
      title="Add the Surveillance ceased row, with everyone still on"
      data-testid="cease-row"
      className={chipClassName ?? SHEET_CHIP}
    >
      <span
        className={
          chipClassName
            ? "uppercase"
            : "text-xs font-bold text-primary uppercase tracking-wide"
        }
      >
        Cease
      </span>
    </button>
  );
}
