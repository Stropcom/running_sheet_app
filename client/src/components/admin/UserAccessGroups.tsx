/**
 * Everyone with access to a Command, grouped by team (collapsible), plus a
 * "Visiting access" group for people from other Commands who were given
 * access. Replaces the single flat user table on Access Management.
 */

import { useState, type ReactNode } from "react";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CommandChip } from "@/components/admin/CommandChip";
import { LevelPill } from "@/components/admin/LevelPill";
import { COMMAND_LABELS, type CommandCode } from "@shared/commands";
import type { OperationShareRow } from "@shared/operationAccess";

export interface AdminUserRow {
  id: number;
  name: string;
  cin: string | null;
  command: CommandCode;
  team: string | null;
  username: string;
  role: string;
  archivedAt: number | null;
  lastSignedIn: Date | string | null;
}

const TEAMS: Array<{ value: string; label: string }> = [
  { value: "TEAM1", label: "TEAM 1" },
  { value: "TEAM2", label: "TEAM 2" },
  { value: "PTT", label: "PTT" },
  { value: "", label: "No team" },
];

export function matchesPerson(
  u: { name: string; cin: string | null },
  query: string
): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = `${u.name} ${u.cin ?? ""}`.toLowerCase();
  return tokens.every(t => hay.includes(t));
}

const HEAD =
  "text-xs uppercase tracking-wider text-muted-foreground font-medium";

function Group({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card/50">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5 bg-muted/30 px-3 py-2.5 text-left hover:bg-muted/50"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-sm font-semibold tracking-wide">{title}</span>
        <span className="text-xs text-muted-foreground">{count}</span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-border/60">
          {children}
        </div>
      )}
    </div>
  );
}

