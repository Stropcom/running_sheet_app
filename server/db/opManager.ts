import { and, eq } from "drizzle-orm";

import { rosterCommand, rosterCommandForWrite } from "../rosterContext";

import {
  opManagerPriorityRows,
  opManagerTaskingCells,
  opManagerSupervisorContacts,
  opManagerPostedWeeks,
} from "../../drizzle/schema";

import { getDb } from "./core";

// ─── Operation Manager ────────────────────────────────────────────────────────

// Each Command has its own tasking board (see server/rosterScope.ts): inside a
// request every read and write is limited to the request's Command, and new
// rows are stamped with it.
const inOpCommand = (
  column:
    | typeof opManagerPriorityRows.command
    | typeof opManagerTaskingCells.command
    | typeof opManagerSupervisorContacts.command
    | typeof opManagerPostedWeeks.command
) => {
  const command = rosterCommand();
  return command ? eq(column, command) : undefined;
};

export async function getOpManagerPriorityBoard(weekStart: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(opManagerPriorityRows)
    .where(
      and(
        eq(opManagerPriorityRows.weekStart, weekStart),
        inOpCommand(opManagerPriorityRows.command)
      )
    )
    .orderBy(opManagerPriorityRows.sortOrder);
}

export async function saveOpManagerPriorityBoard(
  weekStart: string,
  rows: Array<{
    category: string;
    priority: number;
    operationId?: number | null;
    operationName?: string | null;
    team?: string | null;
    requestType?: string | null;
    sortOrder: number;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(opManagerPriorityRows)
    .where(
      and(
        eq(opManagerPriorityRows.weekStart, weekStart),
        inOpCommand(opManagerPriorityRows.command)
      )
    );
  if (rows.length === 0) return [];
  const command = rosterCommandForWrite();
  await db
    .insert(opManagerPriorityRows)
    .values(rows.map(r => ({ ...r, weekStart, command })));
  return getOpManagerPriorityBoard(weekStart);
}

export async function getOpManagerTaskingCalendar(weekStart: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(opManagerTaskingCells)
    .where(
      and(
        eq(opManagerTaskingCells.weekStart, weekStart),
        inOpCommand(opManagerTaskingCells.command)
      )
    );
}

export async function saveOpManagerTaskingCell(
  weekStart: string,
  dayIndex: number,
  teamRow: string,
  data: {
    shiftTime?: string | null;
    primaryTask?: string | null;
    secondaryTask?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(opManagerTaskingCells)
    .where(
      and(
        eq(opManagerTaskingCells.weekStart, weekStart),
        eq(opManagerTaskingCells.dayIndex, dayIndex),
        eq(opManagerTaskingCells.teamRow, teamRow),
        inOpCommand(opManagerTaskingCells.command)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(opManagerTaskingCells)
      .set(data)
      .where(eq(opManagerTaskingCells.id, existing[0].id));
  } else {
    await db.insert(opManagerTaskingCells).values({
      command: rosterCommandForWrite(),
      weekStart,
      dayIndex,
      teamRow,
      ...data,
    });
  }
}

export async function getOpManagerSupervisorContacts(weekStart: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(opManagerSupervisorContacts)
    .where(
      and(
        eq(opManagerSupervisorContacts.weekStart, weekStart),
        inOpCommand(opManagerSupervisorContacts.command)
      )
    )
    .orderBy(opManagerSupervisorContacts.sortOrder);
}

export async function saveOpManagerSupervisorContacts(
  weekStart: string,
  contacts: Array<{
    role: string;
    userId?: number | null;
    customName?: string | null;
    phone?: string | null;
    sortOrder: number;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(opManagerSupervisorContacts)
    .where(
      and(
        eq(opManagerSupervisorContacts.weekStart, weekStart),
        inOpCommand(opManagerSupervisorContacts.command)
      )
    );
  if (contacts.length === 0) return [];
  const command = rosterCommandForWrite();
  await db
    .insert(opManagerSupervisorContacts)
    .values(contacts.map(c => ({ ...c, weekStart, command })));
  return getOpManagerSupervisorContacts(weekStart);
}

// ─── Op Manager All Weeks (folder list) ───────────────────────────────────────
export async function listAllOpManagerWeeks() {
  const db = await getDb();
  if (!db) return [];
  const [taskingRows, contactRows, priorityRows, postedRows] =
    await Promise.all([
      db
        .selectDistinct({ weekStart: opManagerTaskingCells.weekStart })
        .from(opManagerTaskingCells)
        .where(inOpCommand(opManagerTaskingCells.command)),
      db
        .selectDistinct({ weekStart: opManagerSupervisorContacts.weekStart })
        .from(opManagerSupervisorContacts)
        .where(inOpCommand(opManagerSupervisorContacts.command)),
      db
        .selectDistinct({ weekStart: opManagerPriorityRows.weekStart })
        .from(opManagerPriorityRows)
        .where(inOpCommand(opManagerPriorityRows.command)),
      db
        .select()
        .from(opManagerPostedWeeks)
        .where(inOpCommand(opManagerPostedWeeks.command)),
    ]);
  const postedMap = new Map(postedRows.map(p => [p.weekStart, p.postedAt]));
  const allWeekStarts = new Set([
    ...taskingRows.map(r => r.weekStart),
    ...contactRows.map(r => r.weekStart),
    ...priorityRows.map(r => r.weekStart),
    ...postedRows.map(r => r.weekStart),
  ]);
  return Array.from(allWeekStarts)
    .sort((a, b) => b.localeCompare(a))
    .map(weekStart => ({
      weekStart,
      posted: postedMap.has(weekStart),
      postedAt: postedMap.get(weekStart) ?? null,
    }));
}

export async function copyOpManagerWeek(
  fromWeekStart: string,
  toWeekStart: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const contacts = await getOpManagerSupervisorContacts(fromWeekStart);
  if (contacts.length > 0) {
    await db
      .delete(opManagerSupervisorContacts)
      .where(
        and(
          eq(opManagerSupervisorContacts.weekStart, toWeekStart),
          inOpCommand(opManagerSupervisorContacts.command)
        )
      );
    await db.insert(opManagerSupervisorContacts).values(
      contacts.map(({ id: _id, weekStart: _ws, ...rest }) => ({
        ...rest,
        weekStart: toWeekStart,
      }))
    );
  }
  const priority = await getOpManagerPriorityBoard(fromWeekStart);
  if (priority.length > 0) {
    await db
      .delete(opManagerPriorityRows)
      .where(
        and(
          eq(opManagerPriorityRows.weekStart, toWeekStart),
          inOpCommand(opManagerPriorityRows.command)
        )
      );
    await db.insert(opManagerPriorityRows).values(
      priority.map(({ id: _id, weekStart: _ws, ...rest }) => ({
        ...rest,
        weekStart: toWeekStart,
      }))
    );
  }
  // Copy task names only — shiftTime always comes from auto-population
  const tasking = await getOpManagerTaskingCalendar(fromWeekStart);
  if (tasking.length > 0) {
    await db
      .delete(opManagerTaskingCells)
      .where(
        and(
          eq(opManagerTaskingCells.weekStart, toWeekStart),
          inOpCommand(opManagerTaskingCells.command)
        )
      );
    await db.insert(opManagerTaskingCells).values(
      tasking.map(({ id: _id, weekStart: _ws, shiftTime: _st, ...rest }) => ({
        ...rest,
        weekStart: toWeekStart,
        shiftTime: null,
      }))
    );
  }
  return { ok: true };
}

// ─── Op Manager Posted Weeks ─────────────────────────────────────────────────
export async function getPostedWeeks() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(opManagerPostedWeeks)
    .where(inOpCommand(opManagerPostedWeeks.command))
    .orderBy(opManagerPostedWeeks.weekStart);
}

export async function isWeekPosted(weekStart: string) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select()
    .from(opManagerPostedWeeks)
    .where(
      and(
        eq(opManagerPostedWeeks.weekStart, weekStart),
        inOpCommand(opManagerPostedWeeks.command)
      )
    );
  return rows.length > 0;
}

export async function markWeekPosted(weekStart: string, postedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Upsert — if already posted, update postedAt
  await db
    .insert(opManagerPostedWeeks)
    .values({
      command: rosterCommandForWrite(),
      weekStart,
      postedBy,
      postedAt: new Date(),
    })
    .onDuplicateKeyUpdate({ set: { postedAt: new Date(), postedBy } });
  return { weekStart, postedAt: new Date() };
}
