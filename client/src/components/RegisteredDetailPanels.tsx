import type { ReactNode } from "react";
import { ROW_ITEM } from "@/lib/pageKit";
import { SectionHeading } from "@/components/ProfileSectionHeading";
import {
  groupDetailEntries,
  type RegisteredDetailEntry,
} from "@/lib/registeredDetails";

export {
  targetDetailEntries,
  type RegisteredDetailEntry,
} from "@/lib/registeredDetails";

/** The Registered Details rows as individual panels — a small capitalised
 * label above the value — under their own sub-headings, Addresses and
 * Vehicles. */
export function RegisteredDetailPanels({
  entries,
  after,
}: {
  entries: RegisteredDetailEntry[];
  /** Extra content under one entry's value (e.g. its change history). */
  after?: (entry: RegisteredDetailEntry) => ReactNode;
}) {
  return (
    <div className="space-y-4">
      {groupDetailEntries(entries).map(g => (
        <div key={g.kind}>
          <SectionHeading sub label={g.title} count={g.items.length} />
          <div className="space-y-2">
            {g.items.map(e => (
              <div key={e.id} className={`${ROW_ITEM} px-3 py-2`}>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                  {e.label}
                </p>
                <p className="text-sm text-foreground break-words">{e.value}</p>
                {after?.(e)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
