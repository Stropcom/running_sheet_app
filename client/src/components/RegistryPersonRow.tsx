import { useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import { IndicesBadge } from "@/components/IndicesBadge";
import { AssociateProfileContent } from "@/components/AssociateProfileContent";

/**
 * One person under "Other Home Address Residents" or "Registered Associates".
 * Closed it's a single row; tapped it opens in place and shows the same details
 * as that person's own profile page (mounted lazily, so nothing is fetched until
 * the row is opened). Any number of rows can stay open at once.
 */
export function RegistryPersonRow({
  name,
  isIndicesOnly,
  kind,
}: {
  name: string;
  isIndicesOnly: boolean;
  kind: "resident" | "associate";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`w-full rounded-lg border bg-muted/20 transition-colors ${
        open ? "border-primary/60 bg-card" : "border-border/60"
      }`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={e => {
          // The Operation profile cards are themselves tappable.
          e.stopPropagation();
          setOpen(o => !o);
        }}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent/10 transition-colors text-left"
      >
        <Users
          className={`w-3.5 h-3.5 shrink-0 ${
            kind === "resident" ? "text-rose-500" : "text-emerald-500"
          }`}
        />
        <span className="text-xs font-medium text-foreground flex-1 min-w-0 break-words">
          {name}
        </span>
        {isIndicesOnly && <IndicesBadge />}
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180 text-primary" : ""
          }`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3" onClick={e => e.stopPropagation()}>
          <AssociateProfileContent label={name} embedded />
        </div>
      )}
    </div>
  );
}
