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

const onDuty = (g: SyncGroup) =>
  g.members - g.fromRest - g.fromOnCall - g.backToRest - g.backToOnCall;

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
            The tasking and the roster do not agree for these days (today and
            later): a different start time, a team working on a day the roster
            has it off, or a team that no longer has a shift. Update the roster
            to match?
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
              <div className="space-y-0.5 text-muted-foreground">
                {g.fromRest > 0 && (
                  <div>
                    {g.fromRest} on a rest day to{" "}
                    <span className="font-semibold text-foreground">
                      {g.toTime}
                    </span>
                  </div>
                )}
                {g.fromOnCall > 0 && (
                  <div>
                    {g.fromOnCall} on Rest on-call to{" "}
                    <span className="font-semibold text-foreground">
                      {g.toTime}
                    </span>{" "}
                    (on-call shift, so they stay on call)
                  </div>
                )}
                {g.backToRest > 0 && (
                  <div>
                    {g.backToRest} back to a rest day (the team has no shift
                    now)
                  </div>
                )}
                {g.backToOnCall > 0 && (
                  <div>
                    {g.backToOnCall} back to Rest on-call (the team has no shift
                    now)
                  </div>
                )}
                {onDuty(g) > 0 && (
                  <div>
                    {onDuty(g)} on duty: {g.fromTimes} to{" "}
                    <span className="font-semibold text-foreground">
                      {g.toTime}
                    </span>
                    {g.typeChanges > 0 && (
                      <> ({g.typeChanges} change between Day and Arvo)</>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Yes changes {members === 1 ? "1 person's" : `${members} people's`}{" "}
          shift start on the roster and sends each of them the in-app notice
          that their roster changed. A start at or after 12:00 becomes an Arvo
          shift, a rest day becomes a Day (or Arvo, or Admin) shift, and On Call
          becomes the on-call version of it.
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
