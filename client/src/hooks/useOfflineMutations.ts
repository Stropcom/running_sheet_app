/**
 * useOfflineMutations.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Offline-aware wrappers around the key write operations.
 * When online  → delegates straight to tRPC mutations (normal path).
 * When offline → saves to IndexedDB and enqueues a sync action.
 *
 * Returns the same { mutateAsync, isPending } shape as tRPC mutations so
 * call-sites don't need to know about the offline layer.
 */

import { useCallback, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useOffline } from "@/contexts/OfflineContext";
import {
  generateLocalId,
  saveDraftOperation,
  saveDraftTarget,
  saveDraftSheet,
  saveDraftRow,
  updateDraftRow,
  deleteDraftRow,
  getDraftRowsForSheet,
  enqueueSyncAction,
  type DraftOperation,
  type DraftTarget,
  type DraftSheet,
  type DraftRow,
} from "@/lib/offlineStore";

// ── Create Operation ──────────────────────────────────────────────────────────

interface CreateOperationInput {
  name: string;
  promisNumber?: string;
  imsNumber?: string;
  investigationUnit?: string;
}

interface CreateOperationResult {
  id: number | string; // string = local UUID when offline
  isLocal: boolean;
}

export function useOfflineCreateOperation() {
  const { isDraftMode, refreshDraftCounts } = useOffline();
  const [isPending, setIsPending] = useState(false);
  const onlineMutation = trpc.operation.create.useMutation();

  const mutateAsync = useCallback(
    async (input: CreateOperationInput): Promise<CreateOperationResult> => {
      setIsPending(true);
      try {
        if (!isDraftMode) {
          const result = await onlineMutation.mutateAsync(input);
          return { id: result.id, isLocal: false };
        }

        // Offline path
        const localId = generateLocalId();
        const draft: DraftOperation = {
          localId,
          name: input.name,
          promisNumber: input.promisNumber,
          imsNumber: input.imsNumber,
          investigationUnit: input.investigationUnit,
          createdAt: Date.now(),
          synced: false,
        };
        await saveDraftOperation(draft);
        await enqueueSyncAction({
          type: "createOperation",
          localId,
          payload: {
            name: draft.name,
            promisNumber: draft.promisNumber,
            imsNumber: draft.imsNumber,
            investigationUnit: draft.investigationUnit,
            createdAt: draft.createdAt,
          },
        });
        await refreshDraftCounts();
        return { id: localId, isLocal: true };
      } finally {
        setIsPending(false);
      }
    },
    [isDraftMode, onlineMutation, refreshDraftCounts]
  );

  return { mutateAsync, isPending };
}

// ── Create Target ─────────────────────────────────────────────────────────────

interface CreateTargetInput {
  name: string;
  operationLocalId?: string;
  operationServerId?: number;
}

interface CreateTargetResult {
  id: number | string;
  isLocal: boolean;
}

export function useOfflineCreateTarget() {
  const { isDraftMode, refreshDraftCounts } = useOffline();
  const [isPending, setIsPending] = useState(false);
  const onlineMutation = trpc.target.registry.create.useMutation();

  const mutateAsync = useCallback(
    async (input: CreateTargetInput): Promise<CreateTargetResult> => {
      setIsPending(true);
      try {
        if (!isDraftMode) {
          const result = await onlineMutation.mutateAsync({
            name: input.name,
            linkToOperationId: input.operationServerId,
          });
          return { id: result.id, isLocal: false };
        }

        // Offline path
        const localId = generateLocalId();
        const draft: DraftTarget = {
          localId,
          name: input.name,
          operationLocalId: input.operationLocalId,
          operationServerId: input.operationServerId,
          createdAt: Date.now(),
          synced: false,
        };
        await saveDraftTarget(draft);
        await enqueueSyncAction({
          type: "createTarget",
          localId,
          payload: {
            name: draft.name,
            operationLocalId: draft.operationLocalId,
            operationServerId: draft.operationServerId,
            createdAt: draft.createdAt,
          },
        });
        await refreshDraftCounts();
        return { id: localId, isLocal: true };
      } finally {
        setIsPending(false);
      }
    },
    [isDraftMode, onlineMutation, refreshDraftCounts]
  );

  return { mutateAsync, isPending };
}

// ── Create Running Sheet ──────────────────────────────────────────────────────

interface CreateSheetInput {
  operationLocalId?: string;
  operationServerId?: number;
  sheetDate: string;
  targetLocalId?: string;
  targetServerId?: number;
  sheetCins?: Array<{ cin: string; hasImages: boolean; isTeamLeader?: boolean; isAuthor?: boolean }>;
}

interface CreateSheetResult {
  id: number | string;
  isLocal: boolean;
}

