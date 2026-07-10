import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Settings2,
  Zap,
  RefreshCw,
} from "lucide-react";

const RULE_TYPE_LABELS: Record<string, { label: string; colour: string }> = {
  abbreviation: { label: "Abbreviation", colour: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  phrase_required: { label: "Required Phrase", colour: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  sentence_start: { label: "Sentence Start", colour: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  article_missing: { label: "Missing Article", colour: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  passive_voice: { label: "Passive Voice", colour: "bg-red-500/20 text-red-300 border-red-500/30" },
  tense: { label: "Tense", colour: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  punctuation: { label: "Punctuation", colour: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  capitalisation: { label: "Capitalisation", colour: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
  custom: { label: "Custom", colour: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
};

export default function StyleCheckerPage() {
  const { data: guide, isLoading, refetch } = trpc.styleChecker.getGuide.useQuery();
  const initGuide = trpc.styleChecker.initGuide.useMutation({
    onSuccess: () => {
      toast.success("Style guide initialised with rules from the pro forma.");
      refetch();
    },
    onError: () => toast.error("Failed to initialise style guide."),
  });
  const toggleRule = trpc.styleChecker.toggleRule.useMutation({
    onSuccess: () => refetch(),
    onError: () => toast.error("Failed to update rule."),
  });

  const [filter, setFilter] = useState<string>("all");

  const activeCount = guide?.rules.filter((r) => r.isActive).length ?? 0;
  const totalCount = guide?.rules.length ?? 0;

  const filteredRules = guide?.rules.filter((r) => {
    if (filter === "all") return true;
    if (filter === "active") return r.isActive;
    if (filter === "inactive") return !r.isActive;
    return r.ruleType === filter;
  }) ?? [];

  const ruleTypes = Array.from(new Set(guide?.rules.map((r) => r.ruleType) ?? []));

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 text-sky-400" />
              <h1 className="text-xl font-semibold text-foreground">RS Writing Style Checker</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Fully local rule-based writing checker. No data leaves the server. Rules are extracted
              from your pro forma and applied to running sheet observations when you run a check.
            </p>
          </div>
          {!guide && !isLoading && (
            <Button
              onClick={() => initGuide.mutate()}
              disabled={initGuide.isPending}
              className="shrink-0"
            >
              {initGuide.isPending ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Initialising…</>
              ) : (
                <><Zap className="w-4 h-4 mr-2" /> Initialise Rules</>
              )}
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && !guide && (
          <Card className="border-dashed border-muted-foreground/30">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <Settings2 className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No style guide has been initialised yet. Click <strong>Initialise Rules</strong> to
                load the writing rules extracted from your pro forma.
              </p>
            </CardContent>
          </Card>
        )}

        {guide && (
          <>
            {/* Stats bar */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{activeCount}</span> active rules
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{totalCount - activeCount}</span> disabled
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                Guide: <span className="font-medium text-foreground">{guide.guide.name}</span>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 flex-wrap">
              {["all", "active", "inactive", ...ruleTypes].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filter === f
                      ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                      : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
                  }`}
                >
                  {f === "all"
                    ? "All"
                    : f === "active"
                    ? "Active"
                    : f === "inactive"
                    ? "Inactive"
                    : RULE_TYPE_LABELS[f]?.label ?? f}
                </button>
              ))}
            </div>

            <Separator />

            {/* Rules list */}
            <div className="space-y-2">
              {filteredRules.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No rules match this filter.</p>
              )}
              {filteredRules.map((rule) => {
                const typeInfo = RULE_TYPE_LABELS[rule.ruleType] ?? { label: rule.ruleType, colour: "bg-muted" };
                return (
                  <div
                    key={rule.id}
                    className={`flex items-start gap-4 p-3 rounded-lg border transition-opacity ${
                      rule.isActive ? "border-border bg-card" : "border-border/40 bg-muted/20 opacity-60"
                    }`}
                  >
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={(checked) =>
                        toggleRule.mutate({ ruleId: rule.id, isActive: checked })
                      }
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${typeInfo.colour}`}
                        >
                          {typeInfo.label}
                        </span>
                        <span className="text-sm font-medium text-foreground truncate">
                          {rule.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>
                          Pattern: <code className="font-mono bg-muted/50 px-1 rounded">{rule.pattern}</code>
                        </span>
                        {rule.suggestion && (
                          <span>
                            Suggestion: <span className="text-sky-400">{rule.suggestion}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 text-xs text-muted-foreground">
              Rules are applied locally on the server. No observation text, names, addresses, or
              operational data leaves the app. Toggle rules on/off to customise what gets flagged.
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
