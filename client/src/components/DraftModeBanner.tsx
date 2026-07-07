/**
 * DraftModeBanner.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Sticky banner shown at the top of the app when:
 *   - Device is offline  → amber "Draft Mode" banner
 *   - Syncing            → blue "Syncing…" banner
 *   - Sync complete      → green "All synced ✓" banner (auto-hides after 4s)
 *   - Sync error         → red error banner
 */

import { useOffline } from "@/contexts/OfflineContext";
import { Button } from "@/components/ui/button";
import { Loader2, WifiOff, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

export function DraftModeBanner() {
  const { isOnline, isDraftMode, draftCounts, syncStatus, syncResult, triggerSync } = useOffline();

  // Nothing to show when online and idle with no drafts
  if (isOnline && syncStatus === "idle" && draftCounts.total === 0) return null;

  // ── Syncing ────────────────────────────────────────────────────────────────
  if (syncStatus === "syncing") {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-md">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Syncing draft data to server…</span>
      </div>
    );
  }

  // ── Sync success ───────────────────────────────────────────────────────────
  if (syncStatus === "success" && syncResult) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-md">
        <CheckCircle2 className="h-4 w-4" />
        <span>
          All synced — {syncResult.synced} item{syncResult.synced !== 1 ? "s" : ""} uploaded successfully.
        </span>
      </div>
    );
  }

  // ── Sync error ─────────────────────────────────────────────────────────────
  if (syncStatus === "error" && syncResult) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-md">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            Sync error — {syncResult.failed} item{syncResult.failed !== 1 ? "s" : ""} failed.{" "}
            {syncResult.errors[0] && <span className="opacity-80">{syncResult.errors[0]}</span>}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-white/40 bg-transparent text-white hover:bg-white/20"
          onClick={triggerSync}
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Retry
        </Button>
      </div>
    );
  }

  // ── Online but has unsynced drafts (e.g. sync pending) ────────────────────
  if (isOnline && draftCounts.total > 0 && syncStatus === "idle") {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-md">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          <span>
            {draftCounts.total} unsync{draftCounts.total !== 1 ? "ed" : "ed"} draft item{draftCounts.total !== 1 ? "s" : ""} ready to upload.
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-white/40 bg-transparent text-white hover:bg-white/20"
          onClick={triggerSync}
        >
          Sync now
        </Button>
      </div>
    );
  }

  // ── Offline / Draft Mode ───────────────────────────────────────────────────
  if (isDraftMode) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-md">
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>
            <strong>Draft Mode</strong> — No internet connection.
            {draftCounts.total > 0 && (
              <span className="ml-1 opacity-90">
                {draftCounts.total} draft item{draftCounts.total !== 1 ? "s" : ""} saved locally.
              </span>
            )}
          </span>
        </div>
        <span className="shrink-0 rounded bg-amber-600/60 px-2 py-0.5 text-xs">
          Will sync automatically when online
        </span>
      </div>
    );
  }

  return null;
}

/**
 * Small inline badge used on list items to indicate a draft (unsynced) entry.
 */
export function DraftBadge({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 ${className ?? ""}`}
    >
      <WifiOff className="h-3 w-3" />
      Draft
    </span>
  );
}
