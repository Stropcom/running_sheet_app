// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen's layout used to be
// one 2,800-line return; each section is now a component that takes the screen's state as `s`
// (see useSheetScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, X, Search, ArrowUpDown, Undo2 } from "lucide-react";
import type { SheetScreen } from "./useSheetScreen";

/** Add Row, sort, search and Undo. */
export function RowsToolbar({ s }: { s: SheetScreen }) {
  const {
    sheetId,
    canEdit,
    addRow,
    sortReversed,
    toggleSortReversed,
    undoStack,
    handleUndo,
    searchQuery,
    setSearchQuery,
  } = s;
  return (
    <>
      {/* Search bar + sort toggle + add row — stays at the top of the
            screen while the rows scroll underneath (the page's one scroll
            container is <main>, see DashboardLayout). A solid ground and a
            thin line under it keep the rows from showing through. */}
      <div
        data-testid="sheet-toolbar"
        className="sticky top-0 z-30 -mx-1 mb-3 flex items-center gap-2 border-b border-border bg-background px-1 py-2"
      >
        {/* Add Row — moved here, left of sort toggle, hidden when sheet is closed or read-only */}
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="gap-2 shrink-0"
            onClick={() => addRow.mutate({ sheetId })}
            disabled={addRow.isPending}
          >
            <Plus className="w-4 h-4" />
            Add<span className="hidden sm:inline"> Row</span>
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={`shrink-0 ${sortReversed ? "border-primary text-primary" : ""}`}
              onClick={toggleSortReversed}
            >
              <ArrowUpDown className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {sortReversed
              ? "Showing newest first — click to show oldest first"
              : "Showing oldest first — click to show newest first"}
          </TooltipContent>
        </Tooltip>
        {/* Undo last edit — laptop/iPad only, hidden on mobile */}
        {canEdit && undoStack.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 hidden sm:inline-flex"
                onClick={handleUndo}
              >
                <Undo2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo last edit</TooltipContent>
          </Tooltip>
        )}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by time, observation, or CIN…"
            className="w-full pl-9 pr-4 py-2 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
