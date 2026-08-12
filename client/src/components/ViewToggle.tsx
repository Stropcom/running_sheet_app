import { LayoutGrid, List } from "lucide-react";
import { useViewMode, type ViewMode } from "@/contexts/ViewModeContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ViewToggle({
  value,
  onChange,
  folderLabel = "Folder view",
  tileLabel = "Tile view",
}: {
  value?: ViewMode;
  onChange?: (mode: ViewMode) => void;
  folderLabel?: string;
  tileLabel?: string;
} = {}) {
  const ctx = useViewMode();
  const viewMode = value ?? ctx.viewMode;
  const setViewMode = onChange ?? ctx.setViewMode;

  return (
    <div className="inline-flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5 gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setViewMode("folder")}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
              viewMode === "folder"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label={folderLabel}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{folderLabel}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setViewMode("tile")}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
              viewMode === "tile"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-label={tileLabel}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tileLabel}</TooltipContent>
      </Tooltip>
    </div>
  );
}
