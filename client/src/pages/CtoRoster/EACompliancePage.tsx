import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  ShieldCheck,
  Play,
  Settings2,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  X,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { useSearch } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EbaFinding {
  ruleKey: string;
  ruleTitle: string;
  eaReference: string | null;
  memberId: number;
  memberName: string;
  dates: string[];
  detail: string;
  severity: "warning" | "error";
}

interface CheckResult {
  findings: EbaFinding[];
  checkedShifts: number;
  missingTimeWarnings: Array<{
    memberName: string;
    shiftDate: string;
    shiftCode: string;
  }>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EACompliancePage() {
  return (
    <DashboardLayout>
      <div
        className="flex flex-col overflow-hidden px-4 py-3"
        style={{ height: "calc(100vh - 0px)" }}
      >
        {/* Header — fixed height */}
        <div className="flex items-center gap-3 flex-shrink-0 mb-4">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">EA Compliance Checker</h1>
            <p className="text-sm text-muted-foreground">
              AFP Enterprise Agreement 2024–2027 · Operations Working Pattern
              (s.33)
            </p>
          </div>
        </div>

        {/* Tabs — scrollable content area */}
        <Tabs defaultValue="check" className="flex flex-col flex-1 min-h-0">
          <TabsList className="flex-shrink-0">
            <TabsTrigger value="check">Run Check</TabsTrigger>
            <TabsTrigger value="rules">Manage Rules</TabsTrigger>
          </TabsList>

          <TabsContent
            value="check"
            className="flex-1 min-h-0 mt-4"
            style={{
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
              <CheckPanel />
            </div>
          </TabsContent>

          <TabsContent
            value="rules"
            className="flex-1 min-h-0 mt-4"
            style={{
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
              <RulesPanel />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ── Check panel ───────────────────────────────────────────────────────────────

function CheckPanel() {
  const searchStr = useSearch();
  const searchParams = new URLSearchParams(searchStr);
  const urlScope = searchParams.get("scope") as
    | "main"
    | "draft"
    | "custom"
    | "saved"
    | null;
  const urlId = searchParams.get("id")
    ? Number(searchParams.get("id"))
    : undefined;

  const [scope, setScope] = useState<"main" | "draft" | "custom" | "saved">(
    urlScope ?? "main"
  );
  const [draftId, setDraftId] = useState<number | undefined>(
    urlScope === "draft" ? urlId : undefined
  );
  const [savedRosterId, setSavedRosterId] = useState<number | undefined>(
    urlScope === "saved" ? urlId : undefined
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(
    new Set()
  );
  // dismissedMembers: set of memberName strings
  const [dismissedMembers, setDismissedMembers] = useState<Set<string>>(
    new Set()
  );
  // dismissedFindings: set of "memberName::index" strings
  const [dismissedFindings, setDismissedFindings] = useState<Set<string>>(
    new Set()
  );

  function dismissMember(memberName: string) {
    setDismissedMembers(prev => new Set(Array.from(prev).concat(memberName)));
  }

  function dismissFinding(key: string) {
    setDismissedFindings(prev => new Set(Array.from(prev).concat(key)));
  }

  const draftsQuery = trpc.ctoRoster.draft.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const savedRostersQuery = trpc.ctoRoster.savedRoster.list.useQuery(
    undefined,
    { staleTime: 60_000 }
  );
  const checkMutation = trpc.ctoRoster.eba.runCheck.useMutation({
    onSuccess: data => {
      setResult(data as CheckResult);
      if (data.findings.length === 0) {
        toast.success("No EA compliance issues found in the selected scope.");
      } else {
        toast.warning(
          `${data.findings.length} potential EA obligation${data.findings.length !== 1 ? "s" : ""} flagged.`
        );
      }
    },
    onError: err => {
      toast.error(`Check failed: ${err.message}`);
    },
  });

  function handleRun() {
    if (scope === "draft" && !draftId) {
      toast.error("Please select a draft roster.");
      return;
    }
    if (scope === "saved" && !savedRosterId) {
      toast.error("Please select a saved roster.");
      return;
    }
    checkMutation.mutate({
      scope,
      draftId,
      savedRosterId,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  }

  function toggleFinding(key: string) {
    setExpandedFindings(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Group findings by member (excluding dismissed members and findings)
  const findingsByMember = result
    ? result.findings.reduce<Record<string, EbaFinding[]>>((acc, f) => {
        if (dismissedMembers.has(f.memberName)) return acc;
        const key = f.memberName;
        if (!acc[key]) acc[key] = [];
        acc[key].push(f);
        return acc;
      }, {})
    : null;

  // Count of active (non-dismissed) findings
  const activeFindingsCount = Object.values(findingsByMember ?? {}).reduce(
    (sum, arr) =>
      sum +
      arr.filter(
        (_, i) => !dismissedFindings.has(`${arr[0]?.memberName}::${i}`)
      ).length,
    0
  );

  return (
    <div className="space-y-4">
      {/* Scope selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Check Scope</CardTitle>
          <CardDescription>
            Select which roster data to check against the active EA rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Roster Source</Label>
              <Select
                value={scope}
                onValueChange={v => setScope(v as typeof scope)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">Main Roster</SelectItem>
                  <SelectItem value="draft">Draft Roster</SelectItem>
                  <SelectItem value="saved">
                    <span className="flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-purple-500" />
                      Saved Roster
                    </span>
                  </SelectItem>
                  <SelectItem value="custom">
                    Custom Date Range (Main)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === "draft" && (
              <div className="space-y-1.5">
                <Label>Draft Roster</Label>
                <Select
                  value={draftId?.toString() ?? ""}
                  onValueChange={v => setDraftId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select draft…" />
                  </SelectTrigger>
                  <SelectContent>
                    {draftsQuery.data?.map(d => (
                      <SelectItem key={d.id} value={d.id.toString()}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scope === "saved" && (
              <div className="space-y-1.5">
                <Label>Saved Roster</Label>
                <Select
                  value={savedRosterId?.toString() ?? ""}
                  onValueChange={v => setSavedRosterId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select saved roster…" />
                  </SelectTrigger>
                  <SelectContent>
                    {savedRostersQuery.data?.map(r => (
                      <SelectItem key={r.id} value={r.id.toString()}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scope === "custom" && (
              <>
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              onClick={handleRun}
              disabled={checkMutation.isPending}
              className="gap-2"
            >
              {checkMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {checkMutation.isPending ? "Running…" : "Run Check"}
            </Button>
            {result && (
              <span className="text-sm text-muted-foreground">
                {result.checkedShifts} shifts checked
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Missing time warnings */}
      {result && result.missingTimeWarnings.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
              <Info className="h-4 w-4" />
              On-Call Shifts Missing Start Time (
              {result.missingTimeWarnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">
              The following on-call shifts have no start time recorded.
              Compliance checks for these shifts may be inaccurate. Please add
              the start time via the roster chip.
            </p>
            <div className="flex flex-wrap gap-2">
              {result.missingTimeWarnings.map((w, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-amber-600 border-amber-500/40"
                >
                  {w.memberName} · {w.shiftCode.toUpperCase()} · {w.shiftDate}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {result.findings.length === 0 ? (
            <Card className="border-green-500/40 bg-green-500/5">
              <CardContent className="pt-6 flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-green-500" />
                <div>
                  <p className="font-medium text-green-700 dark:text-green-400">
                    No issues found
                  </p>
                  <p className="text-sm text-muted-foreground">
                    All {result.checkedShifts} shifts checked — no EA safety net
                    obligations triggered.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Findings — {activeFindingsCount} potential obligation
                  {activeFindingsCount !== 1 ? "s" : ""} across{" "}
                  {Object.keys(findingsByMember ?? {}).length} member
                  {Object.keys(findingsByMember ?? {}).length !== 1 ? "s" : ""}
                  {(dismissedMembers.size > 0 ||
                    dismissedFindings.size > 0) && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground/60">
                      ({dismissedMembers.size + dismissedFindings.size}{" "}
                      dismissed)
                    </span>
                  )}
                </h2>
                <p className="text-xs text-muted-foreground italic">
                  Safety net obligations — breaches may be permissible with
                  agreement or operational requirement.
                </p>
              </div>

              {Object.entries(findingsByMember ?? {}).map(
                ([memberName, findings]) => {
                  // Filter out individually dismissed findings
                  const visibleFindings = findings.filter(
                    (_, i) => !dismissedFindings.has(`${memberName}::${i}`)
                  );
                  if (visibleFindings.length === 0) return null;
                  return (
                    <Card key={memberName}>
                      <CardHeader
                        className="pb-2 cursor-pointer select-none"
                        onClick={() => toggleFinding(memberName)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            <CardTitle className="text-sm">
                              {memberName}
                            </CardTitle>
                            <Badge variant="secondary" className="text-xs">
                              {visibleFindings.length} issue
                              {visibleFindings.length !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {expandedFindings.has(memberName) ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                            {/* Dismiss all issues for this member */}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                              title="Dismiss all issues for this member"
                              onClick={e => {
                                e.stopPropagation();
                                dismissMember(memberName);
                              }}
                            >
                              <X className="h-3.5 w-3.5 mr-1" />
                              Dismiss all
                            </Button>
                          </div>
                        </div>
                      </CardHeader>

                      {expandedFindings.has(memberName) && (
                        <CardContent className="pt-0 space-y-2">
                          <Separator className="mb-3" />
                          {visibleFindings.map((f, i) => {
                            const findingKey = `${memberName}::${findings.indexOf(f)}`;
                            return (
                              <div
                                key={i}
                                className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1"
                              >
                                <div className="flex items-start justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                                      {f.ruleTitle}
                                    </span>
                                    {f.eaReference && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs font-mono"
                                      >
                                        {f.eaReference}
                                      </Badge>
                                    )}
                                  </div>
                                  {/* Dismiss individual finding */}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive shrink-0"
                                    title="Dismiss this issue"
                                    onClick={() => dismissFinding(findingKey)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                                <p className="text-sm text-foreground">
                                  {f.detail}
                                </p>
                                <div className="flex gap-1 flex-wrap">
                                  {f.dates.map((d, di) => (
                                    <Badge
                                      key={di}
                                      variant="secondary"
                                      className="text-xs font-mono"
                                    >
                                      {d}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      )}
                    </Card>
                  );
                }
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Rules panel ───────────────────────────────────────────────────────────────

function RulesPanel() {
  const rulesQuery = trpc.ctoRoster.eba.listRules.useQuery(undefined, {
    staleTime: 30_000,
  });
  const updateRule = trpc.ctoRoster.eba.updateRule.useMutation({
    onSuccess: () => {
      rulesQuery.refetch();
      toast.success("Rule updated.");
    },
    onError: err => toast.error(`Failed to update rule: ${err.message}`),
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editThreshold, setEditThreshold] = useState("");
  const [editThreshold2, setEditThreshold2] = useState("");

  function startEdit(rule: {
    id: number;
    thresholdValue: number | null;
    thresholdValue2: number | null;
  }) {
    setEditingId(rule.id);
    setEditThreshold(rule.thresholdValue?.toString() ?? "");
    setEditThreshold2(rule.thresholdValue2?.toString() ?? "");
  }

  function saveEdit(id: number) {
    const tv = editThreshold !== "" ? parseInt(editThreshold, 10) : null;
    const tv2 = editThreshold2 !== "" ? parseInt(editThreshold2, 10) : null;
    updateRule.mutate({ id, thresholdValue: tv, thresholdValue2: tv2 });
    setEditingId(null);
  }

  if (rulesQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading rules…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="pt-4 pb-3">
          <p className="text-sm text-muted-foreground flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
            These rules were extracted from the AFP EA 2024–2027 and confirmed
            by your team. Toggle rules on/off or adjust thresholds here. Changes
            take effect on the next check run.
          </p>
        </CardContent>
      </Card>

      {rulesQuery.data?.map(rule => (
        <Card key={rule.id} className={!rule.isActive ? "opacity-60" : ""}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{rule.title}</span>
                  {rule.eaReference && (
                    <Badge variant="outline" className="text-xs font-mono">
                      {rule.eaReference}
                    </Badge>
                  )}
                  {!rule.isActive && (
                    <Badge variant="secondary" className="text-xs">
                      Disabled
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {rule.description}
                </p>

                {/* Threshold editor */}
                {editingId === rule.id ? (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">Threshold</Label>
                      <Input
                        type="number"
                        className="h-7 w-20 text-xs"
                        value={editThreshold}
                        onChange={e => setEditThreshold(e.target.value)}
                      />
                    </div>
                    {rule.thresholdValue2 !== null && (
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs">Threshold 2</Label>
                        <Input
                          type="number"
                          className="h-7 w-20 text-xs"
                          value={editThreshold2}
                          onChange={e => setEditThreshold2(e.target.value)}
                        />
                      </div>
                    )}
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => saveEdit(rule.id)}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  rule.thresholdValue !== null && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        Threshold: <strong>{rule.thresholdValue}</strong>
                        {rule.thresholdValue2 !== null && (
                          <>
                            {" "}
                            / <strong>{rule.thresholdValue2}</strong>
                          </>
                        )}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2"
                        onClick={() => startEdit(rule)}
                      >
                        <Settings2 className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    </div>
                  )
                )}
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-2 shrink-0">
                <Label className="text-xs text-muted-foreground">Active</Label>
                <Switch
                  checked={rule.isActive}
                  onCheckedChange={checked =>
                    updateRule.mutate({ id: rule.id, isActive: checked })
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
