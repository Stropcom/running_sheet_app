import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BlendTeam } from "@shared/taskingBlend";
import { blendGradients } from "@shared/teamColours";

/**
 * Asked in the weekly tasking's edit page when Surveillance Team 1 and Team 2
 * are given the same working shift on a day: blend them into one combined
 * team for that day? Yes merges the two cells into one combined cell, No keeps
 * them apart (and is not asked again for that shift). When the two teams'
 * tasks differ, the supervisor picks whose tasks the combined team carries.
 * Closing the box counts as No.
 */
export function BlendTeamsDialog({
  open,
  colours,
  dayLabel,
  shift,
  tasks,
  onYes,
  onNo,
}: {
  open: boolean;
  /** Team 1's and Team 2's colours (from User Management → Teams). */
  colours: [string, string];
  /** "Thu 05 Nov" */
  dayLabel: string;
  shift: string;
  /** What each team is tasked with, to show; `differ` when they are not the same. */
  tasks: { surv1: string; surv2: string; differ: boolean };
  onYes: (keep: BlendTeam) => void;
  onNo: () => void;
}) {
  const look = blendGradients(colours[0], colours[1]);
  const [keep, setKeep] = useState<BlendTeam>("surv1");
  useEffect(() => {
    if (open) setKeep("surv1");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={o => !o && onNo()}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader
          className="px-4 py-3 border-b"
          style={{ background: look.band }}
        >
          <DialogTitle className="flex items-center gap-2 text-base text-blue-950">
            <span
              aria-hidden
              className="inline-block h-4 w-6 rounded-[3px]"
              style={{ background: look.swatch }}
            />
            Blend Team 1 and Team 2 on {dayLabel}?
          </DialogTitle>
          <DialogDescription className="text-blue-950/80">
            Both teams are on <b>{shift}</b> that day. A blended day shows as
            one combined team across the calendar.
          </DialogDescription>
        </DialogHeader>
        <div className="px-4 pb-1 space-y-2 text-sm">
          {tasks.differ ? (
            <>
              <p>
                The teams have different tasks. Which should the combined team
                carry?
              </p>
              {(
                [
                  ["surv1", "Team 1's tasks", tasks.surv1],
                  ["surv2", "Team 2's tasks", tasks.surv2],
                ] as const
              ).map(([id, label, text]) => (
                <label
                  key={id}
                  className="flex items-start gap-3 rounded-md border bg-white px-3 py-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="blend-keep"
                    className="mt-1"
                    checked={keep === id}
                    onChange={() => setKeep(id)}
                  />
                  <span>
                    <b>{label}</b>
                    <span className="block text-muted-foreground">{text}</span>
                  </span>
                </label>
              ))}
            </>
          ) : (
            <p>
              Both teams are tasked with <b>{tasks.surv1}</b>.
            </p>
          )}
        </div>
        <DialogFooter className="grid grid-cols-2 gap-2 px-4 pb-4 sm:flex-none">
          <Button variant="outline" onClick={onNo}>
            No, keep separate
          </Button>
          <Button onClick={() => onYes(keep)}>Yes, blend</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
