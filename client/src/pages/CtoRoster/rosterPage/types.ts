// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): the types the roster's pieces share.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

export type ShiftCode =
  | ""
  | "d"
  | "a"
  | "r"
  | "o"
  | "l"
  | "c"
  | "tt"
  | "dep"
  | "doc"
  | "adoc"
  | "ad"
  | "aoc";
export type Member = {
  id: number;
  name: string;
  teamId: number;
  sortOrder: number;
  excludedFromCounts: boolean;
};
export type Team = { id: number; name: string; sortOrder: number };
export type ShiftData = {
  memberId: number;
  shiftDate: string;
  shiftCode: string;
  shiftTime?: string | null;
  comment?: string | null;
  isActing?: boolean;
  shiftDurationHours?: number | null;
};
export type Secondment = {
  id: number;
  memberId: number;
  destinationTeamId: number;
  destinationTeamName: string;
  startDate: string;
  endDate: string;
};

export interface EbaFinding {
  ruleKey: string;
  ruleTitle: string;
  eaReference: string | null;
  memberId: number;
  memberName: string;
  dates: string[];
  detail: string;
  severity: "warning" | "error";
}
