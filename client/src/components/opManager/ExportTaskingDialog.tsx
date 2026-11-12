import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MAX_EXPORT_VIEWS, toggleExportView } from "@shared/taskingView";
import {
  TASKING_VIEWS,
  readTaskingView,
  type TaskingViewId,
} from "@/lib/taskingViewPref";

/**
 * Export PDF for the CTO Weekly Tasking: pick which calendar layout, or two
 * layouts (for example Team Rows and Timeline), go in the PDF. It starts
 * with the layout on screen ticked; once two are ticked the others are
 * greyed out until one is unticked, and Export needs at least one.
 */
export function ExportTaskingDialog({
  open,
  onOpenChange,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (views: TaskingViewId[]) => void;
}) {
  const [chosen, setChosen] = useState<TaskingViewId[]>([]);
  useEffect(() => {
    if (open) setChosen([readTaskingView()]);
  }, [open]);
  const full = chosen.length >= MAX_EXPORT_VIEWS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Export PDF</DialogTitle>
          <DialogDescription>
            Choose the calendar layout for the PDF, or two layouts. The contacts
            and priority board are always included.
          </DialogDescription>
        </DialogHeader>
        <div
          role="group"
          aria-label="Calendar layouts to export"
          className="grid gap-2"
        >
          {TASKING_VIEWS.map(v => {
            const on = chosen.includes(v.id);
            const disabled = full && !on;
            return (
              <label
                key={v.id}
                className={`flex items-center gap-3 rounded-md border bg-white px-3 py-2 text-sm font-medium ${
                  disabled ? "opacity-50" : "cursor-pointer"
                }`}
              >
                <Checkbox
                  checked={on}
                  disabled={disabled}
                  onCheckedChange={() =>
                    setChosen(c => toggleExportView(c, v.id))
                  }
                  aria-label={v.label}
                />
                <span className="flex-1">{v.label}</span>
                {on && chosen.length > 1 && (
                  <span className="text-xs text-foreground/70">
                    page {chosen.indexOf(v.id) + 1}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-foreground/70">
          {chosen.length === 0
            ? "Tick at least one layout."
            : full
              ? "Two layouts chosen (the most a PDF can hold). Untick one to change it."
              : "You can tick one more layout."}
        </p>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={chosen.length === 0}
            onClick={() => {
              onExport(chosen);
              onOpenChange(false);
            }}
            className="gap-1"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
