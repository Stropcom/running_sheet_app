import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  FileText,
  AlertCircle,
  Users,
  User,
  Shield,
  PenLine,
  CheckSquare,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeams } from "@/lib/teams";

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncompleteSheet {
  sheetId: number;
  sheetTitle: string;
  operationId: number;
  operationName: string;
  operationStatus: string;
  teamCins: { cin: string; isTeamLeader?: boolean; isAuthor?: boolean }[];
  teams: string[];
  isTeamBlended: boolean;
  teamLeaderCin: string | null;
  authorCin: string | null;
  uncertifiedRowCount: number;
  govPercent: number;
  isClosed: boolean;
  createdAt: string | Date;
}

interface TodoUser {
  cin: string;
  name: string;
  team: string | null;
  uncertifiedCount: number;
  governanceCount: number;
  totalCount: number;
}

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id: "operation",
    label: "Operation",
    icon: FileText,
    color: "text-blue-700",
  },
  {
    id: "team",
    label: "Team",
    icon: Users,
    color: "text-blue-700 dark:text-blue-300",
  },
  {
    id: "teamLeader",
    label: "Team Leader",
    icon: Shield,
    color: "text-amber-700 dark:text-amber-300",
  },
  {
    id: "author",
    label: "Author",
    icon: PenLine,
    color: "text-violet-700 dark:text-violet-300",
  },
  {
    id: "outstanding",
    label: "Outstanding To-Do",
    icon: AlertCircle,
    color: "text-red-700 dark:text-red-300",
  },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// The server sends each person's team by name (User Management → Teams).
function teamLabel(team: string) {
  return team;
}

function incompleteReasons(sheet: IncompleteSheet): string[] {
  const reasons: string[] = [];
  if (sheet.uncertifiedRowCount > 0)
    reasons.push(
      `${sheet.uncertifiedRowCount} uncertified row${sheet.uncertifiedRowCount !== 1 ? "s" : ""}`
    );
  if (sheet.govPercent < 100) reasons.push(`Governance ${sheet.govPercent}%`);
  if (!sheet.isClosed) reasons.push("Not closed");
  return reasons;
}

// ─── Sheet Card ───────────────────────────────────────────────────────────────

