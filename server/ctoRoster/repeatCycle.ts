// Part of the target queries (server/ctoRoster.ts): detecting and repeating a shift cycle.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { ctoRosterShifts, CtoRosterShift } from "../../drizzle/schema";
import { addDaysToDateStr, daysBetweenDateStrs } from "../ctoRosterDates";
import { getAllCtoRosterMembers } from "./liveRoster";

// ── Repeat Cycle → Team ──────────────────────────────────────────────────────
// Takes a source member's already-entered shift pattern (whatever contiguous
// span they have, e.g. a 2-week rotation), tiles it forward to a chosen end
// date, and optionally copies the resulting calendar to every other member of
// the same team. Used for e.g. "Strop has a 2-week cycle entered — repeat it
// for the rest of the year and copy it to the rest of Team 1."

type CyclePatternDay = {
  shiftCode: string;
  shiftTime: string | null;
  comment: string | null;
  isActing: boolean;
} | null;

export interface RepeatCtoRosterCycleResult {
  cycleStart: string;
  cycleEnd: string;
  cycleLengthDays: number;
  daysFilledForSource: number;
  membersUpdated: number;
  changedByMember: Map<
    number,
    { count: number; startDate: string; endDate: string }
  >;
}

export interface CtoRosterCyclePreviewDay {
  date: string;
  shiftCode: string;
  shiftTime: string | null;
}

export interface CtoRosterCyclePreview {
  cycleStart: string;
  cycleEnd: string;
  cycleLengthDays: number;
  pattern: CtoRosterCyclePreviewDay[];
}

/**
 * The cycle boundary is the earliest-to-latest shift that actually has a real
 * code — a stray blank/cleared cell at either edge (e.g. from testing a cell
 * and clicking "Clear") must not silently stretch or shrink the detected
 * cycle length, since that throws off every date after it once repeated.
 */
function detectCycleBoundary(
  shifts: { shiftDate: string; shiftCode: string }[]
): { cycleStart: string; cycleEnd: string; cycleLengthDays: number } {
  const codedDates = shifts
    .filter(s => s.shiftCode !== "")
    .map(s => s.shiftDate)
    .sort();
  if (codedDates.length === 0) {
    throw new Error(
      "This member has no shifts entered yet — nothing to repeat."
    );
  }
  const cycleStart = codedDates[0];
  const cycleEnd = codedDates[codedDates.length - 1];
  const cycleLengthDays = daysBetweenDateStrs(cycleStart, cycleEnd) + 1;
  if (cycleLengthDays < 1 || cycleLengthDays > 90) {
    throw new Error(
      `Detected cycle looks wrong (${cycleLengthDays} days, ${cycleStart} to ${cycleEnd}) — check this member's existing shifts.`
    );
  }
  return { cycleStart, cycleEnd, cycleLengthDays };
}

/**
 * Read-only preview of a member's detected cycle, for the admin to check
 * (and, if needed, override) before actually applying the repeat.
 */
export async function detectCtoRosterCycle(
  memberId: number
): Promise<CtoRosterCyclePreview> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const shifts = await db
    .select()
    .from(ctoRosterShifts)
    .where(eq(ctoRosterShifts.memberId, memberId));
  const { cycleStart, cycleEnd, cycleLengthDays } = detectCycleBoundary(shifts);
  const byDate = new Map(shifts.map(s => [s.shiftDate, s]));
  const pattern: CtoRosterCyclePreviewDay[] = [];
  for (let i = 0; i < cycleLengthDays; i++) {
    const d = addDaysToDateStr(cycleStart, i);
    const s = byDate.get(d);
    pattern.push({
      date: d,
      shiftCode: s?.shiftCode ?? "",
      shiftTime: s?.shiftTime ?? null,
    });
  }
  return { cycleStart, cycleEnd, cycleLengthDays, pattern };
}

/**
 * Repeats a member's existing cycle forward to fillUntilDate — for the
 * source member themselves, and optionally for every other member of the
 * same team. The cycle boundary auto-detects from the member's coded shifts
 * (see detectCycleBoundary) unless cycleStartOverride/cycleEndOverride are
 * given, which the admin can supply after reviewing the detected preview.
 */
