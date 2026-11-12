// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): the coverage warning badge.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { AlertTriangle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ─── Coverage warning badge ───────────────────────────────────────────────────
// Click (or hover, on desktop) to see why a tasked cell is flagged — which
// team/day, what it's tasked for, and the actual vs minimum headcount.
export function CoverageWarningBadge({
  teamName,
  day,
  onDuty,
  min,
  primaryTask,
}: {
  teamName: string;
  day: string;
  onDuty: number;
  min: number;
  primaryTask?: string | null;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 font-mono text-[11.5px] font-bold text-red-600 hover:text-red-700 hover:underline underline-offset-2"
          title={`${onDuty} of ${min} rostered on duty. Tap for details`}
        >
          <AlertTriangle className="h-3 w-3" />
          {onDuty}/{min}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 text-xs space-y-1.5 p-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 font-semibold text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          Tasking issue
        </div>
        <p className="text-foreground leading-snug">
          {teamName} is tasked{primaryTask ? ` for "${primaryTask}"` : ""} on{" "}
          {day}, but only {onDuty} of the {min} minimum required{" "}
          {onDuty === 1 ? "is" : "are"} rostered on duty that day.
        </p>
      </PopoverContent>
    </Popover>
  );
}
