import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  GitMerge,
  ChevronLeft,
  Lock,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SHIFT_LABELS,
  SHIFT_TIMES,
  shiftClass,
} from "@shared/ctoRosterShiftUtils";
import { format, parseISO, isValid } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";

function safeFormat(
  d: Date | string | null | undefined,
  fmt: string,
  fallback = ""
): string {
  if (!d) return fallback;
  try {
    const dt = typeof d === "string" ? parseISO(d) : d;
    if (!isValid(dt)) return fallback;
    return format(dt, fmt);
  } catch {
    return fallback;
  }
}

type DiffEntry = {
  memberId: number;
  memberName: string;
  shiftDate: string;
  draftCode: string;
  draftTime?: string | null;
  liveCode: string;
  liveTime?: string | null;
  isConflict: boolean;
  resolution?: "draft" | "live";
};

function ShiftPill({ code, time }: { code: string; time?: string | null }) {
  if (!code)
    return <span className="text-muted-foreground text-xs italic">Empty</span>;
  const label =
    SHIFT_LABELS[code as keyof typeof SHIFT_LABELS] ?? code.toUpperCase();
  const t = time ?? SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ?? "";
  return (
    <span
      className={cn(
        "inline-flex flex-col items-center justify-center rounded-lg px-2 py-1 text-xs font-bold min-w-[52px]",
        shiftClass(code)
      )}
    >
      <span style={{ color: "rgba(0,0,0,0.9)" }}>{label}</span>
      {t && (
        <span
          className="text-[10px] font-normal"
          style={{ color: "rgba(0,0,0,0.7)" }}
        >
          {t}
        </span>
      )}
    </span>
  );
}

