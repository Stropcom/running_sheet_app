// Part of the Op Manager page (client/src/pages/OperationManagerPage.tsx): the full-view panels: on call, contacts and priorities.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { Badge } from "@/components/ui/badge";
import type { PriorityRow, ContactEntry, OnCallEntry } from "./types";

// ─── Full View sub-components ─────────────────────────────────────────────────
// Combined On-Call + Supervisor Contacts card (compact)
export function FullViewOnCall({
  onCallEntries,
  contacts,
  users,
}: {
  onCallEntries: OnCallEntry[];
  contacts: ContactEntry[];
  users: {
    id: number;
    name: string;
    cin: string | null;
    phone?: string | null;
  }[];
}) {
  const renderContact = (role: string) => {
    const c = contacts.find(x => x.role === role);
    const user = users.find(u => u.id === c?.userId);
    const name = user?.name ?? "—";
    const phone = c?.phone ?? user?.phone ?? null;
    return (
      <div key={role} className="py-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
            {role}
          </span>
          <span className="text-xs font-semibold text-foreground">{name}</span>
          {phone && (
            <span className="text-xs text-muted-foreground whitespace-nowrap ml-1">
              {phone}
            </span>
          )}
        </div>
      </div>
    );
  };

  // Always shown, even with nothing saved for the week — the full view is the
  // whole page (supervisors & contacts, priority board and calendar), and an
  // empty section says so rather than disappearing.
  const hasOnCall = onCallEntries.length > 0;

  return (
    <section>
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div
          className="px-4 py-2.5 border-b border-border"
          style={{
            background: "linear-gradient(90deg,#1e3a8a 0%,#1d4ed8 100%)",
          }}
        >
          <h2 className="text-xs font-bold tracking-widest uppercase text-white">
            Supervisors &amp; Contacts
          </h2>
        </div>
        <div className="px-4 py-2 grid grid-cols-1 sm:grid-cols-3 gap-x-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
          {/* Left: On-Call */}
          <div className="py-2 sm:py-0 sm:pr-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
              On-Call
            </p>
            {hasOnCall ? (
              onCallEntries.map((oc, i) => {
                const user = users.find(u => u.id === oc.userId);
                const name = user?.name ?? "—";
                const mobile = oc.mobile ?? user?.phone ?? null;
                return (
                  <div key={i} className="py-0.5">
                    <span className="text-xs font-semibold text-foreground">
                      {name}
                    </span>
                    {mobile && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {mobile}
                      </span>
                    )}
                    {oc.isOnCall && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 ml-2"
                      >
                        On-Call
                      </Badge>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground">Not set</p>
            )}
          </div>
          {/* Middle: CTO Inspector + PTT */}
          <div className="py-2 sm:py-0 sm:px-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
              Supervisors
            </p>
            <div className="divide-y divide-border/50">
              {["CTO Inspector", "PTT"].map(renderContact)}
            </div>
          </div>
          {/* Right: Team 1 + Team 2 */}
          <div className="py-2 sm:py-0 sm:pl-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
              &nbsp;
            </p>
            <div className="divide-y divide-border/50">
              {["Team 1", "Team 2"].map(renderContact)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Keep FullViewContacts as a no-op (merged into FullViewOnCall)
function FullViewContacts(_props: {
  contacts: ContactEntry[];
  users: { id: number; name: string; cin: string | null }[];
}) {
  return null;
}

export function FullViewPriority({
  priorityRows,
}: {
  priorityRows: PriorityRow[];
}) {
  return (
    <section>
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold tracking-wide">
            Priority Board
          </h2>
        </div>
        {priorityRows.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No priorities set for this week.
          </p>
        )}
        {/* Mobile: stacked cards */}
        <div className="block sm:hidden p-3 space-y-2">
          {priorityRows.map((row, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-background p-3 space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-muted-foreground w-5">
                  {i + 1}.
                </span>
                <span className="text-xs font-semibold text-foreground">
                  {row.operationName ?? "—"}
                </span>
                {row.category && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 ml-auto"
                  >
                    {row.category}
                  </Badge>
                )}
              </div>
              <div className="flex gap-3 pl-5">
                {row.team && (
                  <span className="text-[11px] text-muted-foreground">
                    {row.team}
                  </span>
                )}
                {row.requestType && (
                  <span className="text-[11px] text-muted-foreground">
                    {row.requestType}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Desktop: table */}
        <div
          className={`hidden overflow-x-auto ${priorityRows.length === 0 ? "" : "sm:block"}`}
        >
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold border-b border-r border-border w-10 text-foreground">
                  #
                </th>
                <th className="text-left px-3 py-2.5 font-semibold border-b border-r border-border w-24 text-foreground">
                  Category
                </th>
                <th className="text-left px-3 py-2.5 font-semibold border-b border-r border-border text-foreground">
                  Operation
                </th>
                <th className="text-left px-3 py-2.5 font-semibold border-b border-r border-border w-28 text-foreground">
                  Team
                </th>
                <th className="text-left px-3 py-2.5 font-semibold border-b border-border text-foreground">
                  Request Type
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {priorityRows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 text-muted-foreground font-medium border-r border-border">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2.5 border-r border-border">
                    {row.category && (
                      <Badge
                        variant="outline"
                        className="text-[11px] px-2 py-0.5 font-medium"
                      >
                        {row.category}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-foreground border-r border-border">
                    {row.operationName ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-foreground border-r border-border">
                    {row.team ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-foreground">
                    {row.requestType ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
