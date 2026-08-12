import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
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
import { Trash2, RotateCcw, FolderOpen, FileText, User, MapPin, Calendar, Camera, AlertTriangle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useViewMode } from "@/contexts/ViewModeContext";

type RecycleBinItem = {
  id: number;
  type: "operation" | "sheet" | "target" | "map_marker" | "attachment";
  label: string;
  sublabel?: string;
  deletedAt: number;
  deletedByCIN: string | null;
  expiresAt: number;
};

function typeIcon(type: RecycleBinItem["type"]) {
  if (type === "operation") return <FolderOpen className="w-5 h-5 text-blue-500" />;
  if (type === "sheet") return <FileText className="w-5 h-5 text-teal-500" />;
  if (type === "map_marker") return <MapPin className="w-5 h-5 text-orange-500" />;
  if (type === "attachment") return <Camera className="w-5 h-5 text-pink-500" />;
  return <User className="w-5 h-5 text-purple-500" />;
}

function typeLabel(type: RecycleBinItem["type"]) {
  if (type === "operation") return "Operation";
  if (type === "sheet") return "Running Sheet";
  if (type === "map_marker") return "Map Marker";
  if (type === "attachment") return "Photo";
  return "Target";
}

function typeBadgeClass(type: RecycleBinItem["type"]) {
  if (type === "operation") return "bg-blue-100 text-blue-700 border-blue-200";
  if (type === "sheet") return "bg-teal-100 text-teal-700 border-teal-200";
  if (type === "map_marker") return "bg-orange-100 text-orange-700 border-orange-200";
  if (type === "attachment") return "bg-pink-100 text-pink-700 border-pink-200";
  return "bg-purple-100 text-purple-700 border-purple-200";
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysRemaining(expiresAt: number) {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default function RecycleBin() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { viewMode } = useViewMode();

  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.recycleBin.list.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });

  // ── Reinstate ────────────────────────────────────────────────────────────────
  const reinstateMutation = trpc.recycleBin.reinstate.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(`${typeLabel(variables.type)} reinstated successfully.`);
      utils.recycleBin.list.invalidate();
      if (variables.type === "operation") utils.operation.list.invalidate();
      if (variables.type === "sheet") utils.sheet.list.invalidate();
      if (variables.type === "target") utils.target.registry.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to reinstate item.");
    },
  });

  const [reinstating, setReinstating] = useState<number | null>(null);

  async function handleReinstate(item: RecycleBinItem) {
    setReinstating(item.id);
    await reinstateMutation.mutateAsync({ type: item.type, id: item.id });
    setReinstating(null);
  }

  // ── Permanent delete ─────────────────────────────────────────────────────────
  const hardDeleteMutation = trpc.recycleBin.hardDelete.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(`${typeLabel(variables.type)} permanently deleted.`);
      utils.recycleBin.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to permanently delete item.");
    },
  });

  const [confirmItem, setConfirmItem] = useState<RecycleBinItem | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  async function handleHardDelete() {
    if (!confirmItem) return;
    setDeleting(confirmItem.id);
    setConfirmItem(null);
    await hardDeleteMutation.mutateAsync({ type: confirmItem.type, id: confirmItem.id });
    setDeleting(null);
  }

  // ── Orphaned photos — attachments left behind by an operation/sheet that
  // was deleted before cascade-deleting attachments was wired up. Bypasses
  // the normal 7-day grace period since these were already "deleted" along
  // with their (now gone) operation. ─────────────────────────────────────
  const { data: orphanedAttachments, isLoading: orphansLoading } =
    trpc.adminUtils.getOrphanedAttachments.useQuery(undefined, {
      enabled: isAdmin,
    });
  const purgeOrphansMutation = trpc.adminUtils.purgeOrphanedAttachments.useMutation({
    onSuccess: (data) => {
      toast.success(`Purged ${data.purged} orphaned photo${data.purged === 1 ? "" : "s"}.`);
      utils.adminUtils.getOrphanedAttachments.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Failed to purge orphaned photos.");
    },
  });
  const [confirmPurgeOrphans, setConfirmPurgeOrphans] = useState(false);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Trash2 className="w-6 h-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight flex-1">Recycle Bin</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Deleted items are kept for <strong>7 days</strong> before being permanently removed.
          Use <strong>Reinstate</strong> to restore an item to its original location.
          {isAdmin && (
            <span> Admins can also <strong>permanently delete</strong> items immediately.</span>
          )}
        </p>

        {/* Orphaned photos — admin only */}
        {isAdmin && !orphansLoading && orphanedAttachments && orphanedAttachments.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3 mb-6">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {orphanedAttachments.length} orphaned photo{orphanedAttachments.length !== 1 ? "s" : ""} found
              </p>
              <p className="text-xs text-amber-700/90 dark:text-amber-400/80 mt-0.5">
                Left behind by an operation deleted before its photos were deleted with it — not visible anywhere in the app, but still taking up storage. Safe to purge permanently now.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-amber-400 text-amber-800 hover:bg-amber-100 shrink-0"
              disabled={purgeOrphansMutation.isPending}
              onClick={() => setConfirmPurgeOrphans(true)}
            >
              {purgeOrphansMutation.isPending ? (
                <Spinner className="w-3.5 h-3.5" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Purge All
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner className="w-8 h-8" />
          </div>
        )}

        {!isLoading && (!items || items.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-3">
            <Trash2 className="w-12 h-12 opacity-20" />
            <p className="text-lg font-medium">Recycle Bin is empty</p>
            <p className="text-sm">Deleted operations, running sheets, targets, and map markers will appear here.</p>
          </div>
        )}

        {!isLoading && items && items.length > 0 && viewMode === "tile" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => {
              const days = daysRemaining(item.expiresAt);
              const isExpiringSoon = days <= 1;
              const isActing = reinstating === item.id || deleting === item.id;
              return (
                <div
                  key={`${item.type}-${item.id}`}
                  className={`flex flex-col gap-3 p-5 rounded-xl border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 ${
                    isExpiringSoon ? "border-red-400/50 bg-red-50/10" : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="shrink-0">{typeIcon(item.type)}</div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${typeBadgeClass(item.type)}`}>
                      {typeLabel(item.type)}
                    </span>
                  </div>
                  <p className="font-semibold text-sm text-foreground leading-tight line-clamp-2">{item.label}</p>
                  {item.sublabel && (
                    <p className="text-xs text-muted-foreground">{item.sublabel}</p>
                  )}
                  <div className="flex items-center gap-1 text-xs mt-auto">
                    <Calendar className="w-3 h-3 shrink-0 text-muted-foreground" />
                    <span className={isExpiringSoon ? "text-red-500 font-medium" : "text-muted-foreground"}>
                      {days === 0 ? "Expires today" : `${days}d remaining`}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm"
                      className="gap-1 text-xs h-7 border-blue-300 text-blue-700 hover:bg-blue-50"
                      disabled={isActing} onClick={() => handleReinstate(item)}>
                      {reinstating === item.id ? <Spinner className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                      Reinstate
                    </Button>
                    {isAdmin && (
                      <Button variant="outline" size="sm"
                        className="gap-1 text-xs h-7 border-red-300 text-red-700 hover:bg-red-50"
                        disabled={isActing} onClick={() => setConfirmItem(item)}>
                        {deleting === item.id ? <Spinner className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && items && items.length > 0 && viewMode === "folder" && (
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const days = daysRemaining(item.expiresAt);
              const isExpiringSoon = days <= 1;
              const isActing = reinstating === item.id || deleting === item.id;
              return (
                <div
                  key={`${item.type}-${item.id}`}
                  className={`flex items-center gap-4 rounded-lg border px-5 py-4 bg-card shadow-sm transition-all ${isExpiringSoon ? "border-red-300 bg-red-50/40" : "border-border"}`}
                >
                  {/* Icon */}
                  <div className="shrink-0">{typeIcon(item.type)}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${typeBadgeClass(item.type)}`}>
                        {typeLabel(item.type)}
                      </span>
                      <span className="font-semibold text-sm truncate">{item.label}</span>
                    </div>
                    {item.sublabel && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.sublabel}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        Deleted {formatDate(item.deletedAt)}
                        {item.deletedByCIN ? ` by CIN ${item.deletedByCIN}` : ""}
                      </span>
                      <span className={`text-xs font-medium ${isExpiringSoon ? "text-red-600" : "text-muted-foreground"}`}>
                        {days === 0 ? "Expires today" : `${days} day${days !== 1 ? "s" : ""} remaining`}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Reinstate button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                      disabled={isActing}
                      onClick={() => handleReinstate(item)}
                    >
                      {reinstating === item.id ? (
                        <Spinner className="w-3.5 h-3.5" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      Reinstate
                    </Button>

                    {/* Permanent delete — admin only */}
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                        disabled={isActing}
                        onClick={() => setConfirmItem(item)}
                      >
                        {deleting === item.id ? (
                          <Spinner className="w-3.5 h-3.5" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Permanent delete confirmation dialog */}
      <AlertDialog open={!!confirmItem} onOpenChange={(open) => { if (!open) setConfirmItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmItem && (
                <>
                  <strong>{confirmItem.label}</strong> ({typeLabel(confirmItem.type)}) will be{" "}
                  <strong>permanently deleted</strong> and cannot be recovered. This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleHardDelete}
            >
              Permanently Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Purge orphaned photos confirmation dialog */}
      <AlertDialog open={confirmPurgeOrphans} onOpenChange={setConfirmPurgeOrphans}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge all orphaned photos?</AlertDialogTitle>
            <AlertDialogDescription>
              {orphanedAttachments?.length ?? 0} photo{(orphanedAttachments?.length ?? 0) !== 1 ? "s" : ""} whose
              operation no longer exists will be <strong>permanently deleted</strong>. This does not affect any
              photo still linked to a live operation, sheet, or target. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                setConfirmPurgeOrphans(false);
                purgeOrphansMutation.mutate();
              }}
            >
              Purge All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
