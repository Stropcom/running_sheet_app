/**
 * OfflineContext.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Provides:
 *   isOnline       – current network status
 *   isDraftMode    – true when offline (alias for !isOnline)
 *   draftCounts    – number of unsynced drafts per entity type
 *   syncStatus     – idle | syncing | success | error
 *   syncResult     – last sync summary
 *   triggerSync    – manually kick off a sync
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getDraftCounts,
  clearSyncedDrafts,
  setOfflineUser,
} from "@/lib/offlineStore";
import { applyDataEpoch } from "@/lib/dataEpoch";
import { rememberLastOfficer } from "@shared/offlineReopen";
import { runSync, type SyncResult, type SyncStatus } from "@/lib/offlineSync";
import { trpc } from "@/lib/trpc";

interface DraftCounts {
  operations: number;
  targets: number;
  sheets: number;
  rows: number;
  total: number;
}

interface OfflineContextValue {
  isOnline: boolean;
  isDraftMode: boolean;
  draftCounts: DraftCounts;
  syncStatus: SyncStatus;
  syncResult: SyncResult | null;
  triggerSync: () => Promise<void>;
  refreshDraftCounts: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [draftCounts, setDraftCounts] = useState<DraftCounts>({
    operations: 0,
    targets: 0,
    sheets: 0,
    rows: 0,
    total: 0,
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const syncingRef = useRef(false);

  const utils = trpc.useUtils();

  // Who is signed in — nothing is sent until the server has said, so work
  // typed under one account is never sent as another, and drafts of zeroed
  // data are dropped first (see lib/dataEpoch.ts).
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const meUser = me.data as
    | {
        id: number;
        cin?: string | null;
        name?: string | null;
        dataEpoch?: number;
      }
    | null
    | undefined;
  const signedInId = meUser?.id;
  useEffect(() => {
    setOfflineUser(signedInId);
    // Remember who it was, so a later offline reopen can show their drafts.
    if (meUser?.id && meUser.cin)
      rememberLastOfficer({
        id: meUser.id,
        cin: meUser.cin,
        name: meUser.name,
      });
  }, [signedInId, meUser?.cin, meUser?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshDraftCounts = useCallback(async () => {
    const counts = await getDraftCounts();
    setDraftCounts(counts);
  }, []);

  // ── Network listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ── Load draft counts on mount ─────────────────────────────────────────────
  useEffect(() => {
    refreshDraftCounts();
  }, [refreshDraftCounts]);

  // ── Auto-sync when coming back online ─────────────────────────────────────
  const triggerSync = useCallback(async () => {
    if (syncingRef.current) return;
    // Wait for the server to say who is signed in.
    if (signedInId === undefined) return;
    const counts = await getDraftCounts();
    if (counts.total === 0) return;

    syncingRef.current = true;
    try {
      // The data may have been zeroed since these drafts were written: that
      // check comes first, and if it dropped them nothing is sent.
      if (meUser?.dataEpoch && (await applyDataEpoch(meUser.dataEpoch))) return;
      setSyncStatus("syncing");
      const result = await runSync(signedInId);
      setSyncResult(result);
      // Nothing was sent (another tab is syncing, or nothing of this
      // account's was waiting): say nothing.
      setSyncStatus(
        result.failed > 0 ? "error" : result.synced === 0 ? "idle" : "success"
      );

      // Invalidate all tRPC caches so the UI reflects the newly synced data
      await utils.operation.list?.invalidate?.();
      await utils.sheet.list?.invalidate?.();
      await utils.row.list?.invalidate?.();

      // Remove synced drafts from IndexedDB so counts drop to 0
      await clearSyncedDrafts();
      await refreshDraftCounts();

      // A clean sync clears its message after 4 seconds. A sync with failures
      // keeps its message (and Retry) until the failed items go through.
      if (result.failed === 0)
        setTimeout(() => {
          setSyncStatus("idle");
          setSyncResult(null);
        }, 4000);
    } catch (err) {
      setSyncResult({ synced: 0, failed: 1, errors: [String(err)] });
      setSyncStatus("error");
    } finally {
      syncingRef.current = false;
    }
  }, [utils, refreshDraftCounts, signedInId, meUser?.dataEpoch]);

  useEffect(() => {
    if (isOnline) {
      triggerSync();
    }
  }, [isOnline, triggerSync]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isDraftMode: !isOnline,
        draftCounts,
        syncStatus,
        syncResult,
        triggerSync,
        refreshDraftCounts,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline(): OfflineContextValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline must be used within OfflineProvider");
  return ctx;
}
