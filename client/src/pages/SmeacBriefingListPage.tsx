import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  Plus,
  ShieldAlert,
  Check,
  Trash2,
  Pencil,
  Download,
} from "lucide-react";
import { downloadBase64File } from "@/lib/downloadFile";

export default function SmeacBriefingListPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: briefings, isLoading } = trpc.smeacBriefing.list.useQuery();
  const { data: operations } = trpc.operation.list.useQuery();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [exportingId, setExportingId] = useState<number | null>(null);

  const deleteMutation = trpc.smeacBriefing.delete.useMutation({
    onSuccess: () => {
      toast.success("Briefing deleted");
      utils.smeacBriefing.list.invalidate();
    },
    onError: e => toast.error(e.message ?? "Failed to delete"),
  });

  const exportMutation = trpc.smeacBriefing.export.useMutation({
    onSuccess: data => {
      setExportingId(null);
      downloadBase64File(
        data.base64,
        data.filename,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      toast.success("SMEAC exported");
    },
    onError: e => {
      setExportingId(null);
      toast.error(e.message ?? "Failed to export");
    },
  });

  const operationName = (operationId: number) =>
    (operations as any[] | undefined)?.find(o => o.id === operationId)?.name ??
    `Operation #${operationId}`;

  const confirmDeleteBriefing = briefings?.find(b => b.id === confirmDeleteId);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span>Administration</span>
              <span>/</span>
              <span className="text-foreground font-medium">
                SMEAC Briefings
              </span>
            </div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              SMEAC Briefings
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Exceptional-use urgent briefings — not a daily tool.
            </p>
          </div>
          {user?.role === "admin" && (
            <Button
              onClick={() => setLocation("/administration/smeac/new")}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Briefing
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !briefings || briefings.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No SMEAC briefings yet.
          </div>
        ) : (
          <div className="space-y-2">
            {briefings.map(b => (
              <div
                key={b.id}
                className="flex items-center gap-2 rounded-xl bg-card border border-border hover:bg-accent/50 transition-colors"
              >
                <button
                  onClick={() => setLocation(`/administration/smeac/${b.id}`)}
                  className="flex-1 min-w-0 text-left flex items-center gap-3 p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold truncate">
                        {operationName(b.operationId)}
                      </p>
                      <StatusBadge status={b.status} />
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        Rev {b.revision}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {b.situation || "No situation summary"}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {b.postedAt
                      ? format(new Date(b.postedAt), "d MMM, h:mm a")
                      : format(new Date(b.createdAt), "d MMM, h:mm a")}
                  </span>
                </button>
                <div className="flex items-center gap-0.5 shrink-0 mr-2">
                  <button
                    onClick={() => {
                      setExportingId(b.id);
                      exportMutation.mutate({ id: b.id });
                    }}
                    disabled={exportingId === b.id}
                    className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                    aria-label="Export briefing"
                    title="Export briefing"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  {user?.role === "admin" && (
                    <>
                      <button
                        onClick={() =>
                          setLocation(`/administration/smeac/${b.id}/edit`)
                        }
                        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        aria-label="Edit briefing"
                        title="Edit briefing"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(b.id)}
                        className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        aria-label="Delete briefing"
                        title="Delete briefing"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={open => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this briefing?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteBriefing?.status === "posted"
                ? "This briefing was posted and notified every user — deleting it only removes it from this list, it does not un-notify anyone. This cannot be undone."
                : "This draft will be permanently removed. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteId !== null) {
                  deleteMutation.mutate({ id: confirmDeleteId });
                }
                setConfirmDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "posted") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
        <Check className="h-2.5 w-2.5" />
        Posted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-muted text-muted-foreground">
      Draft
    </span>
  );
}
