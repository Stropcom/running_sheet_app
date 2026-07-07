/**
 * DraftHubPage.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * The offline draft hub — shows all locally saved drafts and lets the user
 * create new operations, sheets and rows while offline.
 *
 * This page is accessible from the sidebar at all times so users can:
 *   1. See what is saved locally
 *   2. Open a draft sheet to add rows
 *   3. Create new draft operations / sheets
 */

import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Plus,
  WifiOff,
  Wifi,
  ChevronRight,
  FileText,
  Building2,
  RefreshCw,
  Loader2,
  Home,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DraftBadge } from "@/components/DraftModeBanner";
import { useOffline } from "@/contexts/OfflineContext";
import {
  getDraftOperations,
  getDraftSheets,
  generateLocalId,
  saveDraftOperation,
  saveDraftSheet,
  enqueueSyncAction,
  type DraftOperation,
  type DraftSheet,
} from "@/lib/offlineStore";
import { toast } from "sonner";

export default function DraftHubPage() {
  const [, navigate] = useLocation();
  const { isOnline, isDraftMode, draftCounts, syncStatus, triggerSync, refreshDraftCounts } = useOffline();

  const [draftOps, setDraftOps] = useState<DraftOperation[]>([]);
  const [draftSheets, setDraftSheets] = useState<DraftSheet[]>([]);
  const [loading, setLoading] = useState(true);

  // New operation dialog
  const [showNewOp, setShowNewOp] = useState(false);
  const [newOpName, setNewOpName] = useState("");
  const [newOpPromis, setNewOpPromis] = useState("");
  const [savingOp, setSavingOp] = useState(false);

  // New sheet dialog
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState("");
  const [newSheetOpId, setNewSheetOpId] = useState<string>(""); // localId of selected op
  const [newSheetCins, setNewSheetCins] = useState("");
  const [savingSheet, setSavingSheet] = useState(false);

  const loadDrafts = useCallback(async () => {
    const [ops, sheets] = await Promise.all([getDraftOperations(), getDraftSheets()]);
    setDraftOps(ops.filter((o) => !o.synced));
    setDraftSheets(sheets.filter((s) => !s.synced));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts, draftCounts]);

  // ── Create draft operation ─────────────────────────────────────────────────
  const handleCreateOp = async () => {
    if (!newOpName.trim()) return;
    setSavingOp(true);
    try {
      const localId = generateLocalId();
      const draft: DraftOperation = {
        localId,
        name: newOpName.trim().toUpperCase(),
        promisNumber: newOpPromis.trim() || undefined,
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
          createdAt: draft.createdAt,
        },
      });
      await refreshDraftCounts();
      setShowNewOp(false);
      setNewOpName("");
      setNewOpPromis("");
      toast.success(`Operation "${draft.name}" saved as draft`);
      await loadDrafts();
    } finally {
      setSavingOp(false);
    }
  };

  // ── Create draft sheet ─────────────────────────────────────────────────────
  const handleCreateSheet = async () => {
    if (!newSheetTitle.trim()) return;
    setSavingSheet(true);
    try {
      const localId = generateLocalId();
      const cins = newSheetCins
        .split(/[,\s]+/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
        .map((cin) => ({ cin, hasImages: false, isAuthor: false }));

      const draft: DraftSheet = {
        localId,
        operationLocalId: newSheetOpId || undefined,
        title: newSheetTitle.trim(),
        sheetCins: cins,
        createdAt: Date.now(),
        synced: false,
      };
      await saveDraftSheet(draft);
      await enqueueSyncAction({
        type: "createSheet",
        localId,
        payload: {
          operationLocalId: draft.operationLocalId,
          title: draft.title,
          sheetCins: draft.sheetCins,
          createdAt: draft.createdAt,
        },
      });
      await refreshDraftCounts();
      setShowNewSheet(false);
      setNewSheetTitle("");
      setNewSheetCins("");
      setNewSheetOpId("");
      toast.success(`Sheet "${draft.title}" saved as draft`);
      // Navigate straight to the draft sheet editor
      navigate(`/draft/sheet/${localId}`);
    } finally {
      setSavingSheet(false);
    }
  };

  const totalDrafts = draftCounts.total;

  return (
    <DashboardLayout>
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} title="Go to Home">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
          <h1 className="text-xl font-bold">Draft Mode</h1>
          <p className="text-sm text-muted-foreground">
            {isDraftMode
              ? "You are offline. Data is saved locally and will sync when you reconnect."
              : "You are online. Draft items below are waiting to sync."}
          </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Badge variant="outline" className="gap-1 border-green-500 text-green-600">
              <Wifi className="h-3 w-3" />
              Online
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
              <WifiOff className="h-3 w-3" />
              Offline
            </Badge>
          )}
        </div>
      </div>

      {/* Sync button when online with pending drafts */}
      {isOnline && totalDrafts > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <div>
            <p className="font-medium text-blue-900 dark:text-blue-100">
              {totalDrafts} draft item{totalDrafts !== 1 ? "s" : ""} ready to sync
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Tap "Sync Now" to upload all drafts to the server.
            </p>
          </div>
          <Button
            onClick={triggerSync}
            disabled={syncStatus === "syncing"}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {syncStatus === "syncing" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync Now
          </Button>
        </div>
      )}

      {/* No drafts */}
      {!loading && totalDrafts === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            {isDraftMode
              ? "No drafts yet. Create an operation or running sheet below."
              : "No unsynced drafts. All data is on the server."}
          </p>
          {isOnline && (
            <Button onClick={() => navigate("/")} variant="outline" className="gap-2">
              <Home className="h-4 w-4" />
              Go to Home
            </Button>
          )}
        </div>
      )}

      {/* Draft Operations */}
      {draftOps.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Building2 className="h-4 w-4" />
            Draft Operations
          </h2>
          <div className="space-y-2">
            {draftOps.map((op) => (
              <div
                key={op.localId}
                className="flex items-center justify-between rounded-lg border bg-card p-3"
              >
                <div>
                  <p className="font-medium">{op.name}</p>
                  {op.promisNumber && (
                    <p className="text-xs text-muted-foreground">PROMIS: {op.promisNumber}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(op.createdAt).toLocaleString()}
                  </p>
                </div>
                <DraftBadge />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Draft Sheets */}
      {draftSheets.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-4 w-4" />
            Draft Running Sheets
          </h2>
          <div className="space-y-2">
            {draftSheets.map((sheet) => (
              <button
                key={sheet.localId}
                className="flex w-full items-center justify-between rounded-lg border bg-card p-3 text-left hover:bg-muted/40 transition-colors"
                onClick={() => navigate(`/draft/sheet/${sheet.localId}`)}
              >
                <div>
                  <p className="font-medium">{sheet.title}</p>
                  {sheet.sheetCins.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Team: {sheet.sheetCins.map((c) => c.cin).join(", ")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(sheet.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <DraftBadge />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="flex-1"
          variant="outline"
          onClick={() => setShowNewOp(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Draft Operation
        </Button>
        <Button
          className="flex-1"
          onClick={() => setShowNewSheet(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Draft Running Sheet
        </Button>
      </div>

      {/* ── New Operation Dialog ── */}
      <Dialog open={showNewOp} onOpenChange={setShowNewOp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Draft Operation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Operation Name *</label>
              <Input
                placeholder="e.g. STILLWATER"
                value={newOpName}
                onChange={(e) => setNewOpName(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleCreateOp()}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">PROMIS Number</label>
              <Input
                placeholder="Optional"
                value={newOpPromis}
                onChange={(e) => setNewOpPromis(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewOp(false)}>Cancel</Button>
            <Button onClick={handleCreateOp} disabled={!newOpName.trim() || savingOp}>
              {savingOp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Sheet Dialog ── */}
      <Dialog open={showNewSheet} onOpenChange={setShowNewSheet}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Draft Running Sheet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Sheet Title *</label>
              <Input
                placeholder="e.g. 20260706 - STILLWATER (JAMES)"
                value={newSheetTitle}
                onChange={(e) => setNewSheetTitle(e.target.value)}
              />
            </div>
            {draftOps.length > 0 && (
              <div>
                <label className="mb-1 block text-sm font-medium">Link to Draft Operation</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={newSheetOpId}
                  onChange={(e) => setNewSheetOpId(e.target.value)}
                >
                  <option value="">— None —</option>
                  {draftOps.map((op) => (
                    <option key={op.localId} value={op.localId}>
                      {op.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium">Team CINs</label>
              <Input
                placeholder="e.g. 459, 503, 490"
                value={newSheetCins}
                onChange={(e) => setNewSheetCins(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">Comma or space separated</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewSheet(false)}>Cancel</Button>
            <Button onClick={handleCreateSheet} disabled={!newSheetTitle.trim() || savingSheet}>
              {savingSheet ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create &amp; Open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
