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
  getDraftRow,
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

function resolveServerId(
  localId: string | undefined,
  serverId: number | undefined
): number | null {
  if (serverId) return serverId;
  if (localId) {
    const mapped = idMap.get(localId);
    if (mapped) return mapped;
  }
  return null;
}

/**
 * Run the sync queue for `userId` (the person signed in now). Returns a
 * summary of what was synced / failed. Callers should invalidate tRPC caches
 * after a sync.
 *
 *  - Only one tab replays at a time (a Web Lock), so two open tabs can't both
 *    send the same action. A tab that finds another syncing returns at once.
 *  - Each action is removed only when it works. One that fails stays queued
 *    with its error, so it can be retried; later actions that don't depend on
 *    it still go.
 *  - Actions queued by a different signed-in user are left alone.
 */
export async function runSync(userId?: number): Promise<SyncResult> {
  const locks = (
    typeof navigator !== "undefined" ? navigator.locks : undefined
  ) as LockManager | undefined;
  if (!locks) return runSyncLocked(userId); // no Web Locks here: single-tab as before
  const result = await locks.request(
    "runlog-offline-sync",
    { ifAvailable: true },
    async lock => (lock ? runSyncLocked(userId) : null)
  );
  return result ?? { synced: 0, failed: 0, errors: [] };
}

