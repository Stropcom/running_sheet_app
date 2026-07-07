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
import { getDraftCounts } from "@/lib/offlineStore";
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
    const counts = await getDraftCounts();
    if (counts.total === 0) return;

    syncingRef.current = true;
    setSyncStatus("syncing");
    try {
      const result = await runSync();
      setSyncResult(result);
      setSyncStatus(result.failed > 0 ? "error" : "success");

      // Invalidate all tRPC caches so the UI reflects the newly synced data
      await utils.operation.list?.invalidate?.();
      await utils.sheet.list?.invalidate?.();
      await utils.row.list?.invalidate?.();

      // Refresh draft counts (synced items are marked, queue is cleared)
      await refreshDraftCounts();

      // Reset status after 4 seconds
      setTimeout(() => setSyncStatus("idle"), 4000);
    } catch (err) {
      setSyncResult({ synced: 0, failed: 1, errors: [String(err)] });
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 6000);
    } finally {
      syncingRef.current = false;
    }
  }, [utils, refreshDraftCounts]);

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
