import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Trash2, RotateCcw, FolderOpen, FileText, User } from "lucide-react";

type RecycleBinItem = {
  id: number;
  type: "operation" | "sheet" | "target";
  label: string;
  sublabel?: string;
  deletedAt: number;
  deletedByCIN: string | null;
  expiresAt: number;
};

function typeIcon(type: RecycleBinItem["type"]) {
  if (type === "operation") return <FolderOpen className="w-5 h-5 text-blue-500" />;
  if (type === "sheet") return <FileText className="w-5 h-5 text-teal-500" />;
  return <User className="w-5 h-5 text-purple-500" />;
}

function typeLabel(type: RecycleBinItem["type"]) {
  if (type === "operation") return "Operation";
  if (type === "sheet") return "Running Sheet";
  return "Target";
}

function typeBadgeClass(type: RecycleBinItem["type"]) {
  if (type === "operation") return "bg-blue-100 text-blue-700 border-blue-200";
  if (type === "sheet") return "bg-teal-100 text-teal-700 border-teal-200";
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
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.recycleBin.list.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });

  const reinstateMutation = trpc.recycleBin.reinstate.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(`${typeLabel(variables.type)} reinstated successfully.`);
      utils.recycleBin.list.invalidate();
      // Also invalidate the relevant list so it reappears immediately
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

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Trash2 className="w-6 h-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">Recycle Bin</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Deleted items are kept for <strong>7 days</strong> before being permanently removed.
          Use <strong>Reinstate</strong> to restore an item to its original location.
        </p>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner className="w-8 h-8" />
          </div>
        )}

        {!isLoading && (!items || items.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-3">
            <Trash2 className="w-12 h-12 opacity-20" />
            <p className="text-lg font-medium">Recycle Bin is empty</p>
            <p className="text-sm">Deleted operations, running sheets, and targets will appear here.</p>
          </div>
        )}

        {!isLoading && items && items.length > 0 && (
          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const days = daysRemaining(item.expiresAt);
              const isExpiringSoon = days <= 1;
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

                  {/* Reinstate button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                    disabled={reinstating === item.id}
                    onClick={() => handleReinstate(item)}
                  >
                    {reinstating === item.id ? (
                      <Spinner className="w-3.5 h-3.5" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    Reinstate
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
