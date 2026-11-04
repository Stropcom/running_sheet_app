/**
 * What the Recycle Bin keeps of a deleted CTO Weekly Tasking: its supervisor
 * contacts, priority board, calendar cells and the posted marker, as JSON in
 * `op_manager_deleted_weeks.snapshot`. Pure and tested
 * (server/opManagerWeekSnapshot.test.ts); the database code in
 * server/db/opManager.ts only reads and writes the rows.
 */
export interface SnapshotContact {
  role: string;
  userId: number | null;
  customName: string | null;
  phone: string | null;
  sortOrder: number;
}
export interface SnapshotPriorityRow {
  category: string;
  priority: number;
  operationId: number | null;
  operationName: string | null;
  team: string | null;
  requestType: string | null;
  sortOrder: number;
}
export interface SnapshotTaskingCell {
  dayIndex: number;
  teamRow: string;
  shiftTime: string | null;
  primaryTask: string | null;
  secondaryTask: string | null;
  /** Surveillance Team 1 and 2 blended that day (older snapshots: false). */
  blended: boolean;
}
export interface WeekSnapshot {
  contacts: SnapshotContact[];
  priority: SnapshotPriorityRow[];
  tasking: SnapshotTaskingCell[];
  /** The posted marker, or null when the week was never posted. */
  posted: { postedAt: number; postedBy: number } | null;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Keeps only the fields a week is rebuilt from (drops ids, week and Command,
 * which the restore sets itself). */
export function buildWeekSnapshot(input: {
  contacts: readonly {
    role: string;
    userId?: number | null;
    customName?: string | null;
    phone?: string | null;
    sortOrder: number;
  }[];
  priority: readonly {
    category: string;
    priority: number;
    operationId?: number | null;
    operationName?: string | null;
    team?: string | null;
    requestType?: string | null;
    sortOrder: number;
  }[];
  tasking: readonly {
    dayIndex: number;
    teamRow: string;
    shiftTime?: string | null;
    primaryTask?: string | null;
    secondaryTask?: string | null;
    blended?: boolean | null;
  }[];
  posted: { postedAt: Date | number; postedBy: number } | null;
}): WeekSnapshot {
  return {
    contacts: input.contacts.map(c => ({
      role: c.role,
      userId: c.userId ?? null,
      customName: c.customName ?? null,
      phone: c.phone ?? null,
      sortOrder: c.sortOrder,
    })),
    priority: input.priority.map(p => ({
      category: p.category,
      priority: p.priority,
      operationId: p.operationId ?? null,
      operationName: p.operationName ?? null,
      team: p.team ?? null,
      requestType: p.requestType ?? null,
      sortOrder: p.sortOrder,
    })),
    tasking: input.tasking.map(t => ({
      dayIndex: t.dayIndex,
      teamRow: t.teamRow,
      shiftTime: t.shiftTime ?? null,
      primaryTask: t.primaryTask ?? null,
      secondaryTask: t.secondaryTask ?? null,
      blended: t.blended === true,
    })),
    posted: input.posted
      ? {
          postedAt:
            input.posted.postedAt instanceof Date
              ? input.posted.postedAt.getTime()
              : input.posted.postedAt,
          postedBy: input.posted.postedBy,
        }
      : null,
  };
}

/** Reads a stored snapshot back, dropping anything malformed rather than
 * failing, so a damaged snapshot restores what it can. */
export function parseWeekSnapshot(json: string): WeekSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    raw = {};
  }
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const list = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v)
      ? v.filter(
          (x): x is Record<string, unknown> => !!x && typeof x === "object"
        )
      : [];
  const posted = o.posted as Record<string, unknown> | null | undefined;
  return {
    contacts: list(o.contacts).flatMap(c =>
      typeof c.role === "string" && num(c.sortOrder) !== null
        ? [
            {
              role: c.role,
              userId: num(c.userId),
              customName: str(c.customName),
              phone: str(c.phone),
              sortOrder: num(c.sortOrder)!,
            },
          ]
        : []
    ),
    priority: list(o.priority).flatMap(p =>
      typeof p.category === "string" &&
      num(p.priority) !== null &&
      num(p.sortOrder) !== null
        ? [
            {
              category: p.category,
              priority: num(p.priority)!,
              operationId: num(p.operationId),
              operationName: str(p.operationName),
              team: str(p.team),
              requestType: str(p.requestType),
              sortOrder: num(p.sortOrder)!,
            },
          ]
        : []
    ),
    tasking: list(o.tasking).flatMap(t =>
      num(t.dayIndex) !== null && typeof t.teamRow === "string"
        ? [
            {
              dayIndex: num(t.dayIndex)!,
              teamRow: t.teamRow,
              shiftTime: str(t.shiftTime),
              primaryTask: str(t.primaryTask),
              secondaryTask: str(t.secondaryTask),
              blended: t.blended === true,
            },
          ]
        : []
    ),
    posted:
      posted && num(posted.postedAt) !== null && num(posted.postedBy) !== null
        ? { postedAt: num(posted.postedAt)!, postedBy: num(posted.postedBy)! }
        : null,
  };
}

/** True when the snapshot has nothing in it to restore. */
export function isEmptySnapshot(s: WeekSnapshot): boolean {
  return (
    s.contacts.length === 0 &&
    s.priority.length === 0 &&
    s.tasking.length === 0 &&
    s.posted === null
  );
}
