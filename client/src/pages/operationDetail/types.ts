// Part of the operation page (client/src/pages/OperationDetail.tsx): the types shared by the operation page's pieces.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

export type CinEntry = {
  cin: string;
  hasImages: boolean;
  isTeamLeader?: boolean;
  isAuthor?: boolean;
};
