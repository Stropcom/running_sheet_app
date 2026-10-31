import { CircleStop } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

/**
 * "Cease" in the running sheet's toolbar, beside Add Row: one tap adds the
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
}: {
  sheetId: number;
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
  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-2 shrink-0"
      data-testid="cease-row"
      title="Add the Surveillance ceased row, with everyone still on"
      disabled={cease.isPending}
      onClick={() =>
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
        )
      }
    >
      <CircleStop className="w-4 h-4" />
      Cease
    </Button>
  );
}
