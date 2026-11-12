// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen's layout used to be
// one 2,800-line return; each section is now a component that takes the screen's state as `s`
// (see useSheetScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { Skeleton } from "@/components/ui/skeleton";
import React from "react";
import { toast } from "sonner";
import {
  PERTH_TIME_ZONE,
  addDaysToYmd,
  formatPerthDateLabel,
} from "./perthDates";
import { CinCertifyCell } from "./CinCertify";
import { ObservationAttachments } from "./ObservationAttachments";
import { TimePickerCell } from "./TimePickerCell";
import { EditableCell } from "./EditableCell";
import type { SheetScreen } from "./useSheetScreen";

/** the table of rows. */
export function RowsTable({ s }: { s: SheetScreen }) {
  const {
    sheet,
    canCertify,
    usedBracketCodes,
    rows,
    setJustAddedRowId,
    canEdit,
    searchQuery,
    filteredRows,
    rowDayOffsetMap,
    sheetHasCrossedMidnight,
    updateRow,
    tvLoadingRowId,
    justAddedRowId,
    justAddedKeyboard,
    setJustAddedKeyboard,
    updateRowWithDupeCheck,
    setTvLoadingRowId,
    getTravelledViaStreets,
    rosterCinList,
    addMember,
    shortcutMap,
    usedVehicleRegos,
    usedAddressLabels,
    uploadAttachment,
    deleteAttachment,
    uncertifyAll,
    removeMember,
    certify,
    uncertify,
    deleteRow,
    isLoading,
  } = s;
  return (
    <>
      {/* Table */}
      <div className="md:rounded-xl md:border md:border-border overflow-hidden md:bg-card">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6 flex flex-col gap-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : !rows || rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-muted-foreground text-sm">
                No rows yet. Click "Add Row" to begin.
              </p>
            </div>
          ) : (
            <table className="running-sheet-table running-sheet-cards w-full">
              <thead>
                <tr className="bg-muted/30">
                  <th className="w-32">Time</th>
                  <th>Observation</th>
                  <th className="w-28">CIN</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && searchQuery ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-12 text-center text-sm text-muted-foreground italic"
                    >
                      No rows match your search.
                    </td>
                  </tr>
                ) : (
                  filteredRows.reduce(
                    (
                      acc: React.ReactNode[],
                      row: NonNullable<typeof rows>[0],
                      idx: number
                    ) => {
                      // ── Date-divider: insert a separator row when the day offset changes ──
                      // In ascending order: divider goes BEFORE the first day-N row.
                      // In reversed order: divider goes AFTER the last day-N row (i.e. before
                      // the current row which belongs to an earlier day).
                      if (row.timeMinutes != null) {
                        const prevTimedRow = [...filteredRows]
                          .slice(0, idx)
                          .reverse()
                          .find(
                            (r: NonNullable<typeof rows>[0]) =>
                              r.timeMinutes != null
                          );
                        if (prevTimedRow) {
                          const prevDay =
                            rowDayOffsetMap.get(prevTimedRow.id) ?? 0;
                          const curDay = rowDayOffsetMap.get(row.id) ?? 0;
                          if (curDay !== prevDay) {
                            // The divider label always shows the HIGHER day (the later calendar day)
                            const laterDay = Math.max(prevDay, curDay);
                            // Prefer an explicit rowDate from a row on that day
                            const rowOnLaterDay = filteredRows.find(
                              (r: NonNullable<typeof rows>[0]) =>
                                (rowDayOffsetMap.get(r.id) ?? 0) === laterDay &&
                                (r as any).rowDate
                            );
                            let label: string;
                            if (
                              rowOnLaterDay &&
                              (rowOnLaterDay as any).rowDate
                            ) {
                              label = formatPerthDateLabel(
                                (rowOnLaterDay as any).rowDate as string
                              );
                            } else if (sheet?.sheetDate) {
                              label = formatPerthDateLabel(
                                addDaysToYmd(sheet.sheetDate, laterDay)
                              );
                            } else {
                              const sheetStartMs = sheet?.createdAt
                                ? new Date(sheet.createdAt).getTime()
                                : Date.now();
                              const labelDate = new Date(
                                sheetStartMs + laterDay * 24 * 60 * 60 * 1000
                              );
                              label = labelDate
                                .toLocaleDateString("en-AU", {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  timeZone: PERTH_TIME_ZONE,
                                })
                                .toUpperCase();
                            }
                            const dividerRow = (
                              <tr
                                key={`divider-${row.id}`}
                                className="date-divider-row"
                              >
                                <td colSpan={3} className="py-1.5 px-4">
                                  <div className="flex items-center gap-3">
                                    <div className="flex-1 h-px bg-border" />
                                    <span className="text-xs font-semibold tracking-widest text-muted-foreground whitespace-nowrap">
                                      {label}
                                    </span>
                                    <div className="flex-1 h-px bg-border" />
                                  </div>
                                </td>
                              </tr>
                            );
                            // Always insert divider before the current row.
                            // In ascending: divider sits above the first day-N row.
                            // In reversed: the reduce sees rows newest-first, so the day
                            // boundary is detected when we hit the first lower-day row;
                            // inserting the divider before that row places it correctly
                            // between the higher-day rows above and lower-day rows below.
                            acc.push(dividerRow);
                          }
                        }
                      }
                      acc.push(
                        <tr
                          key={row.id}
                          id={`sheet-row-${row.id}`}
                          className={
                            row.isLocked ? "row-locked" : "hover:bg-accent/20"
                          }
                        >
                          {/* Time */}
                          <td>
                            <TimePickerCell
                              value={row.time}
                              locked={row.isLocked || !canEdit}
                              dayOffset={(row as any).dayOffset ?? 0}
                              rowDate={(row as any).rowDate ?? null}
                              inferredRowDate={(() => {
                                if (!sheetHasCrossedMidnight) return null;
                                // Compute inferred date from day offset +
                                // the sheet's picker date (falling back to
                                // creation date only for legacy sheets with
                                // no sheetDate).
                                const dayOff = rowDayOffsetMap.get(row.id) ?? 0;
                                if (sheet?.sheetDate) {
                                  return addDaysToYmd(sheet.sheetDate, dayOff);
                                }
                                const sheetStartMs = sheet?.createdAt
                                  ? new Date(sheet.createdAt).getTime()
                                  : Date.now();
                                const d = new Date(
                                  sheetStartMs + dayOff * 86400000
                                );
                                return new Intl.DateTimeFormat("en-CA", {
                                  timeZone: PERTH_TIME_ZONE,
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                }).format(d);
                              })()}
                              sheetHasCrossedMidnight={sheetHasCrossedMidnight}
                              sheetDate={sheet?.sheetDate ?? null}
                              sheetCreatedAt={
                                sheet?.createdAt
                                  ? new Date(sheet.createdAt).getTime()
                                  : null
                              }
                              onSave={(display, mins, dayOff, rd) =>
                                updateRow.mutate({
                                  id: row.id,
                                  time: display,
                                  timeMinutes: mins,
                                  dayOffset: dayOff,
                                  rowDate: rd,
                                })
                              }
                            />
                          </td>

                          {/* Observation — reserves ~2 blank lines below
                              the text so rows read with breathing room
                              between them, on screen and not just in the
                              printed/exported sheet. Uses an inline style
                              rather than the pb-10 utility class: the
                              global ".running-sheet-table td" rule in
                              index.css sets its own "padding" shorthand
                              (including padding-bottom), and that selector
                              (class+element) has higher CSS specificity
                              than a bare Tailwind utility class, so pb-10
                              was silently losing to it and never actually
                              applying — confirmed as a real, reported bug,
                              not just a theoretical risk. An inline style
                              always wins regardless of selector
                              specificity, so don't "clean this up" back to
                              a className without re-checking that. */}
                          <td style={{ paddingBottom: "2.5rem" }}>
                            {tvLoadingRowId === row.id ? (
                              <div className="flex items-center gap-2 py-2 px-1 text-sm text-muted-foreground">
                                <svg
                                  className="animate-spin h-4 w-4 shrink-0"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                                  />
                                </svg>
                                Fetching route streets…
                              </div>
                            ) : (
                              <EditableCell
                                value={row.observation}
                                rowId={row.id}
                                autoEdit={justAddedRowId === row.id}
                                autoEditKeyboard={justAddedKeyboard}
                                onAutoEdited={() => {
                                  setJustAddedRowId(null);
                                  setJustAddedKeyboard(false);
                                }}
                                locked={row.isLocked || !canEdit}
                                multiline
                                placeholder="Enter observation…"
                                onSave={val => {
                                  // ── TV trigger: detect case-insensitive "tv" as the entire cell value ──
                                  if (val.trim().toLowerCase() === "tv") {
                                    // Find this row's index in filteredRows
                                    const rowIdx = filteredRows.findIndex(
                                      (r: NonNullable<typeof rows>[0]) =>
                                        r.id === row.id
                                    );
                                    if (rowIdx < 0) {
                                      updateRowWithDupeCheck({
                                        id: row.id,
                                        observation: val,
                                      });
                                      return;
                                    }
                                    // Get the row immediately before and after in the display list
                                    const prevRow =
                                      rowIdx > 0
                                        ? filteredRows[rowIdx - 1]
                                        : null;
                                    const nextRow =
                                      rowIdx < filteredRows.length - 1
                                        ? filteredRows[rowIdx + 1]
                                        : null;
                                    if (!prevRow || !nextRow) {
                                      toast.error(
                                        "TV auto-fill: no surrounding rows found. Add a departing row above and arriving row below first."
                                      );
                                      updateRowWithDupeCheck({
                                        id: row.id,
                                        observation: val,
                                      });
                                      return;
                                    }
                                    // Extract address text from surrounding observation cells.
                                    // The observation text is a full sentence like:
                                    //   "Vehicle 1ICW519 STROP driver and sole occupant, departed 27 Olding Way, MELVILLE WA (27 Olding Way)"
                                    // Strategy (in priority order):
                                    //   1. Bracket code at end of text: "(27 Olding Way)" → "27 Olding Way"
                                    //   2. Street number pattern anywhere in text: "27 Olding Way" extracted from sentence
                                    //   3. "departed <Name>"/"arrived at <Name>" clause — a bare business/
                                    //      location name with no house number (e.g. "departed Attadale
                                    //      Kitchen and continued via:") — isolates just the name so the
                                    //      enrichment lookup below can actually find it. Without this the
                                    //      whole noisy sentence fell through to step 4 and got sent to
                                    //      Google's geocoder as-is, which only "worked" by luck when the
                                    //      business happened to be famous enough (a Bunnings, a well-known
                                    //      cafe) for Google's fuzzy matching to find it buried in the noise
                                    //      — a real but less-indexed business (e.g. a small local cafe)
                                    //      geocoded to a wrong, unrelated street instead.
                                    //   4. Full first line as last resort
                                    const prevObs = prevRow.observation ?? "";
                                    const nextObs = nextRow.observation ?? "";

                                    const extractAddressFromObs = (
                                      obs: string
                                    ): string => {
                                      if (!obs) return "";
                                      // 1. Bracket code at end: (27 Olding Way)
                                      const bracketMatch =
                                        obs.match(/\(([^)]{3,80})\)\s*$/);
                                      if (bracketMatch)
                                        return bracketMatch[1].trim();
                                      // 2. Street number pattern: digits followed by street name.
                                      //    Matches things like "27 Olding Way", "131A Lakey Street", "3/12 Smith St".
                                      //    Extra words must also be capitalised so this stops at the street name
                                      //    instead of swallowing trailing sentence text like "and continued via"
                                      //    (lowercase words never continue a street name).
                                      const streetMatch = obs.match(
                                        /\b(\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?)?\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/
                                      );
                                      if (streetMatch)
                                        return streetMatch[1].trim();
                                      // 3. "departed <Name>" / "arrived at <Name>" clause — a bare
                                      //    business/location name, no house number. Stops at the next
                                      //    clause boundary (comma, full stop, "and", or end of string).
                                      const clauseMatch = obs.match(
                                        /\b(?:departed|arrived at)\s+([A-Z][\w&'-]*(?:\s+[A-Z][\w&'-]*){0,5})(?=\s*(?:,|\.|;|:|and\b|$))/
                                      );
                                      if (clauseMatch)
                                        return clauseMatch[1].trim();
                                      // 4. Last resort: full text (server will try to geocode it)
                                      return obs.split("\n")[0].trim();
                                    };

                                    // A bare street mention like "departed 45 Scott Street and continued
                                    // via:" has no suburb, which Google's geocoder often can't resolve on
                                    // its own. Scan every row in the sheet for a bracketed full address
                                    // sighting of the same street (e.g. "45 Scott Street, KOONGAMIA WA (45
                                    // Scott Street)") and prefer that — same enrichment the RS Map feature
                                    // already does for its own address matching.
                                    const knownAddressMap = new Map<
                                      string,
                                      string
                                    >();
                                    const bracketedAddrRe =
                                      /\b(\d{1,5}[A-Za-z]?(?:\/\d{1,5}[A-Za-z]?)?\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3},\s*[A-Z][A-Z ]{1,30}(?:\s+WA)?)\s*\(([^)]{3,80})\)/g;
                                    for (const r of filteredRows) {
                                      if (!r.observation) continue;
                                      bracketedAddrRe.lastIndex = 0;
                                      let m: RegExpExecArray | null;
                                      while (
                                        (m = bracketedAddrRe.exec(
                                          r.observation
                                        )) !== null
                                      ) {
                                        const key = m[2].trim().toLowerCase();
                                        if (!knownAddressMap.has(key))
                                          knownAddressMap.set(key, m[1].trim());
                                      }
                                    }
                                    // Exact match first (the common case once extractAddressFromObs
                                    // isolates the name cleanly); falls back to a substring search so an
                                    // imperfectly-isolated candidate (e.g. step 4's whole-line fallback)
                                    // still finds a known name buried inside it, rather than sending the
                                    // raw noisy sentence to Google and hoping its fuzzy matching gets
                                    // lucky. Guarded to keys of 4+ characters to avoid a short/common
                                    // name spuriously matching unrelated text.
                                    const enrichAddress = (
                                      addr: string
                                    ): string => {
                                      const lower = addr.toLowerCase();
                                      const exact = knownAddressMap.get(lower);
                                      if (exact) return exact;
                                      const substringMatch = Array.from(
                                        knownAddressMap.entries()
                                      ).find(
                                        ([key]) =>
                                          key.length > 3 && lower.includes(key)
                                      );
                                      if (substringMatch)
                                        return substringMatch[1];
                                      return addr;
                                    };

                                    const departAddr = enrichAddress(
                                      extractAddressFromObs(prevObs)
                                    );
                                    const arriveAddr = enrichAddress(
                                      extractAddressFromObs(nextObs)
                                    );
                                    if (!departAddr || !arriveAddr) {
                                      toast.error(
                                        "TV auto-fill: could not extract addresses from surrounding rows."
                                      );
                                      updateRowWithDupeCheck({
                                        id: row.id,
                                        observation: val,
                                      });
                                      return;
                                    }
                                    // Show spinner and call the server
                                    setTvLoadingRowId(row.id);
                                    getTravelledViaStreets.mutate(
                                      {
                                        departAddress: departAddr,
                                        arriveAddress: arriveAddr,
                                        // Pass full observation text so server can extract
                                        // the correct suburb directly from the text
                                        departObsText: prevObs,
                                        arriveObsText: nextObs,
                                      },
                                      {
                                        onSuccess: data => {
                                          setTvLoadingRowId(null);
                                          updateRowWithDupeCheck({
                                            id: row.id,
                                            observation: data.streets,
                                          });
                                          toast.success(
                                            "Travelled via streets auto-filled"
                                          );
                                          // TV means the whole team travelled together — auto-add any
                                          // roster CINs not already on this row, sequenced the same way
                                          // as the "★ Add all team CINs" dropdown option below.
                                          if (rosterCinList.length > 0) {
                                            const existingNames = new Set(
                                              row.members.map(m => m.memberName)
                                            );
                                            const missingCins =
                                              rosterCinList.filter(
                                                cin => !existingNames.has(cin)
                                              );
                                            const addSequentially = (
                                              cins: string[],
                                              idx: number
                                            ) => {
                                              if (idx >= cins.length) return;
                                              addMember.mutate({
                                                rowId: row.id,
                                                memberName: cins[idx],
                                              });
                                              setTimeout(
                                                () =>
                                                  addSequentially(
                                                    cins,
                                                    idx + 1
                                                  ),
                                                80
                                              );
                                            };
                                            addSequentially(missingCins, 0);
                                          }
                                        },
                                        onError: () => {
                                          setTvLoadingRowId(null);
                                          // Error toast already shown by mutation onError
                                          updateRowWithDupeCheck({
                                            id: row.id,
                                            observation: val,
                                          });
                                        },
                                      }
                                    );
                                    return;
                                  }
                                  // Normal save
                                  updateRowWithDupeCheck({
                                    id: row.id,
                                    observation: val,
                                  });
                                }}
                                shortcuts={shortcutMap}
                                usedBracketCodes={usedBracketCodes}
                                usedVehicleRegos={usedVehicleRegos}
                                usedAddressLabels={usedAddressLabels}
                              />
                            )}
                            <ObservationAttachments
                              row={row}
                              canEdit={canEdit && !row.isLocked}
                              onUpload={(rowId, blob, mimeType, fileName) =>
                                uploadAttachment.mutateAsync({
                                  rowId,
                                  blob,
                                  mimeType,
                                  fileName,
                                })
                              }
                              onDelete={id => deleteAttachment.mutate({ id })}
                              uploading={uploadAttachment.isPending}
                              deletePending={deleteAttachment.isPending}
                              operationId={sheet?.operationId}
                            />
                          </td>

                          {/* CIN / Certify */}
                          <td>
                            <CinCertifyCell
                              row={row}
                              canEdit={canEdit}
                              canCertify={canCertify}
                              onAddMember={(rowId, name) =>
                                addMember.mutate({ rowId, memberName: name })
                              }
                              onRemoveMember={(id, rowId) => {
                                const rowData = rows?.find(r => r.id === rowId);
                                if (rowData?.isLocked) {
                                  // Row is locked — uncertify all first, then remove
                                  uncertifyAll.mutate(
                                    { rowId },
                                    {
                                      onSuccess: () =>
                                        removeMember.mutate({ id, rowId }),
                                    }
                                  );
                                } else {
                                  removeMember.mutate({ id, rowId });
                                }
                              }}
                              onCertify={(rowId, memberId) =>
                                certify.mutate({ rowId, memberId })
                              }
                              onUncertify={(rowId, memberId) =>
                                uncertify.mutate({ rowId, memberId })
                              }
                              onUncertifyAll={rowId =>
                                uncertifyAll.mutate({ rowId })
                              }
                              onDeleteRow={
                                canCertify
                                  ? rowId => {
                                      if (confirm("Delete this row?"))
                                        deleteRow.mutate({ id: rowId });
                                    }
                                  : undefined
                              }
                              rosterCins={rosterCinList}
                            />
                          </td>
                        </tr>
                      );
                      return acc;
                    },
                    [] as React.ReactNode[]
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