export function UserAccessGroups({
  users,
  viewCommand,
  shares,
  currentUserId,
  isLoading,
  roleBadge,
  onOpen,
}: {
  users: AdminUserRow[];
  viewCommand: CommandCode;
  /** Shares this admin may see (see admin.listShares). */
  shares: OperationShareRow[];
  currentUserId?: number;
  isLoading: boolean;
  roleBadge: (u: AdminUserRow) => ReactNode;
  onOpen: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const revoke = trpc.admin.revokeShare.useMutation();
  // Remove everything this Command shared with one person.
  const revokePerson = async (items: OperationShareRow[]) => {
    try {
      for (const s of items) await revoke.mutateAsync({ id: s.id });
      toast.success(
        `${items[0].userName}'s access removed. Anything already logged stays.`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove access.");
    } finally {
      utils.admin.listShares.invalidate();
      utils.admin.userShares.invalidate();
      utils.operation.list.invalidate();
    }
  };
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({
    TEAM1: true,
    visiting: true,
  });
  const searching = query.trim().length > 0;
  const isOpen = (k: string) => searching || !!open[k];
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }));
  const setAll = (v: boolean) =>
    setOpen({ TEAM1: v, TEAM2: v, PTT: v, "": v, visiting: v });

  const home = users.filter(u => u.command === viewCommand);

  // Shares INTO this Command's people, shown as small badges on their row.
  const incoming = new Map<number, OperationShareRow[]>();
  for (const s of shares) {
    if (s.userCommand === viewCommand && s.fromCommand !== viewCommand) {
      incoming.set(s.userId, [...(incoming.get(s.userId) ?? []), s]);
    }
  }
  // People from other Commands this Command shared with.
  const visiting = new Map<number, OperationShareRow[]>();
  for (const s of shares) {
    if (s.fromCommand === viewCommand && s.userCommand !== viewCommand) {
      visiting.set(s.userId, [...(visiting.get(s.userId) ?? []), s]);
    }
  }
  const visitingList = Array.from(visiting.values())
    .filter(items =>
      matchesPerson({ name: items[0].userName, cin: items[0].userCIN }, query)
    )
    .sort((a, b) => a[0].userName.localeCompare(b[0].userName));

  const scopeText = (s: OperationShareRow) =>
    s.operationName ?? `Every ${COMMAND_LABELS[s.fromCommand]} operation`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search people by name or CIN"
            aria-label="Search people"
            className="pl-8"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setAll(true)}
          >
            Expand all
          </button>
          {" · "}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setAll(false)}
          >
            Collapse all
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {TEAMS.map(t => {
            const inTeam = home.filter(u => (u.team ?? "") === t.value);
            const list = inTeam.filter(u => matchesPerson(u, query));
            if (t.value === "" && inTeam.length === 0) return null;
            if (searching && list.length === 0) return null;
            return (
              <Group
                key={t.value || "none"}
                title={t.label}
                count={
                  searching
                    ? `${list.length} of ${inTeam.length}`
                    : `${inTeam.length} member${inTeam.length === 1 ? "" : "s"}`
                }
                open={isOpen(t.value)}
                onToggle={() => toggle(t.value)}
              >
                <Table className="min-w-[560px] table-fixed">
                  <TableHeader>
                    <TableRow className="border-border/60">
                      <TableHead className={`${HEAD} w-[32%]`}>Name</TableHead>
                      <TableHead className={`${HEAD} w-[10%]`}>CIN</TableHead>
                      <TableHead
                        className={`${HEAD} hidden w-[16%] md:table-cell`}
                      >
                        Username
                      </TableHead>
                      <TableHead className={`${HEAD} w-[26%]`}>
                        Access level
                      </TableHead>
                      <TableHead
                        className={`${HEAD} hidden w-[16%] lg:table-cell`}
                      >
                        Last sign in
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-4 text-sm text-muted-foreground"
                        >
                          Nobody in this team yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      list.map(u => {
                        const archived = !!u.archivedAt;
                        const inc = incoming.get(u.id) ?? [];
                        return (
                          <TableRow
                            key={u.id}
                            className={`border-border/40 hover:bg-accent/10 ${archived ? "opacity-50" : ""}`}
                          >
                            <TableCell className="font-medium">
                              <button
                                type="button"
                                onClick={() => onOpen(u.id)}
                                className="text-left font-medium text-primary underline-offset-2 hover:underline"
                              >
                                {u.name}
                              </button>
                              {u.id === currentUserId && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  (you)
                                </span>
                              )}
                              {inc.length > 0 && (
                                <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                                  {Array.from(
                                    new Set(inc.map(s => s.fromCommand))
                                  ).map(c => {
                                    const n = inc.filter(
                                      s => s.fromCommand === c
                                    ).length;
                                    return (
                                      <CommandChip
                                        key={c}
                                        command={c}
                                        extra={`· ${n} shared`}
                                        title={inc
                                          .filter(s => s.fromCommand === c)
                                          .map(scopeText)
                                          .join(", ")}
                                      />
                                    );
                                  })}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm text-foreground/80">
                              {u.cin || "—"}
                            </TableCell>
                            <TableCell className="hidden font-mono text-sm text-muted-foreground md:table-cell">
                              {u.username}
                            </TableCell>
                            <TableCell>{roleBadge(u)}</TableCell>
                            <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                              {u.lastSignedIn
                                ? new Date(u.lastSignedIn).toLocaleString()
                                : "Never"}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </Group>
            );
          })}

          {(!searching || visitingList.length > 0) && (
            <Group
              title="Visiting access (from other Commands)"
              count={`${visitingList.length} ${visitingList.length === 1 ? "person" : "people"}`}
              open={isOpen("visiting")}
              onToggle={() => toggle("visiting")}
            >
              <Table className="min-w-[560px] table-fixed">
                <TableHeader>
                  <TableRow className="border-border/60">
                    <TableHead className={`${HEAD} w-[26%]`}>Name</TableHead>
                    <TableHead className={`${HEAD} w-[9%]`}>CIN</TableHead>
                    <TableHead className={`${HEAD} w-[15%]`}>
                      Home Command
                    </TableHead>
                    <TableHead className={`${HEAD} w-[24%]`}>
                      Can open
                    </TableHead>
                    <TableHead className={`${HEAD} w-[13%]`}>Access</TableHead>
                    <TableHead className={`${HEAD} w-[13%]`}>
                      <span className="sr-only">Revoke</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visitingList.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-4 text-sm text-muted-foreground"
                      >
                        Nobody outside {COMMAND_LABELS[viewCommand]} has been
                        given access yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visitingList.map(items => (
                      <TableRow
                        key={items[0].userId}
                        className="border-border/40 hover:bg-accent/10 align-top"
                      >
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => onOpen(items[0].userId)}
                            className="text-left font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {items[0].userName}
                          </button>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-foreground/80">
                          {items[0].userCIN ?? "—"}
                        </TableCell>
                        <TableCell>
                          <CommandChip command={items[0].userCommand} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {items.map(s => (
                            <div key={s.id}>{scopeText(s)}</div>
                          ))}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            {items.map(s => (
                              <LevelPill key={s.id} level={s.level} />
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            disabled={revoke.isPending}
                            title={`Remove all of ${items[0].userName}'s access to ${COMMAND_LABELS[viewCommand]}`}
                            onClick={() => revokePerson(items)}
                          >
                            Revoke
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Group>
          )}
          {searching &&
            home.every(u => !matchesPerson(u, query)) &&
            visitingList.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Nobody in {COMMAND_LABELS[viewCommand]} matches “{query}”.
              </p>
            )}
        </div>
      )}
    </div>
  );
}