export default function DraftMergePage() {
  const [, params] = useRoute("/cto-roster/draft/:draftId/merge");
  const [, navigate] = useLocation();
  const draftId = params?.draftId ? parseInt(params.draftId, 10) : null;
  const utils = trpc.useUtils();

  const diffQuery = trpc.ctoRoster.draft.getMergeDiff.useQuery(
    { draftId: draftId! },
    { enabled: !!draftId }
  );

  // Resolution map: key = "memberId_date", value = "draft" | "live"
  const [resolutions, setResolutions] = useState<
    Record<string, "draft" | "live">
  >({});

  const diff = diffQuery.data?.diff ?? [];
  const draftName = diffQuery.data?.draftName ?? "";

  const conflicts = useMemo(
    () => diff.filter((d: DiffEntry) => d.isConflict),
    [diff]
  );
  const changes = useMemo(
    () => diff.filter((d: DiffEntry) => !d.isConflict),
    [diff]
  );

  const unresolvedCount = conflicts.filter(
    (c: DiffEntry) => !resolutions[`${c.memberId}_${c.shiftDate}`]
  ).length;
  const canMerge = unresolvedCount === 0;

  const mergeMutation = trpc.ctoRoster.draft.merge.useMutation({
    onSuccess: data => {
      toast.success(
        `Merged! ${data.applied} change${data.applied !== 1 ? "s" : ""} applied, ${data.skipped} skipped.`
      );
      utils.ctoRoster.roster.getRange.invalidate();
      navigate("/cto-roster/drafts");
    },
    onError: err => toast.error(err.message),
  });

  const handleMerge = () => {
    if (!draftId) return;
    const resolutionList = Object.entries(resolutions).map(
      ([key, resolution]) => {
        const [memberId, shiftDate] = key.split("_");
        return { memberId: parseInt(memberId, 10), shiftDate, resolution };
      }
    );
    mergeMutation.mutate({ draftId, resolutions: resolutionList });
  };

  if (!draftId)
    return (
      <DashboardLayout>
        <div className="p-8 text-muted-foreground">Invalid draft ID.</div>
      </DashboardLayout>
    );

  return (
    <DashboardLayout>
      <div className="container max-w-3xl py-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/cto-roster/draft/${draftId}`)}
            className="h-8 px-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Draft
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitMerge className="h-6 w-6 text-primary" />
            Merge Draft
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review changes from <strong>"{draftName}"</strong> before merging
            into the live roster.
          </p>
        </div>

        {diffQuery.isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : diff.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <div>
              <div className="font-semibold text-emerald-800">
                No changes to merge
              </div>
              <div className="text-sm text-emerald-700">
                The draft matches the live roster exactly.
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate("/cto-roster/drafts")}
            >
              Back to Drafts
            </Button>
          </div>
        ) : (
          <>
            {/* Conflict section */}
            {conflicts.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <h2 className="font-semibold text-base">
                    {conflicts.length} Conflict
                    {conflicts.length !== 1 ? "s" : ""} — Must Resolve Before
                    Merging
                  </h2>
                  {unresolvedCount > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {unresolvedCount} unresolved
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  These cells were changed in the live roster after this draft
                  was created. Choose which value to keep for each.
                </div>

                <div className="flex flex-col gap-2">
                  {conflicts.map((item: DiffEntry) => {
                    const key = `${item.memberId}_${item.shiftDate}`;
                    const resolution = resolutions[key];
                    return (
                      <div
                        key={key}
                        className={cn(
                          "rounded-xl border p-3 flex flex-col gap-3",
                          resolution
                            ? "border-emerald-200 bg-emerald-50/50"
                            : "border-amber-200 bg-amber-50"
                        )}
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <div className="font-semibold text-sm">
                              {item.memberName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {safeFormat(item.shiftDate, "EEE d MMM yyyy")}
                            </div>
                          </div>
                          {resolution && (
                            <Badge className="text-xs bg-emerald-500 text-white">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Resolved
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Draft value */}
                          <button
                            onClick={() =>
                              setResolutions(r => ({ ...r, [key]: "draft" }))
                            }
                            className={cn(
                              "flex-1 min-w-[120px] rounded-lg border-2 p-2 text-left transition-all",
                              resolution === "draft"
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-muted hover:border-muted-foreground/40"
                            )}
                          >
                            <div className="text-[10px] font-semibold text-muted-foreground mb-1">
                              DRAFT VALUE
                            </div>
                            <ShiftPill
                              code={item.draftCode}
                              time={item.draftTime}
                            />
                          </button>

                          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                          {/* Live value */}
                          <button
                            onClick={() =>
                              setResolutions(r => ({ ...r, [key]: "live" }))
                            }
                            className={cn(
                              "flex-1 min-w-[120px] rounded-lg border-2 p-2 text-left transition-all",
                              resolution === "live"
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-muted hover:border-muted-foreground/40"
                            )}
                          >
                            <div className="text-[10px] font-semibold text-muted-foreground mb-1">
                              LIVE ROSTER (CHANGED)
                            </div>
                            <ShiftPill
                              code={item.liveCode}
                              time={item.liveTime}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Clean changes section */}
            {changes.length > 0 && (
              <div className="flex flex-col gap-3">
                <h2 className="font-semibold text-base flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  {changes.length} Clean Change{changes.length !== 1 ? "s" : ""}
                </h2>
                <div className="text-sm text-muted-foreground">
                  These will be applied directly — no conflicts.
                </div>
                <div className="flex flex-col gap-2">
                  {changes.map((item: DiffEntry) => {
                    const key = `${item.memberId}_${item.shiftDate}`;
                    return (
                      <div
                        key={key}
                        className="rounded-xl border bg-card p-3 flex items-center gap-3 flex-wrap"
                      >
                        <div className="flex-1 min-w-[140px]">
                          <div className="font-semibold text-sm">
                            {item.memberName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {safeFormat(item.shiftDate, "EEE d MMM yyyy")}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <ShiftPill
                            code={item.liveCode}
                            time={item.liveTime}
                          />
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <ShiftPill
                            code={item.draftCode}
                            time={item.draftTime}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Merge button */}
            <div className="sticky bottom-0 bg-background border-t pt-4 pb-2 flex flex-col gap-2">
              {!canMerge && (
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Resolve all {unresolvedCount} conflict
                  {unresolvedCount !== 1 ? "s" : ""} before merging.
                </div>
              )}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => navigate(`/cto-roster/draft/${draftId}`)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleMerge}
                  disabled={!canMerge || mergeMutation.isPending}
                  className="flex-1"
                >
                  <GitMerge className="h-4 w-4 mr-1" />
                  {mergeMutation.isPending
                    ? "Merging…"
                    : `Merge ${changes.length + conflicts.length} Change${changes.length + conflicts.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
