import { and, count, eq } from "drizzle-orm";

import {
  pickCopySourceWeek,
  type WeekContentCounts,
} from "@shared/opManagerWeeks";

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

/** The most recent week before `beforeWeekStart` that has supervisor contacts
 * or a priority board — what "Copy Last Week" copies from. A week can be
 * listed with only its calendar saved, so the latest listed week is not always
 * one with something to copy (see shared/opManagerWeeks.ts). */
export async function findOpManagerCopySourceWeek(
  beforeWeekStart: string
): Promise<WeekContentCounts | null> {
  const db = await getDb();
  if (!db) return null;
  const [contactWeeks, priorityWeeks] = await Promise.all([
    db
      .select({
        weekStart: opManagerSupervisorContacts.weekStart,
        n: count(),
      })
      .from(opManagerSupervisorContacts)
      .where(inOpCommand(opManagerSupervisorContacts.command))
      .groupBy(opManagerSupervisorContacts.weekStart),
    db
      .select({
        weekStart: opManagerPriorityRows.weekStart,
        n: count(),
      })
      .from(opManagerPriorityRows)
      .where(inOpCommand(opManagerPriorityRows.command))
      .groupBy(opManagerPriorityRows.weekStart),
  ]);
  const byWeek = new Map<string, WeekContentCounts>();
  const get = (weekStart: string) => {
    let w = byWeek.get(weekStart);
    if (!w) {
      w = { weekStart, contacts: 0, priority: 0 };
      byWeek.set(weekStart, w);
    }
    return w;
  };
  for (const r of contactWeeks) get(r.weekStart).contacts = Number(r.n);
  for (const r of priorityWeeks) get(r.weekStart).priority = Number(r.n);
  return pickCopySourceWeek(Array.from(byWeek.values()), beforeWeekStart);
}

/** Copies the supervisor contacts and the priority board from one week to
 * another — what the New Weekly Tasking dialog promises. The calendar is not
 * copied: its shift times come from the rotation and its tasks are set fresh
 * each week. Returns how many of each were copied (0 when the source had none,
 * in which case the destination is left as it was). */
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
  return { ok: true, contacts: contacts.length, priority: priority.length };
}

/** Removes one weekly tasking: its contacts, priority board, calendar and its
 * posted marker, for the request's Command only. */
export async function deleteOpManagerWeek(weekStart: string) {
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
  await db
    .delete(opManagerPriorityRows)
    .where(
      and(
        eq(opManagerPriorityRows.weekStart, weekStart),
        inOpCommand(opManagerPriorityRows.command)
      )
    );
  await db
    .delete(opManagerTaskingCells)
    .where(
      and(
        eq(opManagerTaskingCells.weekStart, weekStart),
        inOpCommand(opManagerTaskingCells.command)
      )
    );
  await db
    .delete(opManagerPostedWeeks)
    .where(
      and(
        eq(opManagerPostedWeeks.weekStart, weekStart),
        inOpCommand(opManagerPostedWeeks.command)
      )
    );
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
