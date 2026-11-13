// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): the page header.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { formatWeekLabel } from "./weekDates";

// ─── PageHeader ───────────────────────────────────────────────────────────────
export function PageHeader({
  weekStart,
  onPrev,
  onNext,
  onBack,
  prevDisabled,
  nextDisabled,
  rightSlot,
}: {
  weekStart: string;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex-1 flex items-center justify-center gap-1 min-w-0 basis-full sm:basis-auto">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrev}
          disabled={prevDisabled}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="text-sm font-semibold truncate px-1">
          {formatWeekLabel(weekStart)}
        </p>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNext}
          disabled={nextDisabled}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {rightSlot && (
        <div className="shrink-0 basis-full sm:basis-auto flex items-center justify-center sm:justify-end">
          {rightSlot}
        </div>
      )}
    </div>
  );
}