export async function repeatCtoRosterCycle(
  sourceMemberId: number,
  fillUntilDate: string,
  copyToTeam: boolean,
  updatedBy?: number,
  cycleStartOverride?: string,
  cycleEndOverride?: string
): Promise<RepeatCtoRosterCycleResult> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const sourceShifts = await db
    .select()
    .from(ctoRosterShifts)
    .where(eq(ctoRosterShifts.memberId, sourceMemberId));
  if (sourceShifts.length === 0) {
    throw new Error(
      "This member has no shifts entered yet — nothing to repeat."
    );
  }

  let cycleStart: string;
  let cycleEnd: string;
  let cycleLengthDays: number;
  if (cycleStartOverride && cycleEndOverride) {
    cycleStart = cycleStartOverride;
    cycleEnd = cycleEndOverride;
    cycleLengthDays = daysBetweenDateStrs(cycleStart, cycleEnd) + 1;
    if (cycleLengthDays < 1 || cycleLengthDays > 90) {
      throw new Error(
        `Cycle length looks wrong (${cycleLengthDays} days, ${cycleStart} to ${cycleEnd}).`
      );
    }
  } else {
    ({ cycleStart, cycleEnd, cycleLengthDays } =
      detectCycleBoundary(sourceShifts));
  }
  if (fillUntilDate <= cycleEnd) {
    throw new Error(
      `Fill-until date must be after the end of the existing cycle (${cycleEnd}).`
    );
  }

  const byDate = new Map(sourceShifts.map(s => [s.shiftDate, s]));
  const pattern: CyclePatternDay[] = [];
  for (let i = 0; i < cycleLengthDays; i++) {
    const d = addDaysToDateStr(cycleStart, i);
    const s = byDate.get(d);
    pattern.push(
      s
        ? {
            shiftCode: s.shiftCode,
            shiftTime: s.shiftTime,
            comment: s.comment,
            isActing: s.isActing ?? false,
          }
        : null
    );
  }

  // Tracks actual (not no-op) changes per member, for shift-change
  // notifications — see upsertRosterShiftNotification.
  const changedByMember = new Map<
    number,
    { count: number; startDate: string; endDate: string }
  >();
  const recordChange = (memberId: number, shiftDate: string) => {
    const cur = changedByMember.get(memberId);
    if (!cur) {
      changedByMember.set(memberId, {
        count: 1,
        startDate: shiftDate,
        endDate: shiftDate,
      });
      return;
    }
    cur.count++;
    if (shiftDate < cur.startDate) cur.startDate = shiftDate;
    if (shiftDate > cur.endDate) cur.endDate = shiftDate;
  };

  const isSameDay = (
    existing: CtoRosterShift | undefined,
    day: NonNullable<CyclePatternDay>
  ) =>
    (existing?.shiftCode ?? "") === day.shiftCode &&
    (existing?.shiftTime ?? null) === (day.shiftTime ?? null) &&
    (existing?.comment ?? null) === (day.comment ?? null) &&
    (existing?.isActing ?? false) === day.isActing;

  const writeDay = async (
    memberId: number,
    shiftDate: string,
    day: CyclePatternDay,
    existing: CtoRosterShift | undefined
  ) => {
    if (!day) return;
    if (!isSameDay(existing, day)) recordChange(memberId, shiftDate);
    await db
      .insert(ctoRosterShifts)
      .values({
        memberId,
        shiftDate,
        shiftCode: day.shiftCode,
        shiftTime: day.shiftTime,
        comment: day.comment,
        isActing: day.isActing,
        updatedBy,
      })
      .onDuplicateKeyUpdate({
        set: {
          shiftCode: day.shiftCode,
          shiftTime: day.shiftTime,
          comment: day.comment,
          isActing: day.isActing,
          updatedBy,
          taskingRevert: null,
        },
      });
  };

  // Fill the source member forward from the end of their existing cycle.
  let daysFilledForSource = 0;
  let cursor = addDaysToDateStr(cycleEnd, 1);
  while (cursor <= fillUntilDate) {
    const offset = daysBetweenDateStrs(cycleStart, cursor) % cycleLengthDays;
    const day = pattern[offset];
    if (day) {
      await writeDay(sourceMemberId, cursor, day, byDate.get(cursor));
      daysFilledForSource++;
    }
    cursor = addDaysToDateStr(cursor, 1);
  }

  // Copy the complete cycle (start to fillUntilDate) to the rest of the team.
  let membersUpdated = 0;
  if (copyToTeam) {
    const members = await getAllCtoRosterMembers();
    const sourceMember = members.find(m => m.id === sourceMemberId);
    if (!sourceMember) throw new Error("Member not found");
    const teammates = members.filter(
      m => m.teamId === sourceMember.teamId && m.id !== sourceMemberId
    );
    const teammateIds = teammates.map(t => t.id);
    const existingTeammateShifts = teammateIds.length
      ? await db
          .select()
          .from(ctoRosterShifts)
          .where(
            and(
              inArray(ctoRosterShifts.memberId, teammateIds),
              gte(ctoRosterShifts.shiftDate, cycleStart),
              lte(ctoRosterShifts.shiftDate, fillUntilDate)
            )
          )
      : [];
    const existingTeammateByKey = new Map(
      existingTeammateShifts.map(s => [`${s.memberId}_${s.shiftDate}`, s])
    );
    for (const teammate of teammates) {
      let d = cycleStart;
      while (d <= fillUntilDate) {
        const offset = daysBetweenDateStrs(cycleStart, d) % cycleLengthDays;
        const day = pattern[offset];
        if (day) {
          await writeDay(
            teammate.id,
            d,
            day,
            existingTeammateByKey.get(`${teammate.id}_${d}`)
          );
        }
        d = addDaysToDateStr(d, 1);
      }
      membersUpdated++;
    }
  }

  return {
    cycleStart,
    cycleEnd,
    cycleLengthDays,
    daysFilledForSource,
    membersUpdated,
    changedByMember,
  };
}
