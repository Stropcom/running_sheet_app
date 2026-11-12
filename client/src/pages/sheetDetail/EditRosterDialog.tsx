// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen's layout used to be
// one 2,800-line return; each section is now a component that takes the screen's state as `s`
// (see useSheetScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { Button } from "@/components/ui/button";
import CinInput from "@/components/CinInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, Camera, X } from "lucide-react";
import type { SheetScreen } from "./useSheetScreen";

/** the Edit Roster dialog. */
export function EditRosterDialog({ s }: { s: SheetScreen }) {
  const {
    sheetId,
    autoImageCins,
    updateSheet,
    editRosterOpen,
    setEditRosterOpen,
    rosterInput,
    setRosterInput,
    setRosterInputValid,
    handleAddRosterCin,
    rosterInputValid,
    allUsers,
    myTeams,
    handleAddRosterTeam,
    rosterList,
    setRosterList,
  } = s;
  return (
    <>
      {/* Edit Roster Dialog */}
      <Dialog open={editRosterOpen} onOpenChange={setEditRosterOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit TEAM</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <p className="text-xs text-muted-foreground">
              Add or remove CINs from today’s team. Mark the Team Leader and
              Running Sheet Author. The camera is added automatically for anyone
              on a row with a photo or video, or tick it if images were taken by
              that member.
            </p>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <CinInput
                  value={rosterInput}
                  onChange={setRosterInput}
                  onValidCin={cin => {
                    setRosterInput(cin);
                    setRosterInputValid(true);
                  }}
                  onInvalidCin={() => setRosterInputValid(false)}
                  placeholder="Enter CIN and press Add"
                  showValidation
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRosterCin}
                disabled={!rosterInputValid}
                className="gap-1.5 shrink-0 mt-0.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
            {allUsers &&
              myTeams.length > 0 &&
              allUsers.some(u => u.teamId != null) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    Add team:
                  </span>
                  {myTeams.map(t => (
                    <Button
                      key={t.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs font-semibold"
                      onClick={() => handleAddRosterTeam(t.id)}
                    >
                      {t.name.toUpperCase()}
                    </Button>
                  ))}
                </div>
              )}
            {rosterList.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_40px_40px_40px_32px] px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground">
                  <span className="flex items-center">CIN</span>
                  <span
                    className="flex items-center justify-center"
                    title="Team Leader"
                  >
                    <span className="text-yellow-400 text-sm">★</span>
                  </span>
                  <span
                    className="flex items-center justify-center"
                    title="Running Sheet Author"
                  >
                    <span className="text-sky-400 text-sm">✏</span>
                  </span>
                  <span
                    className="flex items-center justify-center"
                    title="Images taken"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </span>
                  <span></span>
                </div>
                {rosterList.map(entry => (
                  <div
                    key={entry.cin}
                    className="grid grid-cols-[1fr_40px_40px_40px_32px] px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <span className="flex items-center text-sm font-mono font-medium text-foreground">
                      {entry.cin}
                    </span>
                    {/* Team Leader — radio: selecting one clears all others */}
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={!!entry.isTeamLeader}
                        onCheckedChange={() =>
                          setRosterList(prev =>
                            prev.map(c => ({
                              ...c,
                              isTeamLeader:
                                c.cin === entry.cin
                                  ? !entry.isTeamLeader
                                  : false,
                            }))
                          )
                        }
                        className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                      />
                    </div>
                    {/* Author — radio: selecting one clears all others */}
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={!!entry.isAuthor}
                        onCheckedChange={() =>
                          setRosterList(prev =>
                            prev.map(c => ({
                              ...c,
                              isAuthor:
                                c.cin === entry.cin ? !entry.isAuthor : false,
                            }))
                          )
                        }
                        className="data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
                      />
                    </div>
                    {/* Images */}
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={
                          entry.hasImages || autoImageCins.has(entry.cin)
                        }
                        disabled={autoImageCins.has(entry.cin)}
                        title={
                          autoImageCins.has(entry.cin)
                            ? "Added automatically — on a row with images"
                            : "Images taken"
                        }
                        onCheckedChange={() =>
                          setRosterList(prev =>
                            prev.map(c =>
                              c.cin === entry.cin
                                ? { ...c, hasImages: !c.hasImages }
                                : c
                            )
                          )
                        }
                        className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                      />
                    </div>
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() =>
                          setRosterList(prev =>
                            prev.filter(c => c.cin !== entry.cin)
                          )
                        }
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No CINs in team yet.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRosterOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Sort before saving: TL first, then numerically
                const sorted = [...rosterList].sort((a, b) => {
                  if (a.isTeamLeader && !b.isTeamLeader) return -1;
                  if (!a.isTeamLeader && b.isTeamLeader) return 1;
                  const aNum = parseInt(a.cin, 10);
                  const bNum = parseInt(b.cin, 10);
                  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                  return a.cin.localeCompare(b.cin);
                });
                updateSheet.mutate({ id: sheetId, sheetCins: sorted });
              }}
              disabled={updateSheet.isPending}
            >
              {updateSheet.isPending ? "Saving…" : "Save TEAM"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
