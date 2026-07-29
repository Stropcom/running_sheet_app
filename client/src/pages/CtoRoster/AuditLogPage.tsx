import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { format, parseISO } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { SHIFT_LABELS, SHIFT_TIMES } from "@shared/ctoRosterShiftUtils";
import {
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  User,
  Calendar,
  Layers,
  Copy,
  UserPlus,
  UserMinus,
  ArrowRightLeft,
  ArrowRight,
  Clock,
  Star,
  MessageSquare,
  Info,
} from "lucide-react";

const ACTION_META: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  upsert_shift: {
    label: "Shift Edit",
    icon: Calendar,
    color: "bg-blue-100 text-blue-700 border-blue-200",
  },
  bulk_update: {
    label: "Bulk Edit",
    icon: Layers,
    color: "bg-violet-100 text-violet-700 border-violet-200",
  },
  bulk_copy: {
    label: "Bulk Copy",
    icon: Copy,
    color: "bg-cyan-100 text-cyan-700 border-cyan-200",
  },
  add_member: {
    label: "Add Member",
    icon: UserPlus,
    color: "bg-green-100 text-green-700 border-green-200",
  },
  delete_member: {
    label: "Del Member",
    icon: UserMinus,
    color: "bg-red-100 text-red-700 border-red-200",
  },
  change_team: {
    label: "Change Team",
    icon: ArrowRightLeft,
    color: "bg-amber-100 text-amber-700 border-amber-200",
  },
};

const PAGE_SIZE = 50;

function safeDate(
  val: string | Date | null | undefined,
  includeTime = true
): string {
  if (!val) return "—";
  try {
    const d = typeof val === "string" ? parseISO(val) : val;
    return format(d, includeTime ? "d MMM yyyy, HH:mm" : "d MMM yyyy");
  } catch {
    return String(val);
  }
}

