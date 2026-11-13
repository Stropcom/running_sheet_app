// Part of the side menu (client/src/components/DashboardLayout.tsx): the props of a sortable nav item.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import React from "react";
import {} from "./SortableNavItem";

// ─── SortableNavItem ─────────────────────────────────────────────────────────
export type SortableNavItemProps = {
  id: string;
  isCollapsed: boolean;
  location: string;
  setLocation: (path: string) => void;
  todoCount: number;
  certifyCount: number;
  unlinkedImagesCount: number;
  govCount: number;
  todoExpanded: boolean;
  setTodoExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  opManagerExpanded: boolean;
  setOpManagerExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  ctoRosterSubExpanded: boolean;
  setCtoRosterSubExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  rosterToolsExpanded: boolean;
  setRosterToolsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  reportsExpanded: boolean;
  setReportsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  courtExpanded: boolean;
  setCourtExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  subItemClass: (active: boolean) => string;
  sidebarScrollRef: React.RefObject<HTMLDivElement | null>;
};
