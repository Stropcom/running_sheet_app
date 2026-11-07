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
 *  - A team's rest day turned into a working shift: when nobody in the team is
 *    on a duty shift that day (the whole team is on its rostered day off) and
 *    the tasking now has the team working, the team's Rest Day members become a
 *    Day or Arvo shift at the tasking's start (an Admin task makes it an Admin
 *    shift). One person's own rest day, while others in the team are on duty,
 *    is left alone, and so are Leave, Court, Training and Deployment.
 *  - A team that is Rest on-call ("o": a rest day, and the member is also on
 *    call) with nobody on duty, that the tasking now has working: its Rest
 *    on-call members become the on-call version of the working shift (Day
 *    on-call, Arvo on-call, or Admin on-call for an Admin task), so they keep
 *    being on call and now work the shift too.
 *  - Back again: a shift the sync itself turned from a Rest Day or Rest on-call
 *    into a working shift (it is marked: `taskingRevert`) goes back to what it
 *    was when the tasking no longer has a shift for that team and day (RDO or
 *    none). A shift anyone has touched since is not marked, so it is left alone.
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
  /** The code ("r" or "o") the sync turned this shift from, if it did and nobody has touched it since. */
  taskingRevert?: string | null;
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
  /** Start in minutes after midnight; null when the tasking has no shift for the team that day (RDO or none). */
  startMinutes: number | null;
  /** The tasking's task for the team that day is Admin (decides the type when
   * a rest day becomes a working shift). */
  admin?: boolean;
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
  /** The roster had the person on a Rest Day (the team's day off) and the tasking now has the team working. */
  fromRest: boolean;
  /** The roster had the person On Call (nobody in the team on duty) and the tasking now has the team working; they become the on-call version of the shift. */
  fromOnCall: boolean;
  /** The shift was turned from Rest Day / Rest on-call earlier and the tasking no longer has the team working: it goes back to this code. */
  backTo: string | null;
  /** What to remember on the shift after the change: the code it was turned from, or null. */
  revertTo: string | null;
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
    // The team's members for this day, with their roster shift.
    const crew: { m: SyncMember; shift: SyncShift | undefined }[] = [];
    for (const m of members) {
      if (m.excludedFromCounts) continue;
      const sec = secondmentOf.get(m.id);
      const seconded =
        !!sec && t.date >= sec.startDate && t.date <= sec.endDate;
      const effectiveTeam = seconded ? sec!.destinationTeamId : m.teamId;
      if (effectiveTeam !== t.teamId) continue;
      crew.push({ m, shift: shiftOf.get(`${m.id}|${t.date}`) });
    }
    // No shift on the tasking: only what the sync itself turned into a working
    // shift goes back.
    if (t.startMinutes === null) {
      for (const { m, shift } of crew) {
        if (!shift?.taskingRevert) continue;
        out.push({
          memberId: m.id,
          memberName: m.name,
          teamName: t.teamName,
          date: t.date,
          fromCode: shift.shiftCode,
          toCode: shift.taskingRevert,
          fromTime: shownStart(shift.shiftCode, shift.shiftTime),
          toTime: "",
          storeTime: null,
          fromRest: false,
          fromOnCall: false,
          backTo: shift.taskingRevert,
          revertTo: null,
        });
      }
      continue;
    }
    const startMinutes = t.startMinutes;
    const toTime = toClock(startMinutes);
    // A rest day only turns into a working shift when the whole team is off.
    const teamIsOff = !crew.some(
      c => c.shift && ON_DUTY_CODES.has(c.shift.shiftCode)
    );
    for (const { m, shift } of crew) {
      if (!shift) continue;
      let fromCode = shift.shiftCode;
      let fromRest = false;
      let fromOnCall = false;
      if (!ON_DUTY_CODES.has(fromCode)) {
        if ((fromCode !== "r" && fromCode !== "o") || !teamIsOff) continue;
        fromRest = fromCode === "r";
        fromOnCall = fromCode === "o";
        fromCode = fromOnCall
          ? t.admin
            ? "adoc"
            : "doc"
          : t.admin
            ? "ad"
            : "d";
      }
      const fromOff = fromRest || fromOnCall;
      const toCode = codeForStart(fromCode, startMinutes);
      const fromTime = fromOff ? "" : shownStart(fromCode, shift.shiftTime);
      if (!fromOff && toCode === fromCode && fromTime === toTime) continue;
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
        fromRest,
        fromOnCall,
        backTo: null,
        revertTo: fromRest
          ? "r"
          : fromOnCall
            ? "o"
            : (shift.taskingRevert ?? null),
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
  /** The distinct starts the on-duty ones have now, "07:00" or "07:00, 13:00" (empty when all are on a rest day). */
  fromTimes: string;
  /** How many are on a Rest Day now (the team's day off, now tasked). */
  fromRest: number;
  /** How many are On Call now (nobody on duty, now tasked); they become the on-call version of the shift. */
  fromOnCall: number;
  /** How many go back to a Rest Day now (the tasking no longer has the team working). */
  backToRest: number;
  /** How many go back to Rest on-call. */
  backToOnCall: number;
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
      fromTimes: Array.from(
        new Set(
          list
            .filter(c => !c.fromRest && !c.fromOnCall && !c.backTo)
            .map(c => c.fromTime || "no time")
        )
      )
        .sort()
        .join(", "),
      fromRest: list.filter(c => c.fromRest).length,
      fromOnCall: list.filter(c => c.fromOnCall).length,
      backToRest: list.filter(c => c.backTo === "r").length,
      backToOnCall: list.filter(c => c.backTo === "o").length,
      typeChanges: list.filter(
        c =>
          !c.fromRest && !c.fromOnCall && !c.backTo && c.toCode !== c.fromCode
      ).length,
    }))
    .sort((a, b) =>
      a.date === b.date
        ? a.teamName.localeCompare(b.teamName)
        : a.date < b.date
          ? -1
          : 1
    );
}