function parseJson(
  raw: string | null | undefined
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function shiftLabel(code: string | null | undefined): string {
  if (!code) return "(clear)";
  return SHIFT_LABELS[code as keyof typeof SHIFT_LABELS] ?? code.toUpperCase();
}

function shiftTime(
  code: string | null | undefined,
  override?: string | null
): string {
  if (override) return override;
  if (!code) return "";
  return SHIFT_TIMES[code as keyof typeof SHIFT_TIMES] ?? "";
}

/** Pill showing a shift code with its label */
function ShiftPill({
  code,
  time,
}: {
  code: string | null | undefined;
  time?: string | null;
}) {
  const label = shiftLabel(code);
  const t = shiftTime(code, time);
  if (!code)
    return (
      <span className="text-muted-foreground italic text-xs">(empty)</span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted border border-border/60 text-xs font-semibold">
      <span className="uppercase text-[10px] text-muted-foreground">
        {code}
      </span>
      <span>{label}</span>
      {t && <span className="text-muted-foreground font-normal">· {t}</span>}
    </span>
  );
}

type AuditEntry = {
  id: number;
  userId: number | null;
  userName: string | null;
  action: string;
  memberId: number | null;
  memberName: string | null;
  shiftDate: string | null;
  oldValue: string | null;
  newValue: string | null;
  detail: string | null;
  createdAt: Date;
};

function AuditDetailSheet({
  entry,
  onClose,
}: {
  entry: AuditEntry | null;
  onClose: () => void;
}) {
  if (!entry) return null;
  const meta = ACTION_META[entry.action] ?? {
    label: entry.action,
    icon: ClipboardList,
    color: "bg-muted text-muted-foreground border-border",
  };
  const Icon = meta.icon;
  const oldVal = parseJson(entry.oldValue);
  const newVal = parseJson(entry.newValue);

  return (
    <Sheet
      open={!!entry}
      onOpenChange={o => {
        if (!o) onClose();
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Icon className="h-4 w-4" />
            Change Detail
          </SheetTitle>
        </SheetHeader>

        {/* Who / When */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium">{entry.userName ?? "Unknown"}</span>
            <span className="text-muted-foreground text-xs ml-auto">
              {safeDate(entry.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge
              variant="outline"
              className={cn("text-[10px] gap-1 border font-medium", meta.color)}
            >
              <Icon className="h-2.5 w-2.5" />
              {meta.label}
            </Badge>
          </div>
        </div>

        <Separator className="mb-4" />

        {/* Member & Date */}
        {(entry.memberName || entry.shiftDate) && (
          <div className="space-y-2 mb-4">
            {entry.memberName && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground text-xs">Member:</span>
                <span className="font-medium text-sm">{entry.memberName}</span>
              </div>
            )}
            {entry.shiftDate && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground text-xs">Date:</span>
                <span className="font-medium text-sm">
                  {safeDate(entry.shiftDate, false)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Shift change: from → to */}
        {(oldVal || newVal) && entry.action === "upsert_shift" && (
          <>
            <Separator className="mb-4" />
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Shift Change
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {/* FROM */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    From
                  </span>
                  <ShiftPill
                    code={oldVal ? String(oldVal.shiftCode ?? "") : null}
                    time={oldVal ? String(oldVal.shiftTime ?? "") : null}
                  />
                  {Boolean(oldVal?.isActing) && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                      <Star className="h-2.5 w-2.5 fill-amber-500" /> Acting
                    </span>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground mt-4 flex-shrink-0" />
                {/* TO */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    To
                  </span>
                  <ShiftPill
                    code={newVal ? String(newVal.shiftCode ?? "") : null}
                    time={newVal ? String(newVal.shiftTime ?? "") : null}
                  />
                  {Boolean(newVal?.isActing) && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600">
                      <Star className="h-2.5 w-2.5 fill-amber-500" /> Acting
                    </span>
                  )}
                </div>
              </div>

              {/* Time change */}
              {(oldVal?.shiftTime != null || newVal?.shiftTime != null) && (
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Time:</span>
                  <span>{String(oldVal?.shiftTime ?? "default")}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">
                    {String(newVal?.shiftTime ?? "default")}
                  </span>
                </div>
              )}

              {/* Comment */}
              {newVal?.comment != null && (
                <div className="flex items-start gap-2 text-xs">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                  <span className="text-muted-foreground">Note:</span>
                  <span className="italic">{String(newVal.comment ?? "")}</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Bulk / other detail */}
        {entry.detail && (
          <>
            <Separator className="mb-4" />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Detail
              </p>
              <div className="flex items-start gap-2 text-sm">
                <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <span className="text-foreground/80 leading-relaxed">
                  {entry.detail}
                </span>
              </div>
            </div>
          </>
        )}

        {/* Raw new value for non-shift actions */}
        {newVal && entry.action !== "upsert_shift" && !entry.detail && (
          <>
            <Separator className="mb-4" />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Change Data
              </p>
              <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(newVal, null, 2)}
              </pre>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function AuditLogPage() {
  const [page, setPage] = useState(0);
  const [filterAction, setFilterAction] = useState<string | undefined>(
    undefined
  );
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const { data, isLoading } = trpc.ctoRoster.audit.list.useQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    action: filterAction,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <DashboardLayout>
      <div
        className="flex flex-col overflow-hidden px-4 py-3"
        style={{ height: "calc(100vh - 0px)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 flex-shrink-0">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Audit Log</h1>
            <p className="text-xs text-muted-foreground">
              All changes to the roster — click a row for full detail
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            {[
              undefined,
              "upsert_shift",
              "bulk_update",
              "bulk_copy",
              "add_member",
              "delete_member",
              "change_team",
            ].map(a => {
              const meta = a ? ACTION_META[a] : null;
              return (
                <button
                  key={a ?? "all"}
                  onClick={() => {
                    setFilterAction(a);
                    setPage(0);
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                    filterAction === a
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {a ? (meta?.label ?? a) : "All"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-border/60 bg-card">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
              <ClipboardList className="h-8 w-8 opacity-30" />
              <p className="text-sm">No audit entries yet.</p>
              <p className="text-xs opacity-60">
                Changes to shifts will appear here.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b border-border/60 z-10">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    When
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Who
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Action
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                    Member
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                    Date
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {entries.map(e => {
                  const meta = ACTION_META[e.action] ?? {
                    label: e.action,
                    icon: ClipboardList,
                    color: "bg-muted text-muted-foreground border-border",
                  };
                  const Icon = meta.icon;
                  const oldVal = parseJson(e.oldValue);
                  const newVal = parseJson(e.newValue);

                  // Build a concise summary for the Change column
                  let changeSummary: React.ReactNode = null;
                  if (e.action === "upsert_shift" && newVal) {
                    const fromCode = oldVal
                      ? String(oldVal.shiftCode ?? "") || null
                      : undefined;
                    const toCode =
                      newVal.shiftCode != null
                        ? String(newVal.shiftCode)
                        : null;
                    changeSummary = (
                      <span className="inline-flex items-center gap-1 flex-wrap">
                        {fromCode !== undefined ? (
                          <span className="text-muted-foreground text-[10px] font-medium uppercase">
                            {fromCode || "—"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">
                            new
                          </span>
                        )}
                        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-[10px] font-semibold uppercase">
                          {toCode || "—"}
                        </span>
                        {Boolean(newVal.isActing) && (
                          <Star className="h-2.5 w-2.5 text-amber-500 fill-amber-500" />
                        )}
                      </span>
                    );
                  } else if (e.detail) {
                    changeSummary = (
                      <span className="text-xs text-foreground/70 line-clamp-1">
                        {e.detail}
                      </span>
                    );
                  }

                  return (
                    <tr
                      key={e.id}
                      className="hover:bg-muted/40 transition-colors cursor-pointer"
                      onClick={() => setSelectedEntry(e as AuditEntry)}
                    >
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {safeDate(e.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs font-medium truncate max-w-[100px]">
                            {e.userName ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] gap-1 border font-medium",
                            meta.color
                          )}
                        >
                          <Icon className="h-2.5 w-2.5" />
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs font-medium">
                          {e.memberName ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {e.shiftDate ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {changeSummary ?? (
                          <span className="text-muted-foreground text-xs">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-3 flex-shrink-0 text-xs text-muted-foreground">
          <span>
            {total} total entr{total === 1 ? "y" : "ies"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span>
              Page {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Detail drawer */}
        <AuditDetailSheet
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      </div>
    </DashboardLayout>
  );
}
