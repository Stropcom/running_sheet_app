// Part of the Target Registry page (client/src/pages/CtoRoster/DraftRosterPage.tsx): the grid's sizes and the locked shift codes.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

const LOCKED_CODES = ["l", "c"] as const;
export const COL_WIDTH = 68;
export const NAME_COL_WIDTH = 152;
export const ROW_HEIGHT = 48;
export const HEADER_HEIGHT = 44;