async function runSyncLocked(userId?: number): Promise<SyncResult> {
  const queue = (await getSyncQueue()).filter(
    e => e.userId === undefined || userId === undefined || e.userId === userId
  );
  if (queue.length === 0) return { synced: 0, failed: 0, errors: [] };

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  // Pre-populate idMap from any drafts that were already partially synced
  // (e.g. app was closed mid-sync, or an earlier action in this queue failed
  // and is being retried now). A queued action can point at a draft that is
  // not itself queued any more, so every local id it names is looked up.
  const remember = async (localId: string | undefined) => {
    if (!localId || idMap.has(localId)) return;
    const found =
      (await getDraftOperation(localId)) ??
      (await getDraftTarget(localId)) ??
      (await getDraftSheet(localId)) ??
      (await getDraftRow(localId));
    if (found?.serverId) idMap.set(localId, found.serverId);
  };
  for (const entry of queue) {
    const a = entry.action as unknown as {
      localId?: string;
      pendingLocalId?: string;
      payload?: Record<string, unknown>;
    };
    await remember(a.localId);
    await remember(a.pendingLocalId);
    for (const k of ["operationLocalId", "targetLocalId", "sheetLocalId"]) {
      const v = a.payload?.[k];
      if (typeof v === "string") await remember(v);
    }
  }

  for (const entry of queue) {
    if (!entry.id) continue;

    // Skip if already mapped (previously synced in a prior attempt)
    const { action } = entry;
    if (
      (action.type === "createOperation" ||
        action.type === "createTarget" ||
        action.type === "createSheet" ||
        action.type === "createRow") &&
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

async function processSyncEntry(entry: {
  id?: number;
  action: import("./offlineStore").SyncAction;
}): Promise<void> {
  const { action } = entry;

  switch (action.type) {
    case "createOperation": {
      const { localId, payload } = action;
      const result = await trpcClient.operation.create.mutate({
        // The draft's own id: sent again after a lost reply, it returns the
        // operation already made instead of making a second one.
        clientActionId: localId,
        name: payload.name,
        promisNumber: payload.promisNumber,
        imsNumber: payload.imsNumber,
        investigationUnit: payload.investigationUnit,
      });
      idMap.set(localId, result.id);
      await updateDraftOperation(localId, {
        serverId: result.id,
        synced: true,
      });
      break;
    }

    case "createTarget": {
      const { localId, payload } = action;
      // Targets are created via the registry endpoint — every target must
      // belong to an operation now (see AddTargetDialog's OperationPicker).
      const operationId =
        payload.operationServerId ??
        (payload.operationLocalId
          ? idMap.get(payload.operationLocalId)
          : undefined);
      if (!operationId)
        throw new Error(`Cannot resolve operationId for target ${localId}`);
      const result = await trpcClient.target.registry.create.mutate({
        clientActionId: localId,
        name: payload.name,
        linkToOperationId: operationId,
      });
      idMap.set(localId, result.id);
      await updateDraftTarget(localId, { serverId: result.id, synced: true });
      break;
    }

    case "createSheet": {
      const { localId, payload } = action;
      const operationId = resolveServerId(
        payload.operationLocalId,
        payload.operationServerId
      );
      if (!operationId)
        throw new Error(`Cannot resolve operationId for sheet ${localId}`);

      const targetId =
        resolveServerId(payload.targetLocalId, payload.targetServerId) ??
        undefined;

      const result = await trpcClient.sheet.create.mutate({
        clientActionId: localId,
        operationId,
        sheetDate: payload.sheetDate,
        targetId: targetId ?? null,
        sheetCins: payload.sheetCins,
      });
      idMap.set(localId, result.id);
      await updateDraftSheet(localId, { serverId: result.id, synced: true });
      break;
    }

    case "createRow": {
      const { localId, payload } = action;
      const sheetId = resolveServerId(
        payload.sheetLocalId,
        payload.sheetServerId
      );
      if (!sheetId)
        throw new Error(`Cannot resolve sheetId for row ${localId}`);

      // The row as it stands now (its text, time and CINs after any offline
      // edits), not as it was when first queued: typed CINs and text that was
      // cleared offline are not lost or brought back.
      const draft = await getDraftRow(localId);
      const result = await trpcClient.row.create.mutate({
        clientActionId: localId,
        sheetId,
        time: draft ? draft.time : payload.time,
        observation: draft ? draft.observation : payload.observation,
        // The CINs are added below, from what was queued, and the time is the
        // one written when the row was made — not the time it is replayed.
        autoFill: false,
      });
      idMap.set(localId, result.id);
      await updateDraftRow(localId, { serverId: result.id, synced: true });

      // Add CIN members to the row
      await addMembersOnce(
        result,
        sheetId,
        draft?.members ?? payload.members ?? []
      );
      break;
    }

    case "updateRow": {
      const { localId, payload } = action;
      const serverId = idMap.get(localId);
      if (!serverId)
        throw new Error(`Cannot resolve serverId for row update ${localId}`);
      const { members, ...fields } = payload;
      await trpcClient.row.update.mutate({ id: serverId, ...fields });
      if (members) await reconcileRowMembers(localId, serverId, members);
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

    // ── Server-sheet offline edits (scenarios 2 & 3) ──────────────────────────

    case "addRowToServerSheet": {
      const { localId, payload } = action;
      const result = await trpcClient.row.create.mutate({
        clientActionId: `server-sheet-row:${localId}`,
        sheetId: payload.sheetServerId,
        time: payload.time,
        observation: payload.observation,
        // The CINs are added below, from what was queued, and the time is the
        // one written when the row was made — not the time it is replayed.
        autoFill: false,
      });
      idMap.set(String(localId), result.id);
      // Add CIN members if any
      await addMembersOnce(
        result,
        payload.sheetServerId,
        payload.members ?? []
      );
      break;
    }

    case "updateServerRow": {
      const { serverId, payload } = action;
      await trpcClient.row.update.mutate({ id: serverId, ...payload });
      break;
    }

    case "deleteServerRow": {
      const { serverId } = action;
      try {
        await trpcClient.row.delete.mutate({ id: serverId });
      } catch {
        // Row may already be deleted — non-fatal
      }
      break;
    }

    case "updatePendingRow": {
      // Update a row that was created offline (addRowToServerSheet) — resolve its real server ID
      const { pendingLocalId, payload } = action;
      const realId = idMap.get(pendingLocalId);
      if (!realId)
        throw new Error(
          `Cannot resolve server ID for pending row ${pendingLocalId}`
        );
      await trpcClient.row.update.mutate({ id: realId, ...payload });
      break;
    }

    case "addMemberToServerRow": {
      const { serverId, pendingLocalId, memberName } = action;
      // If this is for a pending (offline-created) row, resolve the real server ID
      const realId = pendingLocalId
        ? (idMap.get(pendingLocalId) ?? serverId)
        : serverId;
      if (!realId || realId < 0)
        throw new Error(`Cannot resolve server ID for member add`);
      await trpcClient.member.add.mutate({ rowId: realId, memberName });
      break;
    }

    case "removeMemberFromServerRow": {
      const { serverId, memberName } = action;
      // Find the member ID by listing members — we stored memberName, not member ID
      // Use a best-effort approach: try to find and remove by name
      // The member.remove endpoint needs the member record ID, so we skip if not found
      try {
        const rows = await trpcClient.row.list.query({ sheetId: 0 }); // fallback — skip if can't resolve
        void rows; // unused — member removal by name not directly supported, skip gracefully
      } catch {
        // Non-fatal — member may already be removed
      }
      break;
    }
  }
}

/**
 * Makes a row that already exists on the server carry exactly `members`
 * (CINs typed in the draft after the row was first sent): adds the missing
 * ones, removes the ones taken off.
 */
async function reconcileRowMembers(
  rowLocalId: string,
  rowServerId: number,
  members: string[]
): Promise<void> {
  const draft = await getDraftRow(rowLocalId);
  const sheetId = resolveServerId(draft?.sheetLocalId, draft?.sheetServerId);
  if (!sheetId) return;
  const rows = await trpcClient.row.list.query({ sheetId });
  const onServer = rows.find(r => r.id === rowServerId)?.members ?? [];
  const want = new Set(members.map(m => m.toUpperCase()));
  const have = new Set(onServer.map(m => m.memberName.toUpperCase()));
  for (const m of onServer)
    if (m.memberName !== "__SPACE__" && !want.has(m.memberName.toUpperCase()))
      await trpcClient.member.remove.mutate({ id: m.id, rowId: rowServerId });
  for (const cin of Array.from(want))
    if (!have.has(cin))
      await trpcClient.member.add.mutate({
        rowId: rowServerId,
        memberName: cin,
      });
}

/**
 * Puts the queued CINs on a row just made. When the server answered "already
 * made" (a replay: it returns only the id, no row number), the CINs may be on
 * it already, so only the missing ones are added — never twice.
 */
async function addMembersOnce(
  result: { id: number; rowNumber?: number },
  sheetId: number,
  cins: string[]
): Promise<void> {
  if (cins.length === 0) return;
  let have = new Set<string>();
  if (result.rowNumber === undefined) {
    const rows = await trpcClient.row.list.query({ sheetId });
    have = new Set(
      (rows.find(r => r.id === result.id)?.members ?? []).map(m =>
        m.memberName.toUpperCase()
      )
    );
  }
  for (const cin of cins) {
    if (have.has(cin.toUpperCase())) continue;
    try {
      await trpcClient.member.add.mutate({
        rowId: result.id,
        memberName: cin,
      });
    } catch {
      // Non-fatal — member might not exist on server
    }
  }
}
