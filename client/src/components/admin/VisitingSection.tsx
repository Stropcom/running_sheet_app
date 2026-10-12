/**
 * "Visiting from Commands": everything about people from other Commands
 * working with this one, in one collapsed-by-default section — Share (give
 * them operations) and Members (who is visiting, and which team of this
 * Command they work in).
 */

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ShareWithSection } from "@/components/admin/ShareWithSection";
import {
  VisitingMembers,
  visitingPeople,
} from "@/components/admin/VisitingMembers";
import type { AdminUserRow } from "@/components/admin/UserAccessGroups";
import type { CommandCode } from "@shared/commands";
import type { OperationShareRow } from "@shared/operationAccess";
import type { TeamRow } from "@/lib/teams";

const OPEN_KEY = "runlog.accessVisiting.open";

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function VisitingSection({
  viewCommand,
  users,
  isAllRegions,
  shares,
  teams,
  visitorTeams,
  onOpenPerson,
  onNewTeam,
}: {
  viewCommand: CommandCode;
  users: AdminUserRow[];
  isAllRegions: boolean;
  shares: OperationShareRow[];
  teams: TeamRow[];
  visitorTeams: Array<{ userId: number; teamId: number }>;
  onOpenPerson: (id: number) => void;
  onNewTeam: (userId: number) => void;
}) {
  const [open, setOpen] = useState(readOpen);
  const toggle = () =>
    setOpen(o => {
      try {
        localStorage.setItem(OPEN_KEY, o ? "0" : "1");
      } catch {
        /* storage unavailable: the choice just won't be remembered */
      }
      return !o;
    });
  const people = visitingPeople(shares, viewCommand);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5 bg-muted/70 px-4 py-3 text-left hover:bg-muted"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 text-foreground/70 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-base font-semibold">Visiting from Commands</span>
        <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground/70">
          {people.length} {people.length === 1 ? "person" : "people"}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <ShareWithSection
            viewCommand={viewCommand}
            users={users}
            isAllRegions={isAllRegions}
          />
          <VisitingMembers
            viewCommand={viewCommand}
            people={people}
            teams={teams}
            visitorTeams={visitorTeams}
            isAllRegions={isAllRegions}
            onOpen={onOpenPerson}
            onNewTeam={onNewTeam}
          />
        </div>
      )}
    </div>
  );
}
