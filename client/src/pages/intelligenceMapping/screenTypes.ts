// Types that were declared inside the IntelligenceMapping function and are shared by its step hooks.

// Save-time prompts (missing location / vague vehicle match) — same
// checks as the full running-sheet table's updateRowWithDupeCheck in
// SheetDetail.tsx, ported here since RS Quick Entry from the map is a
// second, independent way to add a row and was bypassing them entirely.
export type QeDupe =
  | { kind: "missingLocation"; location: string; source: string }
  | {
      kind: "vagueVehicle";
      loserLabel: string;
      winnerLabel: string;
      reason: string;
    };
