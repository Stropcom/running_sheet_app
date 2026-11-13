// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen used to be one
// 4,900-line function; its state and handlers are now these step hooks, called in this order:
// useSheetData → useRowActions → useRowChecks → useRowMembers → useSheetViewState → useSheetEditing.
// Same code in the same order as before; see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import {
  rowEditChangesContent,
  signatureRemovalWarning,
} from "@shared/rowEditSignatures";
import { trpc } from "@/lib/trpc";
import { useOwnRowShortcut } from "@/hooks/useOwnRowShortcut";
import { ceasePlaceFor } from "@shared/ceaseRow";
import { locateTargetFromPending } from "@shared/targetPosition";
import { useState, useCallback, useEffect, useMemo } from "react";
import {
  computeUsedBracketCodes,
  extractOccupantNames,
} from "@/lib/mentionAutocomplete";
import { toast } from "sonner";
import {
  saveCachedSheet,
  getCachedSheet,
  addPendingRowToCachedSheet,
  editPendingRowInCachedSheet,
  enqueueSyncAction,
  type CachedSheet,
} from "@/lib/offlineStore";
import type { SheetDataState } from "./useSheetData";
import type { UndoEntry, RowSaveInput } from "./types";

export function useRowActions(
  s: Pick<
    SheetDataState,
    | "trackedTarget"
    | "pendingArrivals"
    | "pendingDepartures"
    | "pendingWalkIns"
    | "pendingHeadingTo"
    | "pendingPlacements"
    | "rows"
    | "openDraft"
    | "utils"
    | "sheetId"
    | "isOnline"
    | "sheet"
    | "setOfflineRows"
    | "setHasPendingOfflineChanges"
  >
) {
  const {
    trackedTarget,
    pendingArrivals,
    pendingDepartures,
    pendingWalkIns,
    pendingHeadingTo,
    pendingPlacements,
    rows,
    openDraft,
    utils,
    sheetId,
    isOnline,
    sheet,
    setOfflineRows,
    setHasPendingOfflineChanges,
  } = s;

  // The place for the Cease button's row — worked out when it is pressed,
  // whatever the Target Logger's own switches say: where the Logger has the
  // target (only when he is at a place), else where the team commenced
  // (shared/ceaseRow.ts).
  // It is a chip at the end of the target / shortcuts chips, nowhere else.
  const ceaseOpenForTyping = (rowId: number) => {
    setJustAddedKeyboard(true);
    setJustAddedRowId(rowId);
    setTimeout(() => setJustAddedRowId(null), 6000);
  };
  const ceasePlace = () =>
    ceasePlaceFor(
      locateTargetFromPending({
        subject: trackedTarget,
        arrivals: pendingArrivals ?? [],
        departures: pendingDepartures ?? [],
        walkIns: pendingWalkIns ?? [],
        headingTo: pendingHeadingTo ?? [],
        placements: pendingPlacements ?? [],
        extractNames: extractOccupantNames,
      }),
      rows ?? []
    );
  // Names already introduced in full anywhere on the sheet — saved rows AND
  // the text open for editing — so a card's inserted sentence refers to
  // someone already introduced by their short name only.
  const usedBracketCodesWithDraft = useMemo(
    () =>
      computeUsedBracketCodes([
        ...(rows ?? []),
        { observation: openDraft?.text },
      ]),
    [rows, openDraft?.text]
  );
  // A row just created by tapping a continuity card: its observation opens
  // for editing so the next tap adds to it (see EditableCell autoEdit).
  const [justAddedRowId, setJustAddedRowId] = useState<number | null>(null);
  // The row opened for typing is the officer's own to type in (the first row of
  // a sheet): keep the on-screen keyboard, unlike a card tap.
  const [justAddedKeyboard, setJustAddedKeyboard] = useState(false);

  const invalidateRows = useCallback(() => {
    utils.row.list.invalidate({ sheetId });
    utils.row.entityChips.invalidate({ sheetId });
    utils.row.pendingVehicleDepartures.invalidate({ sheetId });
    utils.row.pendingVehicleArrivals.invalidate({ sheetId });
    utils.row.pendingWalkIns.invalidate({ sheetId });
    utils.row.pendingHeadingTo.invalidate({ sheetId });
    utils.row.pendingPlacements.invalidate({ sheetId });
    utils.row.surveillanceState.invalidate({ sheetId });
  }, [utils, sheetId]);

  // Cache sheet data to IndexedDB whenever we have fresh data online
  useEffect(() => {
    if (!isOnline || !sheet || !rows || !sheetId) return;
    const cacheData: CachedSheet = {
      serverId: sheetId,
      operationId: sheet.operationId,
      title: sheet.title,
      sheetCins: sheet.sheetCins
        ? (JSON.parse(sheet.sheetCins) as CachedSheet["sheetCins"])
        : [],
      rows: rows.map(r => ({
        id: r.id,
        rowNumber: r.rowNumber,
        time: r.time ?? undefined,
        observation: r.observation ?? undefined,
        members: r.members
          .map(m => m.memberName)
          .filter(n => n !== "__SPACE__"),
      })),
      cachedAt: Date.now(),
    };
    saveCachedSheet(cacheData).catch(() => {});
  }, [isOnline, sheet, rows, sheetId]);

  // When going offline, load cached data from IndexedDB
  useEffect(() => {
    if (isOnline) {
      setOfflineRows(null);
      setHasPendingOfflineChanges(false);
      return;
    }
    getCachedSheet(sheetId)
      .then(cached => {
        if (!cached) return;
        // Convert cached rows back to the expected shape
        const converted = cached.rows.map(r => ({
          id: r.id,
          sheetId,
          rowNumber: r.rowNumber,
          time: r.time ?? null,
          observation: r.observation ?? null,
          timeMinutes: null,
          isLocked: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          members: r.members.map((name, idx) => ({
            id: idx,
            rowId: r.id,
            memberName: name,
            sortOrder: idx,
            createdAt: new Date(),
          })),
          certifications: [] as NonNullable<typeof rows>[0]["certifications"],
        })) as unknown as NonNullable<typeof rows>;
        setOfflineRows(converted);
        const hasPending = cached.rows.some(
          r => r.pendingLocalId || r.pendingEdit || r.pendingDelete
        );
        setHasPendingOfflineChanges(hasPending);
      })
      .catch(() => {});
  }, [isOnline, sheetId]);

  const _addRowOnline = trpc.row.create.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  const _updateRowOnline = trpc.row.update.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  const _deleteRowOnline = trpc.row.delete.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  // A shortcut marked "Own row" (TP, TEXT …): one tap adds a row with the
  // current time that starts with the target's surname.
  const ownRowShortcut = useOwnRowShortcut(() => invalidateRows());
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const pushUndoEntry = (input: RowSaveInput) => {
    if (!isOnline) return;
    const row = rows?.find(r => r.id === input.id);
    if (!row || row.isLocked) return;
    const previous: Omit<RowSaveInput, "id"> = {};
    if (input.observation !== undefined)
      previous.observation = row.observation ?? "";
    if (input.time !== undefined) previous.time = row.time ?? "";
    if (input.timeMinutes !== undefined)
      previous.timeMinutes = row.timeMinutes ?? undefined;
    if (input.dayOffset !== undefined)
      previous.dayOffset = row.dayOffset ?? undefined;
    if (input.rowDate !== undefined)
      previous.rowDate = row.rowDate ?? undefined;
    if (Object.keys(previous).length === 0) return;
    setUndoStack(stack => [...stack.slice(-19), { rowId: input.id, previous }]);
  };

  // Offline-aware wrappers — queue locally when offline, call server when online
  const addRow = useMemo(
    () => ({
      isPending: _addRowOnline.isPending,
      mutate: (input: {
        sheetId: number;
        time?: string;
        timeMinutes?: number;
        observation?: string;
      }) => {
        if (isOnline) {
          _addRowOnline.mutate(input, {
            // A new row opens for typing at once, the caret in it: an empty row
            // at the start, the first row (which comes with "Surveillance
            // commenced in the vicinity of " and the team already on it) after
            // that text, ready for the address.
            onSuccess: created => {
              setJustAddedKeyboard(true);
              setJustAddedRowId(created.id);
              setTimeout(() => setJustAddedRowId(null), 6000);
            },
          });
        } else {
          addPendingRowToCachedSheet(input.sheetId, {
            rowNumber: Date.now(),
            members: [],
          })
            .then(localId => {
              enqueueSyncAction({
                type: "addRowToServerSheet",
                localId,
                payload: { sheetServerId: input.sheetId, members: [] },
              });
              // Refresh offline rows from cache
              getCachedSheet(input.sheetId).then(cached => {
                if (!cached) return;
                const converted = cached.rows.map(r => ({
                  id: r.id,
                  sheetId: input.sheetId,
                  rowNumber: r.rowNumber,
                  time: r.time ?? null,
                  observation: r.observation ?? null,
                  timeMinutes: null,
                  isLocked: false,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  members: r.members.map((name, idx) => ({
                    id: idx,
                    rowId: r.id,
                    memberName: name,
                    sortOrder: idx,
                    createdAt: new Date(),
                  })),
                  certifications: [] as NonNullable<
                    typeof rows
                  >[0]["certifications"],
                })) as unknown as NonNullable<typeof rows>;
                setOfflineRows(converted);
                setHasPendingOfflineChanges(true);
              });
            })
            .catch(() => toast.error("Failed to save row locally"));
        }
      },
    }),
    [isOnline, _addRowOnline, rows]
  );

  const updateRow = useMemo(
    () => ({
      isPending: _updateRowOnline.isPending,
      mutate: (input: {
        id: number;
        time?: string;
        timeMinutes?: number;
        dayOffset?: number;
        rowDate?: string;
        observation?: string;
      }) => {
        // A part-signed row loses its signatures when its content changes
        // (server rule, shared/rowEditSignatures.ts) — ask first.
        const current = rows?.find(r => r.id === input.id);
        const signedBy = (current?.certifications ?? []).map(
          c => c.certifiedByCIN
        );
        if (
          isOnline &&
          current &&
          signedBy.length > 0 &&
          rowEditChangesContent(current, input) &&
          !confirm(signatureRemovalWarning(signedBy))
        ) {
          invalidateRows(); // put the row back as it was saved
          return;
        }
        pushUndoEntry(input);
        if (isOnline) {
          _updateRowOnline.mutate(input);
        } else {
          const updates: { time?: string; observation?: string } = {};
          if (input.time !== undefined) updates.time = input.time;
          if (input.observation !== undefined)
            updates.observation = input.observation;
          editPendingRowInCachedSheet(sheetId, input.id, updates)
            .then(async () => {
              // Look up the row's pendingLocalId to determine how to enqueue
              const cached = await getCachedSheet(sheetId);
              if (!cached) return;
              const cachedRow = cached.rows.find(r => r.id === input.id);
              if (input.id > 0) {
                // Existing server row — enqueue direct update
                enqueueSyncAction({
                  type: "updateServerRow",
                  serverId: input.id,
                  payload: updates,
                });
              } else if (cachedRow?.pendingLocalId) {
                // New offline row — enqueue update keyed by pendingLocalId
                enqueueSyncAction({
                  type: "updatePendingRow",
                  pendingLocalId: cachedRow.pendingLocalId,
                  payload: updates,
                });
              }
              // Refresh offline rows display
              const converted = cached.rows.map(r => ({
                id: r.id,
                sheetId,
                rowNumber: r.rowNumber,
                time: r.time ?? null,
                observation: r.observation ?? null,
                timeMinutes: null,
                isLocked: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                members: r.members.map((name, idx) => ({
                  id: idx,
                  rowId: r.id,
                  memberName: name,
                  sortOrder: idx,
                  createdAt: new Date(),
                })),
                certifications: [] as NonNullable<
                  typeof rows
                >[0]["certifications"],
              })) as unknown as NonNullable<typeof rows>;
              setOfflineRows(converted);
              setHasPendingOfflineChanges(true);
            })
            .catch(() => {});
        }
      },
    }),
    [isOnline, _updateRowOnline, sheetId, rows]
  );

  return {
    ceaseOpenForTyping,
    ceasePlace,
    usedBracketCodesWithDraft,
    justAddedRowId,
    setJustAddedRowId,
    justAddedKeyboard,
    setJustAddedKeyboard,
    invalidateRows,
    _addRowOnline,
    _deleteRowOnline,
    ownRowShortcut,
    undoStack,
    setUndoStack,
    addRow,
    updateRow,
  };
}

export type RowActionsState = ReturnType<typeof useRowActions>;
