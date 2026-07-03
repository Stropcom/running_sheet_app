import { useState, useMemo } from "react";
import { Copy, FolderInput, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "copy" | "move";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheetId: number;
  sheetTitle: string;
  currentOperationId: number;
}

export function CopyMoveSheetDialog({
  open,
  onOpenChange,
  sheetId,
  sheetTitle,
  currentOperationId,
}: Props) {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("copy");
  const [search, setSearch] = useState("");
  const [selectedOpId, setSelectedOpId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState(`Copy of ${sheetTitle}`);

  const utils = trpc.useUtils();

  const { data: operations = [] } = trpc.operation.list.useQuery(undefined, {
    enabled: open,
  });

  // Filter operations — for Move, exclude the current operation
  const filteredOps = useMemo(() => {
    const base = mode === "move"
      ? operations.filter((op) => op.id !== currentOperationId)
      : operations;
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter((op) => op.name.toLowerCase().includes(q));
  }, [operations, mode, currentOperationId, search]);

  const copyMutation = trpc.sheet.copy.useMutation({
    onSuccess: (data) => {
      utils.operation.get.invalidate({ id: selectedOpId! });
      utils.operation.list.invalidate();
      toast.success(`Running sheet copied successfully.`);
      onOpenChange(false);
      resetState();
    },
    onError: (e) => toast.error(e.message),
  });

  const moveMutation = trpc.sheet.move.useMutation({
    onSuccess: () => {
      utils.operation.get.invalidate({ id: currentOperationId });
      utils.operation.get.invalidate({ id: selectedOpId! });
      utils.operation.list.invalidate();
      toast.success(`Running sheet moved successfully.`);
      onOpenChange(false);
      resetState();
    },
    onError: (e) => toast.error(e.message),
  });

  const isPending = copyMutation.isPending || moveMutation.isPending;

  function resetState() {
    setSearch("");
    setSelectedOpId(null);
    setNewTitle(`Copy of ${sheetTitle}`);
    setMode("copy");
  }

  function handleConfirm() {
    if (!selectedOpId) return;
    if (mode === "copy") {
      copyMutation.mutate({ sheetId, targetOperationId: selectedOpId, newTitle: newTitle.trim() || `Copy of ${sheetTitle}` });
    } else {
      moveMutation.mutate({ sheetId, targetOperationId: selectedOpId });
    }
  }

  // Reset new title when sheet title changes or dialog opens
  useMemo(() => {
    setNewTitle(`Copy of ${sheetTitle}`);
  }, [sheetTitle, open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isPending) { onOpenChange(v); if (!v) resetState(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "copy"
              ? <><Copy className="w-4 h-4 text-sky-400" /> Copy Running Sheet</>
              : <><FolderInput className="w-4 h-4 text-amber-400" /> Move Running Sheet</>}
          </DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
              mode === "copy"
                ? "bg-sky-500/20 text-sky-400 border-r border-border"
                : "bg-transparent text-muted-foreground hover:bg-muted/40 border-r border-border"
            }`}
            onClick={() => { setMode("copy"); setSelectedOpId(null); }}
            disabled={isPending}
          >
            <Copy className="w-3.5 h-3.5" />
            Copy
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
              mode === "move"
                ? "bg-amber-500/20 text-amber-400"
                : "bg-transparent text-muted-foreground hover:bg-muted/40"
            }`}
            onClick={() => { setMode("move"); setSelectedOpId(null); }}
            disabled={isPending}
          >
            <FolderInput className="w-3.5 h-3.5" />
            Move
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Source sheet info */}
          <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
            <span className="font-medium text-foreground">{sheetTitle}</span>
            {mode === "copy" && <span className="ml-1">will be copied to the selected operation.</span>}
            {mode === "move" && <span className="ml-1">will be moved to the selected operation.</span>}
          </div>

          {/* New title field — only for copy */}
          {mode === "copy" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="copy-title" className="text-sm">New sheet title</Label>
              <Input
                id="copy-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={`Copy of ${sheetTitle}`}
                disabled={isPending}
                className="text-sm"
              />
            </div>
          )}

          {/* Operation search */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">
              {mode === "move" ? "Move to operation" : "Copy to operation"}
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search operations…"
                className="pl-8 text-sm"
                disabled={isPending}
              />
            </div>

            {/* Operation list */}
            <div className="max-h-52 overflow-y-auto flex flex-col gap-1 mt-1 pr-1">
              {filteredOps.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {search ? "No operations match your search." : "No other operations available."}
                </p>
              ) : (
                filteredOps.map((op) => (
                  <button
                    key={op.id}
                    onClick={() => setSelectedOpId(op.id)}
                    disabled={isPending}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      selectedOpId === op.id
                        ? mode === "copy"
                          ? "border-sky-500 bg-sky-500/10 text-sky-400"
                          : "border-amber-500 bg-amber-500/10 text-amber-400"
                        : "border-border bg-card hover:bg-muted/40 text-foreground"
                    }`}
                  >
                    <span className="font-medium">{op.name}</span>
                    {op.promisNumber && (
                      <span className="ml-2 text-xs text-muted-foreground font-mono">{op.promisNumber}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => { onOpenChange(false); resetState(); }}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedOpId || isPending}
            className={mode === "copy" ? "bg-sky-600 hover:bg-sky-700 text-white" : "bg-amber-600 hover:bg-amber-700 text-white"}
          >
            {isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />{mode === "copy" ? "Copying…" : "Moving…"}</>
            ) : (
              <>{mode === "copy" ? <><Copy className="w-4 h-4 mr-2" />Copy Sheet</> : <><FolderInput className="w-4 h-4 mr-2" />Move Sheet</>}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
