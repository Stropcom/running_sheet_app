import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SyncGroup } from "@shared/taskingRosterSync";

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });

/**
 * Asked after the CTO Weekly Tasking is saved (or before it is posted again)
 * when a team's start time on the tasking differs from the roster's start for
 * the people on duty that day. Yes brings their roster start times into line
 * (and sends them the usual roster-changed notice); No leaves the roster alone.
 * Closing the box counts as No. The rule is shared/taskingRosterSync.ts.
 */
export function RosterSyncDialog({
  open,
  groups,
  members,
  onYes,
  onNo,
}: {
  open: boolean;
  groups: SyncGroup[];
  members: number;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={o => !o && onNo()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update the roster too?</DialogTitle>
          <DialogDescription>
            The tasking has different start times from the roster for the people
            on duty (today and later). Update the roster to match?
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
          {groups.map(g => (
            <li
              key={`${g.date}|${g.teamName}`}
              className="rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="font-semibold">
                {g.teamName} · {dayLabel(g.date)}
              </div>
              <div className="text-muted-foreground">
                {g.members} on duty: {g.fromTimes} to{" "}
                <span className="font-semibold text-foreground">
                  {g.toTime}
                </span>
                {g.typeChanges > 0 && (
                  <> ({g.typeChanges} change between Day and Arvo)</>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Yes changes {members === 1 ? "1 person's" : `${members} people's`}{" "}
          shift start on the roster and sends each of them the in-app notice
          that their roster changed. A start at or after 12:00 becomes an Arvo
          shift.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onNo}>
            No
          </Button>
          <Button size="sm" onClick={onYes}>
            Yes, update the roster
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
