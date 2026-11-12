// Team-member helpers used by the CIN cells and the PDF export.

export const SPACER = "__SPACE__";

// True when a row's real (non-spacer) members are exactly the full daily
// roster — same CINs, no more, no fewer, duplicates collapsed by set
// equality. Used to collapse a fully-certified row's member list down to a
// single "TEAM" pill in CinCertifyCell — never for a row that merely
// happens to have every member certified, only one that IS the whole team.
export function isFullTeamMembers(
  members: { memberName: string }[],
  rosterCins: string[] | undefined
): boolean {
  if (!rosterCins || rosterCins.length === 0) return false;
  const realSet = new Set(
    members
      .map(m => m.memberName)
      .filter(n => n !== SPACER)
      .map(n => n.toUpperCase())
  );
  const rosterSet = new Set(rosterCins.map(c => c.toUpperCase()));
  if (realSet.size !== rosterSet.size) return false;
  return Array.from(rosterSet).every(cin => realSet.has(cin));
}
