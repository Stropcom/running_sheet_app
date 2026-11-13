// Part of the Target Registry page (client/src/pages/CtoRoster/DraftRosterPage.tsx): the draft roster's shift, member and team types.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

// ── Types ────────────────────────────────────────────────────────────────────
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
};
export type Team = { id: number; name: string; sortOrder: number };
export type ShiftData = {
  memberId: number;
  shiftDate: string;
  shiftCode: string;
  shiftTime?: string | null;
  comment?: string | null;
  isActing?: boolean;
};
