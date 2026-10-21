/**
 * "Visiting from Commands": everything about people from other Commands
 * working with this one, in one collapsed-by-default section — Share (give
 * them operations) and Members (who is visiting, and which team of this
 * Command they work in).
 */

import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import { ShareWithSection } from "@/components/admin/ShareWithSection";
import {
  VisitingMembers,
  visitingPeople,
} from "@/components/admin/VisitingMembers";
import type { AdminUserRow } from "@/components/admin/UserAccessGroups";
import type { CommandCode } from "@shared/commands";
import type { OperationShareRow } from "@shared/operationAccess";
import type { TeamRow } from "@/lib/teams";

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
  const people = visitingPeople(shares, viewCommand);

  return (
    <CollapsibleSection
      id="visiting"
      title="Visiting from Commands"
      count={`${people.length} ${people.length === 1 ? "person" : "people"}`}
    >
      <div className="space-y-3">
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
    </CollapsibleSection>
  );
}