function SheetCard({
  sheet,
  onNavigate,
}: {
  sheet: IncompleteSheet;
  onNavigate: (id: number) => void;
}) {
  const reasons = incompleteReasons(sheet);
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-background border border-border hover:border-border transition-colors group">
      <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground/70" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate">
            {sheet.sheetTitle}
          </span>
          <span className="text-xs text-foreground/70">
            — {sheet.operationName}
          </span>
          {sheet.operationStatus !== "active" && (
            <span className="text-xs px-1.5 py-0 rounded border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium uppercase tracking-wide">
              {sheet.operationStatus.replace("_", " ")}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {reasons.map(r => (
            <span
              key={r}
              className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 font-medium"
            >
              <AlertCircle className="h-2.5 w-2.5" />
              {r}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={() => onNavigate(sheet.sheetId)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent"
        title="Open running sheet"
      >
        <ExternalLink className="h-3.5 w-3.5 text-foreground/70" />
      </button>
    </div>
  );
}

// ─── Collapsible Group ────────────────────────────────────────────────────────

function GroupPanel({
  title,
  count,
  icon: Icon,
  iconColor,
  children,
  defaultOpen = false,
}: {
  title: string;
  count: number;
  icon: React.ElementType;
  iconColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2.5 px-4 py-3 bg-muted/70 hover:bg-muted transition-colors ${open ? "border-b border-border" : ""}`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <span className="flex-1 text-sm font-semibold text-left text-foreground">
          {title}
        </span>
        <span className="text-xs text-foreground/70 font-medium mr-2">
          {count} sheet{count !== 1 ? "s" : ""}
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-foreground/70" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-foreground/70" />
        )}
      </button>
      {open && <div className="p-3 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

// ─── Category Panel: Operation ────────────────────────────────────────────────

function ByOperation({
  sheets,
  onNavigate,
}: {
  sheets: IncompleteSheet[];
  onNavigate: (id: number) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, IncompleteSheet[]>();
    for (const s of sheets) {
      const key = s.operationName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [sheets]);

  return (
    <div className="flex flex-col gap-2">
      {grouped.map(([opName, group]) => (
        <GroupPanel
          key={opName}
          title={opName}
          count={group.length}
          icon={FileText}
          iconColor="text-blue-700"
        >
          {group.map(s => (
            <SheetCard key={s.sheetId} sheet={s} onNavigate={onNavigate} />
          ))}
        </GroupPanel>
      ))}
    </div>
  );
}

// ─── Category Panel: Team ─────────────────────────────────────────────────────

function ByTeam({
  sheets,
  onNavigate,
}: {
  sheets: IncompleteSheet[];
  onNavigate: (id: number) => void;
}) {
  const teamOrder = useTeams().map(t => t.name);
  const grouped = useMemo(() => {
    const map = new Map<string, IncompleteSheet[]>();
    for (const s of sheets) {
      const key = s.isTeamBlended
        ? "Team Blended"
        : s.teams.length === 1
          ? teamLabel(s.teams[0])
          : s.teams.length === 0
            ? "No Team Assigned"
            : "Team Blended";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    // Sort: the Command's teams in their own order, then Team Blended,
    // then No Team Assigned.
    const order = [...teamOrder, "Team Blended", "No Team Assigned"];
    return Array.from(map.entries()).sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [sheets, teamOrder]);

  return (
    <div className="flex flex-col gap-2">
      {grouped.map(([teamName, group]) => (
        <GroupPanel
          key={teamName}
          title={teamName}
          count={group.length}
          icon={Users}
          iconColor={
            teamName === "Team Blended"
              ? "text-purple-700 dark:text-purple-300"
              : "text-blue-700 dark:text-blue-300"
          }
        >
          {group.map(s => (
            <SheetCard key={s.sheetId} sheet={s} onNavigate={onNavigate} />
          ))}
        </GroupPanel>
      ))}
    </div>
  );
}

// ─── Category Panel: Team Leader ──────────────────────────────────────────────

function ByTeamLeader({
  sheets,
  onNavigate,
}: {
  sheets: IncompleteSheet[];
  onNavigate: (id: number) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, IncompleteSheet[]>();
    for (const s of sheets) {
      const key = s.teamLeaderCin ?? "No Team Leader";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [sheets]);

  return (
    <div className="flex flex-col gap-2">
      {grouped.map(([tl, group]) => (
        <GroupPanel
          key={tl}
          title={tl}
          count={group.length}
          icon={Shield}
          iconColor="text-amber-700 dark:text-amber-300"
        >
          {group.map(s => (
            <SheetCard key={s.sheetId} sheet={s} onNavigate={onNavigate} />
          ))}
        </GroupPanel>
      ))}
    </div>
  );
}

// ─── Category Panel: Author ───────────────────────────────────────────────────

function ByAuthor({
  sheets,
  onNavigate,
}: {
  sheets: IncompleteSheet[];
  onNavigate: (id: number) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, IncompleteSheet[]>();
    for (const s of sheets) {
      const key = s.authorCin ?? "No Author";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [sheets]);

  return (
    <div className="flex flex-col gap-2">
      {grouped.map(([author, group]) => (
        <GroupPanel
          key={author}
          title={author}
          count={group.length}
          icon={PenLine}
          iconColor="text-violet-700 dark:text-violet-300"
        >
          {group.map(s => (
            <SheetCard key={s.sheetId} sheet={s} onNavigate={onNavigate} />
          ))}
        </GroupPanel>
      ))}
    </div>
  );
}

// ─── Category Panel: Outstanding To-Do Actions ───────────────────────────────

function ByOutstandingTodos({ users }: { users: TodoUser[] }) {
  return (
    <div className="flex flex-col gap-2">
      {users.length === 0 && (
        <p className="text-sm text-foreground/70 text-center py-4">
          No outstanding to-do actions.
        </p>
      )}
      {users.map((u, idx) => (
        <div
          key={u.cin}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background border border-border"
        >
          {/* Rank */}
          <span className="text-xs font-bold text-foreground/70 w-5 text-center shrink-0">
            #{idx + 1}
          </span>
          {/* Avatar */}
          <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center shrink-0">
            <User className="h-3.5 w-3.5 text-foreground/70" />
          </div>
          {/* Name / CIN */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">
                {u.cin}
              </span>
              <span className="text-xs text-foreground/70">{u.name}</span>
              {u.team && (
                <span className="text-xs px-1.5 py-0 rounded border border-blue-300 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-medium">
                  {teamLabel(u.team)}
                </span>
              )}
            </div>
            <div className="flex gap-2 mt-1 flex-wrap">
              {u.uncertifiedCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 font-medium">
                  {u.uncertifiedCount} uncertified row
                  {u.uncertifiedCount !== 1 ? "s" : ""}
                </span>
              )}
              {u.governanceCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium">
                  {u.governanceCount} governance item
                  {u.governanceCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          {/* Total badge */}
          <div className="flex flex-col items-center shrink-0">
            <span
              className={`text-lg font-bold ${u.totalCount > 10 ? "text-red-700 dark:text-red-300" : u.totalCount > 5 ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}
            >
              {u.totalCount}
            </span>
            <span className="text-xs text-foreground/70 uppercase tracking-wide">
              total
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [, setLocation] = useLocation();
  const [activeCategories, setActiveCategories] = useState<Set<CategoryId>>(
    new Set(CATEGORIES.map(c => c.id))
  );

  const {
    data: sheets = [],
    isLoading: sheetsLoading,
    refetch: refetchSheets,
  } = trpc.reports.incompleteSheets.useQuery();
  const {
    data: todoUsers = [],
    isLoading: todosLoading,
    refetch: refetchTodos,
  } = trpc.reports.outstandingTodos.useQuery();

  const isLoading = sheetsLoading || todosLoading;

  function toggleCategory(id: CategoryId) {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleNavigate(sheetId: number) {
    setLocation(`/sheet/${sheetId}`);
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6 w-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border-2 border-slate-300 bg-slate-50 p-2.5 dark:border-slate-600 dark:bg-slate-800">
              <BarChart3 className="h-5 w-5 text-slate-700 dark:text-slate-300" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Outstanding Actions
              </h1>
              <p className="text-xs text-foreground/70 mt-0.5">
                Incomplete running sheets and outstanding actions
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              refetchSheets();
              refetchTodos();
            }}
            className="flex items-center gap-1.5 text-xs text-foreground/70 hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-accent"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {/* Summary bar */}
        {!isLoading && (
          <div className="flex items-center gap-4 flex-wrap px-4 py-3 rounded-xl bg-card shadow-sm border border-border">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-700 dark:text-red-300" />
              <span className="text-sm font-semibold text-foreground">
                {sheets.length}
              </span>
              <span className="text-xs text-foreground/70">
                incomplete sheet{sheets.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="h-4 w-px bg-border/60" />
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-700 dark:text-blue-300" />
              <span className="text-sm font-semibold text-foreground">
                {todoUsers.length}
              </span>
              <span className="text-xs text-foreground/70">
                officer{todoUsers.length !== 1 ? "s" : ""} with outstanding
                actions
              </span>
            </div>
          </div>
        )}

        {/* Category toggles */}
        <div>
          <p className="text-xs text-foreground/70 mb-2 font-medium uppercase tracking-wide">
            Show categories
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {CATEGORIES.map((cat, i) => {
              const Icon = cat.icon;
              const active = activeCategories.has(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={`flex flex-col items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all ${i === CATEGORIES.length - 1 ? "col-span-2 sm:col-span-1" : ""} ${
                    active
                      ? "border-primary bg-primary/10 text-foreground shadow-sm"
                      : "border-border bg-card text-foreground/70 hover:border-foreground/40 hover:text-foreground"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${active ? cat.color : "text-foreground/70"}`}
                  />
                  <span className="text-center leading-tight">{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && sheets.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <CheckSquare className="h-10 w-10 text-green-700 dark:text-green-300" />
            <p className="text-sm font-medium text-foreground">
              All running sheets are complete
            </p>
            <p className="text-xs text-foreground/70">
              No incomplete or outstanding items found.
            </p>
          </div>
        )}

        {/* Category panels */}
        {!isLoading && sheets.length > 0 && (
          <div className="flex flex-col gap-6">
            {activeCategories.has("operation") && (
              <section>
                <div className="flex items-center gap-2 mb-2 border-b border-border pb-1.5">
                  <FileText className="h-4 w-4 text-blue-700" />
                  <h2 className="text-[13px] font-bold uppercase tracking-wide text-foreground">
                    By Operation
                  </h2>
                </div>
                <ByOperation
                  sheets={sheets as IncompleteSheet[]}
                  onNavigate={handleNavigate}
                />
              </section>
            )}

            {activeCategories.has("team") && (
              <section>
                <div className="flex items-center gap-2 mb-2 border-b border-border pb-1.5">
                  <Users className="h-4 w-4 text-blue-700 dark:text-blue-300" />
                  <h2 className="text-[13px] font-bold uppercase tracking-wide text-foreground">
                    By Team
                  </h2>
                </div>
                <ByTeam
                  sheets={sheets as IncompleteSheet[]}
                  onNavigate={handleNavigate}
                />
              </section>
            )}

            {activeCategories.has("teamLeader") && (
              <section>
                <div className="flex items-center gap-2 mb-2 border-b border-border pb-1.5">
                  <Shield className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                  <h2 className="text-[13px] font-bold uppercase tracking-wide text-foreground">
                    By Team Leader
                  </h2>
                </div>
                <ByTeamLeader
                  sheets={sheets as IncompleteSheet[]}
                  onNavigate={handleNavigate}
                />
              </section>
            )}

            {activeCategories.has("author") && (
              <section>
                <div className="flex items-center gap-2 mb-2 border-b border-border pb-1.5">
                  <PenLine className="h-4 w-4 text-violet-700 dark:text-violet-300" />
                  <h2 className="text-[13px] font-bold uppercase tracking-wide text-foreground">
                    By Author
                  </h2>
                </div>
                <ByAuthor
                  sheets={sheets as IncompleteSheet[]}
                  onNavigate={handleNavigate}
                />
              </section>
            )}
          </div>
        )}

        {/* Outstanding To-Do Actions — always shown when toggled (even if no incomplete sheets) */}
        {!isLoading && activeCategories.has("outstanding") && (
          <section>
            <div className="flex items-center gap-2 mb-2 border-b border-border pb-1.5">
              <AlertCircle className="h-4 w-4 text-red-700 dark:text-red-300" />
              <h2 className="text-[13px] font-bold uppercase tracking-wide text-foreground">
                By Outstanding To-Do Actions
              </h2>
            </div>
            <ByOutstandingTodos users={todoUsers as TodoUser[]} />
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
