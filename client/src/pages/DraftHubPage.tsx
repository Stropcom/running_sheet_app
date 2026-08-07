/**
 * DraftHubPage.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * The offline draft hub — shows all locally saved drafts and lets the user
 * create new operations, sheets and rows while offline.
 *
 * Key rule: a running sheet MUST always be linked to an operation.
 *   - If the user has draft (offline-created) operations, they can pick one.
 *   - If the device has a cached list of server operations, they can pick one.
 *   - If neither is available, the "New Draft Running Sheet" button is disabled
 *     with a tooltip explaining they must create a draft operation first.
 *
 * This prevents the sync engine from hitting the
 * "Cannot resolve operationId for sheet" error that leaves the sync banner
 * permanently stuck at the top of the page.
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
  AlertCircle,
  Trash2,
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DraftBadge } from "@/components/DraftModeBanner";
import { useOffline } from "@/contexts/OfflineContext";
import {
  getDraftOperations,
  getDraftSheets,
  generateLocalId,
  saveDraftOperation,
  saveDraftSheet,
  enqueueSyncAction,
  getOperationsListCache,
  discardDraftSheet,
  type DraftOperation,
  type DraftSheet,
  type CachedOperationSummary,
} from "@/lib/offlineStore";
import { toast } from "sonner";
import { buildRunningSheetTitle } from "@shared/runningSheetTitle";

// ── Unified option type used in the operation picker ──────────────────────────
type OperationOption =
  | { kind: "draft"; localId: string; name: string }
  | { kind: "server"; serverId: number; name: string };

export default function DraftHubPage() {
  const [, navigate] = useLocation();
  const { isOnline, isDraftMode, draftCounts, syncStatus, triggerSync, refreshDraftCounts } = useOffline();

  const [draftOps, setDraftOps] = useState<DraftOperation[]>([]);
  const [draftSheets, setDraftSheets] = useState<DraftSheet[]>([]);
  const [cachedServerOps, setCachedServerOps] = useState<CachedOperationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // New operation dialog
  const [showNewOp, setShowNewOp] = useState(false);
  const [newOpName, setNewOpName] = useState("");
  const [newOpPromis, setNewOpPromis] = useState("");
  const [savingOp, setSavingOp] = useState(false);

  // Discard confirmation
  const [discardTarget, setDiscardTarget] = useState<DraftSheet | null>(null);

  const handleDiscardSheet = async (sheet: DraftSheet) => {
    await discardDraftSheet(sheet.localId);
    await refreshDraftCounts();
    await loadDrafts();
    toast.success(`Draft "${sheet.title}" discarded`);
    setDiscardTarget(null);
  };

  // New sheet dialog
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [newSheetDate, setNewSheetDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [newSheetOpKey, setNewSheetOpKey] = useState<string>(""); // "draft:<localId>" or "server:<id>"
  const [newSheetCins, setNewSheetCins] = useState("");
  const [savingSheet, setSavingSheet] = useState(false);

  const loadDrafts = useCallback(async () => {
    const [ops, sheets, cached] = await Promise.all([
      getDraftOperations(),
      getDraftSheets(),
      getOperationsListCache(),
    ]);
    setDraftOps(ops.filter((o) => !o.synced));
    setDraftSheets(sheets.filter((s) => !s.synced));
    setCachedServerOps(cached ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts, draftCounts]);

  // ── Build the unified options list for the operation picker ──────────────────
  const operationOptions: OperationOption[] = [
    ...draftOps.map((op) => ({ kind: "draft" as const, localId: op.localId, name: op.name })),
    ...cachedServerOps.map((op) => ({ kind: "server" as const, serverId: op.id, name: op.name })),
  ];

  const hasOperations = operationOptions.length > 0;

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
  const newSheetOpName =
    draftOps.find(op => `draft:${op.localId}` === newSheetOpKey)?.name ??
    cachedServerOps.find(op => `server:${op.id}` === newSheetOpKey)?.name ??
    null;
  const newSheetTitlePreview = buildRunningSheetTitle({
    sheetDate: newSheetDate || null,
    operationName: newSheetOpName ?? "…",
  });

  const handleCreateSheet = async () => {
    if (!newSheetDate || !newSheetOpKey) return;
    setSavingSheet(true);
    try {
      const localId = generateLocalId();
      const cins = newSheetCins
        .split(/[,\s]+/)
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean)
        .map((cin) => ({ cin, hasImages: false, isAuthor: false }));

      // Resolve whether this is a draft op (localId) or a cached server op (serverId)
      let operationLocalId: string | undefined;
      let operationServerId: number | undefined;

      if (newSheetOpKey.startsWith("draft:")) {
        operationLocalId = newSheetOpKey.slice("draft:".length);
      } else if (newSheetOpKey.startsWith("server:")) {
        operationServerId = Number(newSheetOpKey.slice("server:".length));
      }

      const draft: DraftSheet = {
        localId,
        operationLocalId,
        operationServerId,
        sheetDate: newSheetDate,
        // Local-only placeholder — the real title is generated server-side
        // once this draft syncs and the operation/author are resolved.
        title: newSheetTitlePreview,
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
          operationServerId: draft.operationServerId,
          sheetDate: draft.sheetDate,
          title: draft.title,
          sheetCins: draft.sheetCins,
          createdAt: draft.createdAt,
        },
      });
      await refreshDraftCounts();
      setShowNewSheet(false);
      setNewSheetDate(new Date().toISOString().slice(0, 10));
      setNewSheetCins("");
      setNewSheetOpKey("");
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
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <DraftBadge />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Discard this draft"
                    onClick={(e) => { e.stopPropagation(); setDiscardTarget(sheet); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
        <div className="flex-1 flex flex-col gap-1">
          <Button
            className="w-full"
            onClick={() => setShowNewSheet(true)}
            disabled={!hasOperations}
            title={!hasOperations ? "Create a draft operation first, or go online so existing operations are available." : undefined}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Draft Running Sheet
          </Button>
          {!hasOperations && (
            <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-3 w-3 shrink-0" />
              Create a draft operation first (or go online to load existing ones).
            </p>
          )}
        </div>
      </div>

      {/* ── Discard Confirmation Dialog ── */}
      <AlertDialog open={!!discardTarget} onOpenChange={(open) => { if (!open) setDiscardTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Draft Running Sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the draft &ldquo;{discardTarget?.title}&rdquo; and all its rows from this device.
              {discardTarget && !discardTarget.operationLocalId && !discardTarget.operationServerId && (
                <span className="mt-2 block font-medium text-amber-600 dark:text-amber-400">
                  This sheet has no linked operation and cannot sync — discarding it will clear the sync error.
                </span>
              )}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => discardTarget && handleDiscardSheet(discardTarget)}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <DialogDescription>
              A running sheet must always be linked to an operation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Operation picker — required */}
            <div>
              <label className="mb-1 block text-sm font-medium">
                Operation <span className="text-red-500">*</span>
              </label>
              <Select value={newSheetOpKey} onValueChange={setNewSheetOpKey}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an operation…" />
                </SelectTrigger>
                <SelectContent>
                  {draftOps.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Draft (offline)
                      </div>
                      {draftOps.map((op) => (
                        <SelectItem key={`draft:${op.localId}`} value={`draft:${op.localId}`}>
                          {op.name}
                          <span className="ml-2 text-xs text-amber-600">(draft)</span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {cachedServerOps.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Existing operations
                      </div>
                      {cachedServerOps.map((op) => (
                        <SelectItem key={`server:${op.id}`} value={`server:${op.id}`}>
                          {op.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Date <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={newSheetDate}
                onChange={(e) => setNewSheetDate(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground font-mono truncate">
                {newSheetTitlePreview}
              </p>
            </div>
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
            <Button
              onClick={handleCreateSheet}
              disabled={!newSheetDate || !newSheetOpKey || savingSheet}
            >
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
