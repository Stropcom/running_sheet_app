import { LayoutGrid, List } from "lucide-react";
import { useViewMode } from "@/contexts/ViewModeContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ViewToggle() {
  const { viewMode, setViewMode } = useViewMode();

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
            aria-label="Folder view"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Folder view</TooltipContent>
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
            aria-label="Tile view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Tile view</TooltipContent>
      </Tooltip>
    </div>
  );
}
