/**
 * offlineSync.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Replays the offline sync queue against the live server when connectivity
 * returns.  Handles ID remapping so that rows created under a draft sheet
 * correctly reference the real server-side sheet ID after sync.
 */

import { trpcClient } from "./trpc";
import {
  getSyncQueue,
  removeSyncQueueEntry,
  updateSyncQueueEntry,
  updateDraftOperation,
  updateDraftTarget,
  updateDraftSheet,
  updateDraftRow,
  getDraftOperation,
  getDraftTarget,
  getDraftSheet,
} from "./offlineStore";

export type SyncStatus = "idle" | "syncing" | "success" | "error";

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Map from local IDs → server IDs, built up as we process the queue in order.
 * This lets us resolve references like "create row in sheet local_xxx" even
 * when the sheet was also created offline in the same sync batch.
 */
const idMap = new Map<string, number>();

function resolveServerId(localId: string | undefined, serverId: number | undefined): number | null {
  if (serverId) return serverId;
  if (localId) {
    const mapped = idMap.get(localId);
    if (mapped) return mapped;
  }
  return null;
}

/**
 * Run the full sync queue.  Returns a summary of what was synced / failed.
 * Callers should invalidate tRPC caches after a successful sync.
 */
export async function runSync(): Promise<SyncResult> {
  const queue = await getSyncQueue();
  if (queue.length === 0) return { synced: 0, failed: 0, errors: [] };

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  // Pre-populate idMap from any drafts that were already partially synced
  // (e.g. app was closed mid-sync)
  for (const entry of queue) {
    const { action } = entry;
    if (action.type === "createOperation") {
      const draft = await getDraftOperation(action.localId);
      if (draft?.serverId) idMap.set(action.localId, draft.serverId);
    } else if (action.type === "createTarget") {
      const draft = await getDraftTarget(action.localId);
      if (draft?.serverId) idMap.set(action.localId, draft.serverId);
    } else if (action.type === "createSheet") {
      const draft = await getDraftSheet(action.localId);
      if (draft?.serverId) idMap.set(action.localId, draft.serverId);
    }
  }

  for (const entry of queue) {
    if (!entry.id) continue;

    // Skip if already mapped (previously synced in a prior attempt)
    const { action } = entry;
    if (
      (action.type === "createOperation" || action.type === "createTarget" ||
       action.type === "createSheet" || action.type === "createRow") &&
      idMap.has(action.localId)
    ) {
      await removeSyncQueueEntry(entry.id);
      synced++;
      continue;
    }

    try {
      await processSyncEntry(entry);
      await removeSyncQueueEntry(entry.id);
      synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[${action.type}] ${msg}`);
      failed++;
      await updateSyncQueueEntry(entry.id, {
        attempts: entry.attempts + 1,
        lastError: msg,
      });
    }
  }

  return { synced, failed, errors };
}

async function processSyncEntry(entry: { id?: number; action: import("./offlineStore").SyncAction }): Promise<void> {
  const { action } = entry;

  switch (action.type) {
    case "createOperation": {
      const { localId, payload } = action;
      const result = await trpcClient.operation.create.mutate({
        name: payload.name,
        promisNumber: payload.promisNumber,
        imsNumber: payload.imsNumber,
        investigationUnit: payload.investigationUnit,
      });
      idMap.set(localId, result.id);
      await updateDraftOperation(localId, { serverId: result.id, synced: true });
      break;
    }

    case "createTarget": {
      const { localId, payload } = action;
      // Targets are created via the registry endpoint — we just need a name
      // The operation link is handled separately by the sheet create step
      const result = await trpcClient.target.registry.create.mutate({
        name: payload.name,
        linkToOperationId: payload.operationServerId ?? (payload.operationLocalId ? idMap.get(payload.operationLocalId) : undefined),
      });
      idMap.set(localId, result.id);
      await updateDraftTarget(localId, { serverId: result.id, synced: true });
      break;
    }

    case "createSheet": {
      const { localId, payload } = action;
      const operationId = resolveServerId(payload.operationLocalId, payload.operationServerId);
      if (!operationId) throw new Error(`Cannot resolve operationId for sheet ${localId}`);

      const targetId = resolveServerId(payload.targetLocalId, payload.targetServerId) ?? undefined;

      const result = await trpcClient.sheet.create.mutate({
        operationId,
        title: payload.title,
        targetId: targetId ?? null,
        sheetCins: payload.sheetCins,
      });
      idMap.set(localId, result.id);
      await updateDraftSheet(localId, { serverId: result.id, synced: true });
      break;
    }

    case "createRow": {
      const { localId, payload } = action;
      const sheetId = resolveServerId(payload.sheetLocalId, payload.sheetServerId);
      if (!sheetId) throw new Error(`Cannot resolve sheetId for row ${localId}`);

      const result = await trpcClient.row.create.mutate({
        sheetId,
        time: payload.time,
        observation: payload.observation,
      });
      idMap.set(localId, result.id);
      await updateDraftRow(localId, { serverId: result.id, synced: true });

      // Add CIN members to the row
      for (const cin of payload.members ?? []) {
        try {
          await trpcClient.member.add.mutate({ rowId: result.id, memberName: cin });
        } catch {
          // Non-fatal — member might not exist on server
        }
      }
      break;
    }

    case "updateRow": {
      const { localId, payload } = action;
      const serverId = idMap.get(localId);
      if (!serverId) throw new Error(`Cannot resolve serverId for row update ${localId}`);
      await trpcClient.row.update.mutate({ id: serverId, ...payload });
      break;
    }

    case "deleteRow": {
      const { localId } = action;
      const serverId = idMap.get(localId);
      if (!serverId) {
        // Row was never synced — just remove from local store, nothing to delete on server
        return;
      }
      await trpcClient.row.delete.mutate({ id: serverId });
      break;
    }
  }
}
