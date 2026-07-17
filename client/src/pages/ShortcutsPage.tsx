import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function ShortcutsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const utils = trpc.useUtils();
  const { data: shortcuts, isLoading } = trpc.shortcuts.list.useQuery();

  const invalidate = () => utils.shortcuts.list.invalidate();

  const createMutation = trpc.shortcuts.create.useMutation({
    onSuccess: () => { invalidate(); setNewTrigger(""); setNewExpansion(""); setAdding(false); toast.success("Shortcut added"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.shortcuts.update.useMutation({
    onSuccess: () => { invalidate(); setEditingId(null); toast.success("Shortcut updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.shortcuts.delete.useMutation({
    onSuccess: () => { invalidate(); toast.success("Shortcut deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const toggleRsMutation = trpc.shortcuts.toggleRs.useMutation({
    onMutate: async ({ id, showInRs }) => {
      // Optimistic update
      await utils.shortcuts.list.cancel();
      const prev = utils.shortcuts.list.getData();
      utils.shortcuts.list.setData(undefined, (old) =>
        old?.map((s) => s.id === id ? { ...s, showInRs } : s)
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.shortcuts.list.setData(undefined, ctx.prev);
      toast.error("Failed to update RS chip setting");
    },
    onSettled: () => invalidate(),
  });

  const [adding, setAdding] = useState(false);
  const [newTrigger, setNewTrigger] = useState("");
  const [newExpansion, setNewExpansion] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTrigger, setEditTrigger] = useState("");
  const [editExpansion, setEditExpansion] = useState("");

  const startEdit = (s: { id: number; trigger: string; expansion: string }) => {
    setEditingId(s.id);
    setEditTrigger(s.trigger);
    setEditExpansion(s.expansion);
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold">Observation Shortcuts</h1>
          </div>
          {isAdmin && !adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Shortcut
            </Button>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Type a shortcut trigger in the observation field and press <kbd className="px-1 py-0.5 rounded border text-xs font-mono">Space</kbd> or <kbd className="px-1 py-0.5 rounded border text-xs font-mono">Tab</kbd> to expand it automatically.
          Use the <span className="font-semibold text-primary">+RS</span> / <span className="font-semibold text-destructive">−RS</span> buttons to control which shortcuts appear as quick-insert chips in Running Sheets and the RS Quick Entry panel.
        </p>

        {/* Add form */}
        {isAdmin && adding && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <p className="text-sm font-medium">New Shortcut</p>
            <div className="flex gap-2 items-center">
              <Input
                className="w-28 font-mono text-sm"
                placeholder="trigger"
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value.toLowerCase())}
                maxLength={64}
              />
              <span className="text-muted-foreground text-sm">→</span>
              <Input
                className="flex-1 text-sm"
                placeholder="Full expansion text"
                value={newExpansion}
                onChange={(e) => setNewExpansion(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setNewTrigger(""); setNewExpansion(""); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!newTrigger.trim() || !newExpansion.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({ trigger: newTrigger.trim(), expansion: newExpansion.trim() })}
              >
                Save
              </Button>
            </div>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !shortcuts?.length ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No shortcuts yet.</div>
        ) : (
          <div className="rounded-lg border divide-y">
            {shortcuts.map((s) => (
              <div key={s.id} className="px-4 py-3">
                {editingId === s.id ? (
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <Input
                        className="w-28 font-mono text-sm"
                        value={editTrigger}
                        onChange={(e) => setEditTrigger(e.target.value.toLowerCase())}
                        maxLength={64}
                      />
                      <span className="text-muted-foreground text-sm">→</span>
                      <Input
                        className="flex-1 text-sm"
                        value={editExpansion}
                        onChange={(e) => setEditExpansion(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={!editTrigger.trim() || !editExpansion.trim() || updateMutation.isPending}
                        onClick={() => updateMutation.mutate({ id: s.id, trigger: editTrigger.trim(), expansion: editExpansion.trim() })}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded text-primary font-semibold min-w-[4rem] text-center">
                      {s.trigger}
                    </span>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className="flex-1 text-sm">{s.expansion}</span>
                    <div className="flex gap-1 shrink-0 items-center">
                      {/* +RS / -RS toggle — available to all users */}
                      <button
                        onClick={() => toggleRsMutation.mutate({ id: s.id, showInRs: !s.showInRs })}
                        disabled={toggleRsMutation.isPending}
                        title={s.showInRs ? "Remove from RS chips" : "Add to RS chips"}
                        className={[
                          "h-7 px-2 rounded text-[11px] font-bold border transition-colors select-none",
                          s.showInRs
                            ? "bg-primary/10 border-primary/40 text-primary hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive"
                            : "bg-muted border-border text-muted-foreground hover:bg-primary/10 hover:border-primary/40 hover:text-primary",
                        ].join(" ")}
                      >
                        {s.showInRs ? "−RS" : "+RS"}
                      </button>
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(s)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => deleteMutation.mutate({ id: s.id })}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
