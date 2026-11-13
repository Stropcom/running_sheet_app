// Part of the operation page (client/src/pages/OperationDetail.tsx): the list of the operation's targets (the ?tab=target deep link).
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { ClearInputButton } from "@/components/ClearInputButton";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Target, Search } from "lucide-react";
import { useState } from "react";
import {
  AddTargetDialog,
  type RegistryCreatePayload,
} from "@/components/AddTargetDialog";
import { toast } from "sonner";
import { TargetCard } from "./TargetCard";

/** Add Target tab panel — lists all targets for the operation, allows adding more */
export function TargetPanel({
  operationId,
  operationName,
  autoExpandId,
  fromSheetId,
}: {
  operationId: number;
  operationName: string;
  autoExpandId?: number;
  fromSheetId?: number;
}) {
  const utils = trpc.useUtils();
  const { data: targets, isLoading } = trpc.target.list.useQuery({
    operationId,
  });
  const { data: allTargets } = trpc.target.listAll.useQuery();
  const [mode, setMode] = useState<"idle" | "link">("idle");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");

  const create = trpc.target.registry.create.useMutation({
    onSuccess: () => {
      utils.target.list.invalidate({ operationId });
      utils.target.listAll.invalidate();
      toast.success("Target added");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const createLinked =
    trpc.target.registry.createLinkedFromAssociate.useMutation({
      onSuccess: () => {
        utils.target.list.invalidate({ operationId });
        utils.target.listAll.invalidate();
        toast.success("Target added and linked to the existing associate");
      },
      onError: (e: { message: string }) => toast.error(e.message),
    });

  // Link = link the existing target record to this operation (no duplication)
  const linkTarget = trpc.target.registry.linkToOperation.useMutation({
    onSuccess: () => {
      utils.target.list.invalidate({ operationId });
      setMode("idle");
      setLinkSearch("");
      toast.success("Target linked to operation");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  // Targets already in this operation (to avoid duplicates in link list)
  const existingIds = new Set((targets ?? []).map(t => t.id));

  // Filter allTargets for the link picker — exclude already-added ones, apply search
  const linkOptions = (allTargets ?? []).filter(t => {
    if (existingIds.has(t.id)) return false;
    const q = linkSearch.toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      (t.tgt ?? "").toLowerCase().includes(q) ||
      (t.operationName ?? "").toLowerCase().includes(q)
    );
  });

  if (isLoading)
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {targets && targets.length > 0 ? (
        targets.map(t => (
          <TargetCard
            key={t.id}
            target={t}
            operationId={operationId}
            onDeleted={() => {}}
            initialExpanded={autoExpandId === t.id}
            fromSheetId={fromSheetId}
          />
        ))
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-3 rounded-xl bg-muted/40 mb-3">
            <Target className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No targets added yet</p>
        </div>
      )}

      {/* Add / Link target forms */}
      <AddTargetDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        initialOperation={{ id: operationId, name: operationName }}
        onSave={async (payload: RegistryCreatePayload) => {
          const { existingAssociateId, ...rest } = payload;
          if (existingAssociateId) {
            return await createLinked.mutateAsync({
              ...rest,
              existingAssociateId,
            });
          }
          return await create.mutateAsync(rest);
        }}
      />

      {mode === "link" && (
        <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2 mt-1">
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <div className="relative flex-1">
              <Input
                autoFocus
                className="h-8 w-full pr-8 text-sm"
                placeholder="Search by name, TGT code or operation…"
                value={linkSearch}
                onChange={e => setLinkSearch(e.target.value)}
              />
              <ClearInputButton
                value={linkSearch}
                onClear={() => setLinkSearch("")}
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => {
                setMode("idle");
                setLinkSearch("");
              }}
            >
              Cancel
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
            {linkOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {linkSearch
                  ? "No matching targets"
                  : "All existing targets are already in this operation"}
              </p>
            ) : (
              linkOptions.map(t => (
                <button
                  key={t.id}
                  className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 text-left transition-colors w-full"
                  onClick={() =>
                    linkTarget.mutate({
                      targetId: t.id,
                      operationId,
                    })
                  }
                  disabled={linkTarget.isPending}
                >
                  <Target className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {t.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.tgt ? (
                        <span className="font-mono mr-2">TGT: {t.tgt}</span>
                      ) : null}
                      {t.operationName ? (
                        <span>Op: {t.operationName}</span>
                      ) : null}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {mode === "idle" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            New Target
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => setMode("link")}
          >
            <Search className="w-3.5 h-3.5" />
            Link Existing
          </Button>
        </div>
      )}
    </div>
  );
}
