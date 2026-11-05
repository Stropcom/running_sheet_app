/**
 * Carrying a start time set on the CTO Weekly Tasking over to the roster.
 *
 * When a team's shift on the tasking starts at a different time from the
 * roster's start for the people on duty that day, an admin can have the roster
 * brought into line. This is the rule for who is affected and what changes
 * (the page asks, the server applies). Pure and tested
 * (server/taskingRosterSync.test.ts).
 *
 *  - Who: the same people Outlook counts as on duty for that team and day: the
 *    team's members except those excluded from counts, a seconded person
 *    counting for the team they are seconded to on those dates, and only those
 *    on a duty shift type (ON_DUTY_CODES).
 *  - Which days: today and later (a past shift is never rewritten).
 *  - What: their start time becomes the tasking's. A start at or after 12:00
 *    makes it an afternoon shift (Day becomes Arvo, Day on-call becomes Arvo
 *    on-call); an earlier start makes it a day shift. Admin shifts keep their
 *    type (only the time changes). A time that is just the shift type's usual
 *    start is stored as no override.
 */
import { ON_DUTY_CODES, SHIFT_TIMES } from "./ctoRosterShiftUtils";
import type { ShiftCode } from "./ctoRosterShiftUtils";

export interface SyncMember {
  id: number;
  name: string;
  teamId: number;
  excludedFromCounts: boolean;
}
export interface SyncShift {
  memberId: number;
  shiftDate: string;
  shiftCode: string;
  shiftTime: string | null;
}
export interface SyncSecondment {
  memberId: number;
  destinationTeamId: number;
  startDate: string;
  endDate: string;
}
/** A team's start time on the tasking for one day. */
export interface SyncTarget {
  teamId: number;
  teamName: string;
  date: string;
  /** Start in minutes after midnight. */
  startMinutes: number;
}
export interface SyncChange {
  memberId: number;
  memberName: string;
  teamName: string;
  date: string;
  fromCode: string;
  toCode: string;
  /** The start the roster shows now and the start it will show, "HH:MM". */
  fromTime: string;
  toTime: string;
  /** What is stored in the shift's start-time override (null = the type's usual start). */
  storeTime: string | null;
}

/** Midday: a start at or after it is an afternoon shift. */
export const AFTERNOON_FROM_MINUTES = 12 * 60;

export const toClock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** The shift type after the start moved to `startMinutes`. */
export function codeForStart(code: string, startMinutes: number): string {
  const afternoon = startMinutes >= AFTERNOON_FROM_MINUTES;
  if (code === "d" || code === "a") return afternoon ? "a" : "d";
  if (code === "doc" || code === "aoc") return afternoon ? "aoc" : "doc";
  return code; // Admin shifts keep their type
}

/** The start a shift shows: its override, or its type's usual start. */
export function shownStart(code: string, shiftTime: string | null): string {
  return shiftTime || SHIFT_TIMES[code as ShiftCode] || "";
}

export function planTaskingRosterSync(input: {
  targets: SyncTarget[];
  members: SyncMember[];
  shifts: SyncShift[];
  secondments: SyncSecondment[];
  /** Today, YYYY-MM-DD (the unit's own date). */
  today: string;
}): SyncChange[] {
  const { targets, members, shifts, secondments, today } = input;
  const shiftOf = new Map<string, SyncShift>();
  for (const s of shifts) shiftOf.set(`${s.memberId}|${s.shiftDate}`, s);
  const secondmentOf = new Map<number, SyncSecondment>();
  for (const s of secondments) secondmentOf.set(s.memberId, s);

  const out: SyncChange[] = [];
  for (const t of targets) {
    if (t.date < today) continue;
    const toTime = toClock(t.startMinutes);
    for (const m of members) {
      if (m.excludedFromCounts) continue;
      const sec = secondmentOf.get(m.id);
      const seconded =
        !!sec && t.date >= sec.startDate && t.date <= sec.endDate;
      const effectiveTeam = seconded ? sec!.destinationTeamId : m.teamId;
      if (effectiveTeam !== t.teamId) continue;
      const shift = shiftOf.get(`${m.id}|${t.date}`);
      if (!shift || !ON_DUTY_CODES.has(shift.shiftCode)) continue;
      const toCode = codeForStart(shift.shiftCode, t.startMinutes);
      const fromTime = shownStart(shift.shiftCode, shift.shiftTime);
      if (toCode === shift.shiftCode && fromTime === toTime) continue;
      out.push({
        memberId: m.id,
        memberName: m.name,
        teamName: t.teamName,
        date: t.date,
        fromCode: shift.shiftCode,
        toCode,
        fromTime,
        toTime,
        storeTime:
          toTime === (SHIFT_TIMES[toCode as ShiftCode] || "") ? null : toTime,
      });
    }
  }
  return out;
}

export interface SyncGroup {
  teamName: string;
  date: string;
  toTime: string;
  members: number;
  /** The distinct starts they have now, "07:00" or "07:00, 13:00". */
  fromTimes: string;
  /** How many change between a day and an afternoon shift. */
  typeChanges: number;
}

/** The changes as one line per team and day, for the question. */
export function groupSyncChanges(changes: readonly SyncChange[]): SyncGroup[] {
  const map = new Map<string, SyncChange[]>();
  for (const c of changes) {
    const k = `${c.date}|${c.teamName}`;
    map.set(k, [...(map.get(k) ?? []), c]);
  }
  return Array.from(map.values())
    .map(list => ({
      teamName: list[0].teamName,
      date: list[0].date,
      toTime: list[0].toTime,
      members: list.length,
      fromTimes: Array.from(new Set(list.map(c => c.fromTime || "no time")))
        .sort()
        .join(", "),
      typeChanges: list.filter(c => c.toCode !== c.fromCode).length,
    }))
    .sort((a, b) =>
      a.date === b.date
        ? a.teamName.localeCompare(b.teamName)
        : a.date < b.date
          ? -1
          : 1
    );
}
