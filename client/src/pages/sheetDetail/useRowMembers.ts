// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen used to be one
// 4,900-line function; its state and handlers are now these step hooks, called in this order:
// useSheetData → useRowActions → useRowChecks → useRowMembers → useSheetViewState → useSheetEditing.
// Same code in the same order as before; see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { cinsWithImagery } from "@shared/rowImagery";
import { trpc } from "@/lib/trpc";
import { useMutation } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  getCachedSheet,
  deletePendingRowInCachedSheet,
  enqueueSyncAction,
} from "@/lib/offlineStore";
import type { CinEntry } from "./types";
import { SPACER } from "./teamMembers";
import type { RowActionsState } from "./useRowActions";
import type { SheetDataState } from "./useSheetData";

export function useRowMembers(
  s: Pick<RowActionsState, "_deleteRowOnline" | "invalidateRows"> &
    Pick<
      SheetDataState,
      | "isOnline"
      | "sheetId"
      | "rows"
      | "setOfflineRows"
      | "setHasPendingOfflineChanges"
      | "autoSortRef"
      | "isAuthenticated"
      | "utils"
      | "sheet"
      | "user"
      | "surveillance"
      | "manuallyReorderedRowsRef"
    >
) {
  const {
    _deleteRowOnline,
    isOnline,
    sheetId,
    rows,
    setOfflineRows,
    setHasPendingOfflineChanges,
    invalidateRows,
    autoSortRef,
    isAuthenticated,
    utils,
    sheet,
    user,
    surveillance,
    manuallyReorderedRowsRef,
  } = s;

  const deleteRow = useMemo(
    () => ({
      isPending: _deleteRowOnline.isPending,
      mutate: (input: { id: number }) => {
        if (isOnline) {
          _deleteRowOnline.mutate(input);
        } else {
          deletePendingRowInCachedSheet(sheetId, input.id)
            .then(() => {
              if (input.id > 0) {
                enqueueSyncAction({
                  type: "deleteServerRow",
                  serverId: input.id,
                });
              }
              getCachedSheet(sheetId).then(cached => {
                if (!cached) return;
                const converted = cached.rows
                  .filter(r => !r.pendingDelete)
                  .map(r => ({
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
              });
            })
            .catch(() => {});
        }
      },
    }),
    [isOnline, _deleteRowOnline, sheetId, rows]
  );

  const _addMemberOnline = trpc.member.add.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  const _removeMemberOnline = trpc.member.remove.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  // Offline-aware addMember — updates cached sheet and queues sync action
  const addMember = useMemo(
    () => ({
      isPending: _addMemberOnline.isPending,
      mutate: (input: { rowId: number; memberName: string }) => {
        if (isOnline) {
          // Store rowId for auto-sort after the query refreshes
          const rowIdToSort = input.rowId;
          _addMemberOnline.mutate(input, {
            onSuccess: () => {
              invalidateRows();
              // Auto-sort is triggered via the autoSortRowMembers ref set up below
              setTimeout(() => autoSortRef.current?.(rowIdToSort), 300);
            },
          });
        } else {
          // Update the cached sheet row's members array
          getCachedSheet(sheetId)
            .then(async cached => {
              if (!cached) return;
              const row = cached.rows.find(r => r.id === input.rowId);
              if (!row) return;
              // Add member to cached row
              const updatedRows = cached.rows.map(r =>
                r.id === input.rowId
                  ? { ...r, members: [...r.members, input.memberName] }
                  : r
              );
              await import("@/lib/offlineStore").then(({ saveCachedSheet }) =>
                saveCachedSheet({ ...cached, rows: updatedRows })
              );
              // Enqueue sync action
              if (input.rowId > 0) {
                enqueueSyncAction({
                  type: "addMemberToServerRow",
                  serverId: input.rowId,
                  memberName: input.memberName,
                });
              } else if (row.pendingLocalId) {
                enqueueSyncAction({
                  type: "addMemberToServerRow",
                  serverId: input.rowId,
                  pendingLocalId: row.pendingLocalId,
                  memberName: input.memberName,
                });
              }
              // Refresh display
              const updatedCached = { ...cached, rows: updatedRows };
              const converted = updatedCached.rows.map(r => ({
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
            .catch(() => toast.error("Failed to save member locally"));
        }
      },
    }),
    [isOnline, _addMemberOnline, sheetId, rows]
  );

  // Offline-aware removeMember — updates cached sheet and queues sync action
  const removeMember = useMemo(
    () => ({
      isPending: _removeMemberOnline.isPending,
      mutate: (input: { id: number; rowId: number }) => {
        if (isOnline) {
          _removeMemberOnline.mutate(input);
        } else {
          getCachedSheet(sheetId)
            .then(async cached => {
              if (!cached) return;
              const row = cached.rows.find(r => r.id === input.rowId);
              if (!row) return;
              // Remove member at index `input.id` (which we use as the member index offline)
              const updatedRows = cached.rows.map(r => {
                if (r.id !== input.rowId) return r;
                // input.id is the member index (we set idx as id in the converted rows)
                const newMembers = r.members.filter(
                  (_, idx) => idx !== input.id
                );
                return { ...r, members: newMembers };
              });
              await import("@/lib/offlineStore").then(({ saveCachedSheet }) =>
                saveCachedSheet({ ...cached, rows: updatedRows })
              );
              // Enqueue sync — best effort (member removal by name)
              if (input.rowId > 0 && row.members[input.id]) {
                enqueueSyncAction({
                  type: "removeMemberFromServerRow",
                  serverId: input.rowId,
                  memberName: row.members[input.id],
                });
              }
              // Refresh display
              const updatedCached = { ...cached, rows: updatedRows };
              const converted = updatedCached.rows.map(r => ({
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
    [isOnline, _removeMemberOnline, sheetId, rows]
  );

  const reorderMember = trpc.member.reorder.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  // Uploads go straight to a plain HTTP route as raw bytes rather than
  // through tRPC's base64/JSON path — a several-MB Portrait-mode iPhone
  // photo, base64-encoded into one giant JSON string, was what intermittently
  // failed on weak mobile connections with a cryptic browser error. Raw
  // binary avoids both the ~33% base64 size inflation and that giant string.
  const uploadAttachment = useMutation({
    mutationFn: async ({
      rowId,
      blob,
      mimeType,
      fileName,
    }: {
      rowId: number;
      blob: Blob;
      mimeType: string;
      fileName: string;
    }) => {
      const params = new URLSearchParams({
        rowId: String(rowId),
        fileName,
        mimeType,
      });
      const res = await fetch(
        `/api/attachments/upload-raw?${params.toString()}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": mimeType || "application/octet-stream" },
          body: blob,
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      return res.json() as Promise<{ id: number; url: string }>;
    },
    // Field officers are often on weak signal — retry transient network
    // failures automatically rather than making them re-tap the photo.
    retry: 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 4000),
    onSuccess: invalidateRows,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAttachment = trpc.attachment.delete.useMutation({
    onSuccess: invalidateRows,
    onError: e => toast.error(e.message),
  });

  const certify = trpc.certification.certify.useMutation({
    onSuccess: data => {
      invalidateRows();
      if (data.rowLocked) toast.success("All members certified — row locked");
      else toast.success("Member certified");
    },
    onError: e => toast.error(e.message),
  });

  const uncertify = trpc.certification.uncertify.useMutation({
    onSuccess: () => {
      invalidateRows();
      toast.success("Certification removed — row unlocked");
    },
    onError: e => toast.error(e.message),
  });

  const uncertifyAll = trpc.certification.uncertifyAll.useMutation({
    onSuccess: () => {
      invalidateRows();
      toast.success("All certifications removed — row unlocked");
    },
    onError: e => toast.error(e.message),
  });

  const certifyAllForCin = trpc.certification.certifyAllForCin.useMutation({
    onSuccess: data => {
      invalidateRows();
      toast.success(`Certified ${data.certifiedCount} row(s) across the sheet`);
    },
    onError: e => toast.error(e.message),
  });

  // ─── Travelled Via auto-fill ────────────────────────────────────────────────
  // Tracks which row is currently being auto-filled (shows spinner in that cell)
  const [tvLoadingRowId, setTvLoadingRowId] = useState<number | null>(null);
  const getTravelledViaStreets = trpc.travelledVia.getStreets.useMutation({
    onError: e => {
      setTvLoadingRowId(null);
      toast.error(`TV auto-fill: ${e.message}`);
    },
  });

  // Fetch governance record to check completion for Close button
  const { data: govRecord } = trpc.governance.getBySheet.useQuery(
    { sheetId },
    { enabled: isAuthenticated && !!sheetId }
  );

  // Close / Reopen mutations
  const closeSheet = trpc.sheet.close.useMutation({
    onSuccess: () => {
      utils.sheet.get.invalidate({ id: sheetId });
      toast.success("Running sheet closed and locked.");
    },
    onError: e => toast.error(e.message),
  });
  const reopenSheet = trpc.sheet.reopen.useMutation({
    onSuccess: () => {
      utils.sheet.get.invalidate({ id: sheetId });
      toast.success("Running sheet reopened.");
    },
    onError: e => toast.error(e.message),
  });

  const isClosed = !!sheet?.closedAt;
  // Any member or admin can reopen a sheet
  const canManageClose = user?.role === "member" || user?.role === "admin";
  // Only the Team Leader CIN or admin can close a sheet
  // parsedRoster is defined below but sheet?.sheetCins is available here
  const isCurrentUserTeamLeader = useMemo(() => {
    if (!user?.cin || !sheet?.sheetCins) return false;
    try {
      const raw: CinEntry[] = JSON.parse(sheet.sheetCins);
      return raw.some(
        e => e.isTeamLeader && e.cin.toUpperCase() === user.cin!.toUpperCase()
      );
    } catch {
      return false;
    }
  }, [user?.cin, sheet?.sheetCins]);
  const canCloseByRole = user?.role === "admin" || isCurrentUserTeamLeader;

  // All rows certified check (same logic as Governance.tsx allSigned)
  const allRowsCertified = useMemo(() => {
    if (!rows || rows.length === 0) return false;
    return rows.every(r => {
      const members = r.members ?? [];
      if (members.length === 0) return true;
      return members.every(m =>
        (r.certifications ?? []).some(c => c.memberId === m.id && c.isActive)
      );
    });
  }, [rows]);

  // Governance complete check
  const govComplete = useMemo(() => {
    if (!govRecord) return false;
    const g = govRecord as Record<string, unknown>;
    const tlDone = !!g.summaryNotification && !!g.sentToIO;
    const opDone = !!g.savedInOpFolder && !!g.savedInInvestigatorTransferDrive;
    return tlDone && opDone;
  }, [govRecord]);

  const canCloseSheet =
    canCloseByRole && allRowsCertified && govComplete && !isClosed;

  const canEdit =
    !isClosed && (user?.role === "member" || user?.role === "admin");
  const canCertify =
    !isClosed && (user?.role === "member" || user?.role === "admin");

  // Cease is offered while there is something to cease: open to the officer,
  // online, at least one row, surveillance not ended.
  const ceaseAvailable =
    canEdit &&
    isOnline &&
    !!surveillance &&
    !surveillance.ended &&
    (rows?.length ?? 0) > 0;

  // Parse daily roster CINs for team expansion and Certify All
  // Sort: Team Leader first, then all others in numeric/alphabetic order
  const parsedRoster = useMemo(() => {
    try {
      const raw = sheet?.sheetCins
        ? (JSON.parse(sheet.sheetCins) as CinEntry[])
        : [];
      return [...raw].sort((a, b) => {
        if (a.isTeamLeader && !b.isTeamLeader) return -1;
        if (!a.isTeamLeader && b.isTeamLeader) return 1;
        // Numeric sort: extract leading digits for comparison
        const aNum = parseInt(a.cin, 10);
        const bNum = parseInt(b.cin, 10);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.cin.localeCompare(b.cin);
      });
    } catch {
      return [];
    }
  }, [sheet?.sheetCins]);
  const rosterCinList = useMemo(
    () => parsedRoster.map(e => e.cin),
    [parsedRoster]
  );

  // ─── CIN auto-sort helper ────────────────────────────────────────────────────
  // After any member is added, re-sort the row's CINs: TL first, then ascending CIN number.
  // Spacers keep their relative positions. Skipped if the user has manually dragged this row.
  const autoSortRowMembers = useCallback(
    (rowId: number) => {
      if (manuallyReorderedRowsRef.current.has(rowId)) return; // user has custom order
      const currentRow = rows?.find(r => r.id === rowId);
      if (!currentRow || currentRow.members.length < 2) return;

      // Build canonical CIN order: TL first, then ascending numeric CIN
      const tlCin = parsedRoster.find(e => e.isTeamLeader)?.cin?.toUpperCase();
      const nonSpacers = currentRow.members.filter(
        m => m.memberName !== SPACER
      );
      const spacers = currentRow.members.filter(m => m.memberName === SPACER);

      const sorted = [...nonSpacers].sort((a, b) => {
        const aIsLeader = tlCin && a.memberName.toUpperCase() === tlCin;
        const bIsLeader = tlCin && b.memberName.toUpperCase() === tlCin;
        if (aIsLeader && !bIsLeader) return -1;
        if (!aIsLeader && bIsLeader) return 1;
        const aNum = parseInt(a.memberName, 10);
        const bNum = parseInt(b.memberName, 10);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.memberName.localeCompare(b.memberName);
      });

      // Re-insert spacers at their original relative positions
      const result = [...sorted];
      for (const sp of spacers) {
        const origIdx = currentRow.members.indexOf(sp);
        const clampedIdx = Math.min(origIdx, result.length);
        result.splice(clampedIdx, 0, sp);
      }

      // Only call reorder if the order actually changed
      const changed = result.some((m, i) => m.id !== currentRow.members[i]?.id);
      if (changed) {
        reorderMember.mutate({ rowId, orderedIds: result.map(m => m.id) });
      }
    },
    [rows, parsedRoster, reorderMember]
  );

  // Keep the ref in sync so the addMember useMemo (declared earlier) can call it
  autoSortRef.current = autoSortRowMembers;

  // Compute which CINs have ALL their rows certified
  // CINs on a row with images — an imagery phrase or an attached image — get
  // the camera automatically; no need to tick it in Edit TEAM.
  const autoImageCins = useMemo(() => cinsWithImagery(rows ?? []), [rows]);
  const cinFullyCertified = useMemo(() => {
    if (!rows || rows.length === 0) return new Set<string>();
    const certified = new Set<string>();
    for (const entry of parsedRoster) {
      const cin = entry.cin;
      // Find all rows where this CIN is a member
      const relevantRows = rows.filter(r =>
        r.members.some(m => m.memberName === cin)
      );
      if (relevantRows.length === 0) continue; // not in any row yet
      const allCertified = relevantRows.every(r =>
        r.members
          .filter(m => m.memberName === cin)
          .every(m =>
            r.certifications.some(c => c.memberId === m.id && c.isActive)
          )
      );
      if (allCertified) certified.add(cin);
    }
    return certified;
  }, [rows, parsedRoster]);

  return {
    deleteRow,
    addMember,
    removeMember,
    uploadAttachment,
    deleteAttachment,
    certify,
    uncertify,
    uncertifyAll,
    certifyAllForCin,
    tvLoadingRowId,
    setTvLoadingRowId,
    getTravelledViaStreets,
    closeSheet,
    reopenSheet,
    isClosed,
    canManageClose,
    canCloseByRole,
    allRowsCertified,
    govComplete,
    canCloseSheet,
    canEdit,
    canCertify,
    ceaseAvailable,
    parsedRoster,
    rosterCinList,
    autoImageCins,
    cinFullyCertified,
  };
}

export type RowMembersState = ReturnType<typeof useRowMembers>;
