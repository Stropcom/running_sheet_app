/**
 * "Check Running Sheet" — an on-demand report any author can run against
 * their own sheet, at any point (not just an admin-only whole-folder scan
 * — see MyProfilePage.tsx's Intelligence Entity Scan / Missed-Entity Scan
 * for that). Covers four rule-based categories (server/sheetCheck.ts):
 * entity formatting, registry-name typos, cross-row consistency, and a
 * curated common-misspellings check. Deliberately does NOT cover grammar —
 * there's no deterministic way to check it, and it was scoped out rather
 * than bolted on as a low-confidence guess under the same "checked" badge
 * as the fully deterministic categories here.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ClipboardCheck, CheckCheck, Loader2 } from "lucide-react";

interface SheetCheckFinding {
  ruleId: string;
  category: "formatting" | "registry" | "consistency" | "spelling";
  reason: string;
  rowId: number;
  otherRowId?: number;
  timeMinutes: number | null;
  snippet: string;
  suggestedFix?: { wrong: string; correct: string };
  findingKey: string;
}

const CATEGORY_LABELS: Record<SheetCheckFinding["category"], string> = {
  formatting: "Entity formatting",
  registry: "Registry spelling",
  consistency: "Consistency",
  spelling: "Spelling",
};

const CATEGORY_BADGE_CLASSES: Record<SheetCheckFinding["category"], string> = {
  formatting: "bg-muted text-muted-foreground",
  registry: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  consistency: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  spelling: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
};

function formatTime(mins: number | null): string {
  if (mins == null) return "";
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function CheckRunningSheetDialog({
  open,
  onClose,
  sheetId,
  onJumpToRow,
  onFixFinding,
}: {
  open: boolean;
  onClose: () => void;
  sheetId: number;
  /** Scrolls to (and briefly highlights) the given row, then closes this
   * dialog so the officer can see it in context. */
  onJumpToRow: (rowId: number) => void;
  /** Applies a finding's suggested fix to the given row's observation text
   * — replaces the first occurrence of `wrong` with `correct`, same as
   * editing the row by hand. Used by every category that offers a Fix
   * button (spelling, duplicate-bracket-fragment), not spelling alone. */
  onFixFinding: (rowId: number, wrong: string, correct: string) => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading, isFetching, refetch } = trpc.sheet.check.useQuery(
    { sheetId },
    { enabled: open }
  );
  const findings = data?.findings ?? [];

  const [dismissingKey, setDismissingKey] = useState<string | null>(null);
  const dismissMutation = trpc.sheet.dismissCheckFinding.useMutation({
    onError: err => toast.error(err.message),
  });

  const handleDismiss = (f: SheetCheckFinding) => {
    const key = `${f.ruleId}::${f.findingKey}`;
    setDismissingKey(key);
    dismissMutation.mutate(
      { ruleId: f.ruleId, findingKey: f.findingKey },
      {
        onSuccess: () => {
          utils.sheet.check.setData({ sheetId }, prev =>
            prev
              ? {
                  findings: prev.findings.filter(
                    other => `${other.ruleId}::${other.findingKey}` !== key
                  ),
                }
              : prev
          );
        },
        onSettled: () => setDismissingKey(null),
      }
    );
  };

  const handleFix = (f: SheetCheckFinding) => {
    if (!f.suggestedFix) return;
    onFixFinding(f.rowId, f.suggestedFix.wrong, f.suggestedFix.correct);
    handleDismiss(f);
  };

  const counts = {
    formatting: findings.filter(f => f.category === "formatting").length,
    registry: findings.filter(f => f.category === "registry").length,
    consistency: findings.filter(f => f.category === "consistency").length,
    spelling: findings.filter(f => f.category === "spelling").length,
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary shrink-0" />
            Check Running Sheet
          </DialogTitle>
          <DialogDescription>
            Runs on demand — while you're still writing, or before you close the
            sheet out. Nothing changes automatically; every finding is yours to
            act on or dismiss.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 -mt-1 mb-1">
          <div className="grid grid-cols-4 gap-2 flex-1">
            {(
              Object.keys(CATEGORY_LABELS) as SheetCheckFinding["category"][]
            ).map(cat => (
              <div
                key={cat}
                className="rounded-lg border border-border/60 bg-muted/10 px-2 py-1.5 text-center"
              >
                <div className="text-lg font-bold tabular-nums leading-tight">
                  {counts[cat]}
                </div>
                <div className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
                  {CATEGORY_LABELS[cat]}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="gap-2 self-start"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ClipboardCheck className="w-3.5 h-3.5" />
          )}
          {isFetching ? "Checking…" : "Re-check"}
        </Button>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Checking…
          </p>
        ) : findings.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2.5">
            <CheckCheck className="w-4 h-4 shrink-0" />
            All clear — nothing outstanding on this sheet.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {findings.map(f => {
              const key = `${f.ruleId}::${f.findingKey}`;
              return (
                <div
                  key={key}
                  className="rounded-lg border border-border/60 bg-muted/10 p-3 flex flex-col gap-1.5"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {f.timeMinutes != null && (
                      <span className="text-[11px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5 tabular-nums">
                        {formatTime(f.timeMinutes)}
                      </span>
                    )}
                    <span
                      className={`text-[9.5px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${CATEGORY_BADGE_CLASSES[f.category]}`}
                    >
                      {CATEGORY_LABELS[f.category]}
                    </span>
                  </div>
                  <p className="text-sm text-foreground italic">
                    "{f.snippet}"
                  </p>
                  <p className="text-xs text-muted-foreground">{f.reason}</p>
                  <div className="flex items-center gap-4 mt-0.5">
                    {f.suggestedFix ? (
                      <button
                        type="button"
                        onClick={() => handleFix(f)}
                        disabled={dismissingKey === key}
                        className="text-[11px] font-bold text-teal-600 dark:text-teal-400 bg-teal-500/10 hover:bg-teal-500/20 rounded px-2 py-1 transition-colors disabled:opacity-50"
                      >
                        Fix
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onJumpToRow(f.rowId)}
                        className="text-[11px] font-semibold text-primary hover:underline"
                      >
                        {f.otherRowId ? "Jump to rows" : "Jump to row"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDismiss(f)}
                      disabled={dismissingKey === key}
                      className="text-[11px] font-medium text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    >
                      {dismissingKey === key ? "Dismissing…" : "Dismiss"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