export function useOfflineCreateSheet() {
  const { isDraftMode, refreshDraftCounts } = useOffline();
  const [isPending, setIsPending] = useState(false);
  const onlineMutation = trpc.sheet.create.useMutation();

  const mutateAsync = useCallback(
    async (input: CreateSheetInput): Promise<CreateSheetResult> => {
      setIsPending(true);
      try {
        if (!isDraftMode) {
          const operationId = input.operationServerId;
          if (!operationId) throw new Error("operationServerId required when online");
          const result = await onlineMutation.mutateAsync({
            operationId,
            sheetDate: input.sheetDate,
            targetId: input.targetServerId ?? null,
            sheetCins: input.sheetCins,
          });
          return { id: result.id, isLocal: false };
        }

        // Offline path
        const localId = generateLocalId();
        const draft: DraftSheet = {
          localId,
          operationLocalId: input.operationLocalId,
          operationServerId: input.operationServerId,
          targetLocalId: input.targetLocalId,
          targetServerId: input.targetServerId,
          sheetDate: input.sheetDate,
          // Placeholder only — the real title is generated server-side once
          // this draft syncs and the operation/target/author are resolved.
          title: `${input.sheetDate} (draft)`,
          sheetCins: input.sheetCins ?? [],
          createdAt: Date.now(),
          synced: false,
        };
        await saveDraftSheet(draft);
        await enqueueSyncAction({
          type: "createSheet",
          localId,
          payload: {
            operationLocalId: draft.operationLocalId,
            operationServerId: draft.operationServerId,
            targetLocalId: draft.targetLocalId,
            targetServerId: draft.targetServerId,
            sheetDate: draft.sheetDate,
            title: draft.title,
            sheetCins: draft.sheetCins,
            createdAt: draft.createdAt,
          },
        });
        await refreshDraftCounts();
        return { id: localId, isLocal: true };
      } finally {
        setIsPending(false);
      }
    },
    [isDraftMode, onlineMutation, refreshDraftCounts]
  );

  return { mutateAsync, isPending };
}

// ── Create Row ────────────────────────────────────────────────────────────────

interface CreateRowInput {
  sheetLocalId?: string;
  sheetServerId?: number;
  time?: string;
  observation?: string;
  members?: string[];
}

interface CreateRowResult {
  id: number | string;
  rowNumber: number;
  isLocal: boolean;
}

export function useOfflineCreateRow(sheetLocalId?: string) {
  const { isDraftMode, refreshDraftCounts } = useOffline();
  const [isPending, setIsPending] = useState(false);
  const onlineMutation = trpc.row.create.useMutation();
  const onlineMemberAdd = trpc.member.add.useMutation();

  const mutateAsync = useCallback(
    async (input: CreateRowInput): Promise<CreateRowResult> => {
      setIsPending(true);
      try {
        if (!isDraftMode) {
          const sheetId = input.sheetServerId;
          if (!sheetId) throw new Error("sheetServerId required when online");
          const result = await onlineMutation.mutateAsync({
            sheetId,
            time: input.time,
            observation: input.observation,
          });
          // Add members online
          for (const cin of input.members ?? []) {
            try {
              await onlineMemberAdd.mutateAsync({ rowId: result.id, memberName: cin });
            } catch { /* non-fatal */ }
          }
          return { id: result.id, rowNumber: result.rowNumber, isLocal: false };
        }

        // Offline path — compute next row number from local drafts
        const existingRows = sheetLocalId
          ? await getDraftRowsForSheet(sheetLocalId)
          : [];
        const rowNumber = existingRows.length + 1;

        const localId = generateLocalId();
        const draft: DraftRow = {
          localId,
          sheetLocalId: input.sheetLocalId,
          sheetServerId: input.sheetServerId,
          rowNumber,
          time: input.time,
          observation: input.observation,
          members: input.members ?? [],
          createdAt: Date.now(),
          synced: false,
        };
        await saveDraftRow(draft);
        await enqueueSyncAction({
          type: "createRow",
          localId,
          payload: {
            sheetLocalId: draft.sheetLocalId,
            sheetServerId: draft.sheetServerId,
            rowNumber: draft.rowNumber,
            time: draft.time,
            observation: draft.observation,
            members: draft.members,
            createdAt: draft.createdAt,
          },
        });
        await refreshDraftCounts();
        return { id: localId, rowNumber, isLocal: true };
      } finally {
        setIsPending(false);
      }
    },
    [isDraftMode, onlineMutation, onlineMemberAdd, refreshDraftCounts, sheetLocalId]
  );

  return { mutateAsync, isPending };
}

// ── Update Row (offline-aware) ────────────────────────────────────────────────

interface UpdateRowInput {
  id: number | string;
  isLocal: boolean;
  time?: string;
  observation?: string;
}

export function useOfflineUpdateRow() {
  const { isDraftMode } = useOffline();
  const [isPending, setIsPending] = useState(false);
  const onlineMutation = trpc.row.update.useMutation();

  const mutateAsync = useCallback(
    async (input: UpdateRowInput): Promise<void> => {
      setIsPending(true);
      try {
        if (!isDraftMode && !input.isLocal) {
          await onlineMutation.mutateAsync({
            id: input.id as number,
            time: input.time,
            observation: input.observation,
          });
          return;
        }
        // Offline or local row
        await updateDraftRow(String(input.id), { time: input.time, observation: input.observation });
        await enqueueSyncAction({
          type: "updateRow",
          localId: String(input.id),
          payload: { time: input.time, observation: input.observation },
        });
      } finally {
        setIsPending(false);
      }
    },
    [isDraftMode, onlineMutation]
  );

  return { mutateAsync, isPending };
}

// ── Delete Row (offline-aware) ────────────────────────────────────────────────

interface DeleteRowInput {
  id: number | string;
  isLocal: boolean;
}

export function useOfflineDeleteRow() {
  const { isDraftMode, refreshDraftCounts } = useOffline();
  const [isPending, setIsPending] = useState(false);
  const onlineMutation = trpc.row.delete.useMutation();

  const mutateAsync = useCallback(
    async (input: DeleteRowInput): Promise<void> => {
      setIsPending(true);
      try {
        if (!isDraftMode && !input.isLocal) {
          await onlineMutation.mutateAsync({ id: input.id as number });
          return;
        }
        // Local row — just remove from IndexedDB
        await deleteDraftRow(String(input.id));
        await enqueueSyncAction({
          type: "deleteRow",
          localId: String(input.id),
        });
        await refreshDraftCounts();
      } finally {
        setIsPending(false);
      }
    },
    [isDraftMode, onlineMutation, refreshDraftCounts]
  );

  return { mutateAsync, isPending };
}
