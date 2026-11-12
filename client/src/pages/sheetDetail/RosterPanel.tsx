// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen's layout used to be
// one 2,800-line return; each section is now a component that takes the screen's state as `s`
// (see useSheetScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { ShieldCheck, Pencil, Camera, Users } from "lucide-react";
import { ChevronDown } from "lucide-react";
import type { SheetScreen } from "./useSheetScreen";

/** the daily roster (team) panel with Certify All. */
export function RosterPanel({ s }: { s: SheetScreen }) {
  const {
    sheet,
    sheetId,
    parsedRoster,
    teamPanelExpanded,
    setTeamPanelExpanded,
    cinFullyCertified,
    openEditRoster,
    canCertify,
    certifyAllForCin,
    autoImageCins,
  } = s;
  return (
    <>
      {/* Daily Roster Panel with Certify All — collapsible, matching target panel style */}
      {(parsedRoster.length > 0 || true) && (
        <div className="mb-4 rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          {/* Header row — same structure as target panel: collapse button + separate pencil button */}
          <div className="flex items-center">
            <button
              className="flex-1 flex items-center gap-2 px-4 py-3 bg-muted/60 hover:bg-muted active:bg-muted transition-colors select-none text-left min-w-0"
              onClick={() => {
                const next = !teamPanelExpanded;
                setTeamPanelExpanded(next);
                try {
                  localStorage.setItem(
                    "runsheet_team_panel_expanded",
                    String(next)
                  );
                } catch {}
              }}
            >
              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-[13px] font-bold uppercase tracking-wide text-foreground truncate flex-1">
                TEAM — CERTIFY
              </span>
              {/* Certified count badge */}
              {parsedRoster.length > 0 && (
                <span className="text-xs font-mono text-muted-foreground mr-1">
                  {cinFullyCertified.size}/{parsedRoster.length}
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${teamPanelExpanded ? "" : "-rotate-90"}`}
              />
            </button>
            {/* Edit pencil — independent tap zone, doesn't trigger collapse */}
            {sheet && (
              <button
                className="px-3 py-3 text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 border-l border-border bg-muted/60 hover:bg-muted rounded-tr-lg"
                onClick={openEditRoster}
                title="Edit TEAM"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {/* Collapsible CIN badges */}
          {teamPanelExpanded && (
            <div className="px-4 py-3">
              {parsedRoster.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {parsedRoster.map(entry => (
                    <button
                      key={entry.cin}
                      onClick={() =>
                        canCertify
                          ? certifyAllForCin.mutate({
                              sheetId,
                              cin: entry.cin,
                            })
                          : undefined
                      }
                      disabled={certifyAllForCin.isPending || !canCertify}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono font-medium transition-colors disabled:opacity-50 ${
                        cinFullyCertified.has(entry.cin)
                          ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
                          : canCertify
                            ? "border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 text-foreground"
                            : "border-border bg-muted/40 text-foreground cursor-default"
                      }`}
                      title={`${canCertify ? "Certify all rows for " : ""}CIN ${entry.cin}${entry.isTeamLeader ? " (Team Leader)" : ""}${entry.isAuthor ? " (Author)" : ""}`}
                    >
                      <ShieldCheck
                        className={`w-3 h-3 ${cinFullyCertified.has(entry.cin) ? "text-emerald-500" : "text-primary"}`}
                      />
                      {entry.isTeamLeader && (
                        <span className="text-yellow-400" title="Team Leader">
                          ★
                        </span>
                      )}
                      {entry.isAuthor && (
                        <span
                          className="text-sky-400"
                          title="Running Sheet Author"
                        >
                          ✏️
                        </span>
                      )}
                      {entry.cin}
                      {(entry.hasImages || autoImageCins.has(entry.cin)) && (
                        <Camera className="w-3 h-3 text-amber-400" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No team members added — tap the pencil to add CINs.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
