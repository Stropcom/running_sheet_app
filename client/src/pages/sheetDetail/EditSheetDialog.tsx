// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen's layout used to be
// one 2,800-line return; each section is now a component that takes the screen's state as `s`
// (see useSheetScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { ClearInputButton } from "@/components/ClearInputButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, CheckCircle2, X, Search, Target } from "lucide-react";
import type { SheetScreen } from "./useSheetScreen";

/** the Sheet Details dialog. */
export function EditSheetDialog({ s }: { s: SheetScreen }) {
  const {
    sheet,
    sheetId,
    editSheetOpen,
    setEditSheetOpen,
    editSheetDate,
    setEditSheetDate,
    operationTargets,
    editSelectedTargetId,
    setEditSelectedTargetId,
    setEditTargetMode,
    editTargetMode,
    editTargetSearch,
    setEditTargetSearch,
    allTargetsForSheet,
    setEditCreateTargetDialogOpen,
    user,
    deleteSheet,
    setSheetTarget,
    updateSheet,
  } = s;
  return (
    <>
      {/* Edit Sheet Title Dialog */}
      <Dialog open={editSheetOpen} onOpenChange={setEditSheetOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sheet Details</DialogTitle>
          </DialogHeader>
          <div className="py-2 flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Date <span className="text-destructive">*</span>
              </label>
              <Input
                type="date"
                value={editSheetDate}
                onChange={e => setEditSheetDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                The sheet's title is generated automatically from this date, the
                author, operation and target.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Target
              </label>
              <div className="flex flex-col gap-2">
                {/* Operation's existing targets — selectable */}
                {(operationTargets ?? []).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (editSelectedTargetId === t.id) {
                        setEditSelectedTargetId(null);
                        setEditTargetMode("none");
                      } else {
                        setEditSelectedTargetId(t.id);
                        setEditTargetMode("link");
                      }
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors w-full ${
                      editSelectedTargetId === t.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <Target className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">
                      {t.name}
                    </span>
                    {editSelectedTargetId === t.id && (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    )}
                  </button>
                ))}

                {/* Link Existing search panel */}
                {editTargetMode === "link" && editSelectedTargetId === null && (
                  <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="relative flex-1">
                        <Input
                          autoFocus
                          className="h-8 w-full pr-8 text-sm"
                          placeholder="Search by name, TGT code or operation…"
                          value={editTargetSearch}
                          onChange={e => setEditTargetSearch(e.target.value)}
                        />
                        <ClearInputButton
                          value={editTargetSearch}
                          onClear={() => setEditTargetSearch("")}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => {
                          setEditTargetMode("none");
                          setEditTargetSearch("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <div className="max-h-52 overflow-y-auto flex flex-col gap-1">
                      {(allTargetsForSheet ?? []).filter(t => {
                        const q = editTargetSearch.toLowerCase();
                        return (
                          t.name.toLowerCase().includes(q) ||
                          (t.tgt ?? "").toLowerCase().includes(q) ||
                          (t.operationName ?? "").toLowerCase().includes(q)
                        );
                      }).length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          {editTargetSearch
                            ? "No matching targets"
                            : "Start typing to search"}
                        </p>
                      ) : (
                        (allTargetsForSheet ?? [])
                          .filter(t => {
                            const q = editTargetSearch.toLowerCase();
                            return (
                              t.name.toLowerCase().includes(q) ||
                              (t.tgt ?? "").toLowerCase().includes(q) ||
                              (t.operationName ?? "").toLowerCase().includes(q)
                            );
                          })
                          .map(t => (
                            <button
                              key={t.id}
                              type="button"
                              className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 text-left transition-colors w-full"
                              onClick={() => {
                                setEditSelectedTargetId(t.id);
                                setEditTargetSearch("");
                                setEditTargetMode("link");
                              }}
                            >
                              <Target className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {t.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {t.tgt ? (
                                    <span className="font-mono mr-2">
                                      TGT: {t.tgt}
                                    </span>
                                  ) : null}
                                  {t.operationName ? (
                                    <span>Op: {t.operationName}</span>
                                  ) : null}
                                </p>
                              </div>
                            </button>
                          ))
                      )}
                    </div>
                  </div>
                )}

                {/* Selected linked target chip (not from operation) */}
                {editTargetMode === "link" &&
                  editSelectedTargetId !== null &&
                  !(operationTargets ?? []).find(
                    t => t.id === editSelectedTargetId
                  ) && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary bg-primary/10 text-primary">
                      <Target className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium flex-1 truncate">
                        {
                          (allTargetsForSheet ?? []).find(
                            t => t.id === editSelectedTargetId
                          )?.name
                        }
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditSelectedTargetId(null);
                          setEditTargetMode("none");
                        }}
                        className="hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                {/* Action buttons */}
                {!(
                  editTargetMode === "link" && editSelectedTargetId === null
                ) && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => setEditCreateTargetDialogOpen(true)}
                    >
                      <Plus className="w-3.5 h-3.5" /> New Target
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setEditTargetMode("link");
                        setEditSelectedTargetId(null);
                        setEditTargetSearch("");
                      }}
                    >
                      <Search className="w-3.5 h-3.5" /> Link Existing
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {/* Delete button — bottom left, admin only */}
            {user?.role === "admin" && (
              <Button
                variant="ghost"
                className="sm:mr-auto text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                disabled={deleteSheet.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Move "${sheet?.title}" to the Recycle Bin? It can be restored from there.`
                    )
                  ) {
                    deleteSheet.mutate({ id: sheetId });
                  }
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleteSheet.isPending ? "Deleting…" : "Delete Sheet"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                // Apply target change first if needed
                const currentTargetId = sheet?.targetId ?? null;
                const newTargetId =
                  editTargetMode === "link" ? editSelectedTargetId : null;
                if (
                  editTargetMode === "link" &&
                  newTargetId !== currentTargetId
                ) {
                  setSheetTarget.mutate({ sheetId, targetId: newTargetId });
                } else if (
                  editTargetMode === "none" &&
                  editSelectedTargetId === null &&
                  currentTargetId !== null
                ) {
                  setSheetTarget.mutate({ sheetId, targetId: null });
                }
                updateSheet.mutate({
                  id: sheetId,
                  sheetDate: editSheetDate,
                });
              }}
              disabled={!editSheetDate || updateSheet.isPending}
            >
              {updateSheet.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
