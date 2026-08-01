/**
 * EA Compliance Rule Engine
 * Pure functions — no DB calls. Takes shift data + rules, returns findings.
 * All checking is deterministic; no LLM involved.
 *
 * On-call classification (confirmed by user):
 *   o    = rest day — does NOT count as a worked shift for any EA rule
 *   doc  = underlying shift is Day (9h from chip time, default 06:00)
 *   aoc  = underlying shift is Afternoon (9h from chip time, default 13:00)
 *   adoc = underlying shift is Admin (8h from chip time)
 *
 * For all shift-based rules (60h/7day, 12h max, consecutive days, min rest):
 *   - "o" is treated identically to "r" (rest day, breaks consecutive runs)
 *   - "doc", "aoc", "adoc" are treated as their underlying shift type
 *
 * The on-call 28-day count rule (s.42) still applies to ALL on-call codes
 * as a separate obligation check.
 */

import {
  computeShiftInterval,
  shiftToDateRange,
} from "../shared/ctoRosterShiftDuration";
import type { CtoRosterEbaRule } from "../drizzle/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShiftRecord {
  memberId: number;
  memberName: string;
  shiftDate: string; // "YYYY-MM-DD"
  shiftCode: string;
  shiftTime?: string | null;
}

export interface EbaFinding {
  ruleKey: string;
  ruleTitle: string;
  eaReference: string | null;
  memberId: number;
  memberName: string;
  /** Primary date(s) involved */
  dates: string[];
  /** Human-readable description of the specific issue */
  detail: string;
  /** warning = potential obligation triggered; error = clear breach */
  severity: "warning" | "error";
}

// ── On-call classification helpers ───────────────────────────────────────────

/** Plain on-call "o" is a rest day — never counts as a worked shift */
const REST_CODES = new Set(["r", "l", "o"]);

/**
 * Resolve the effective shift code for rule evaluation.
 * doc  → "d"   (Day shift, 9h)
 * aoc  → "a"   (Afternoon shift, 9h)
 * adoc → "ad"  (Admin shift, 8h)
 * All others pass through unchanged.
 */
function effectiveCode(code: string): string {
  const c = code.toLowerCase();
  if (c === "doc") return "d";
  if (c === "aoc") return "a";
  if (c === "adoc") return "ad";
  return c;
}

/**
 * Returns true if this shift counts as a worked shift for EA rule purposes.
 * "o" (plain on-call) is a rest day and returns false.
 * "doc", "aoc", "adoc" are worked shifts (underlying day/arvo/admin) and return true.
 */
function isWorkedShift(code: string): boolean {
  return !REST_CODES.has(code.toLowerCase());
}

/**
 * Compute the shift interval using the effective (underlying) code.
 * This ensures doc/aoc/adoc use their Day/Afternoon/Admin durations.
 */
function computeEffectiveInterval(code: string, chipTime?: string | null) {
  return computeShiftInterval(effectiveCode(code), chipTime);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWeekend(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat
}

// Formats a Date's *local* calendar components as "YYYY-MM-DD". Deliberately
// not `.toISOString().slice(0, 10)` — that converts to UTC first, which is
// off by one day from the intended local date whenever local midnight falls
// on a different UTC calendar day (true for the whole day in Australia/Perth,
// the timezone this server is forced to run in).
function toLocalDateString(dt: Date): string {
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toLocalDateString(dt);
}

function diffHours(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 3_600_000;
}

/**
 * Counts Sat/Sun days in [startDate, endDate] (inclusive) via closed-form
 * arithmetic rather than iterating day-by-day — a member's first/last
 * recorded shift can legitimately (or from a bad data entry) span years,
 * and a day-by-day loop over that range runs synchronously with no yield,
 * blocking the whole single-threaded server for its entire duration. This
 * is O(1) regardless of range size.
 */
function countWeekendDaysInRange(startDate: string, endDate: string): number {
  if (startDate > endDate) return 0;
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const totalDays =
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const startDow = start.getDay(); // 0=Sun..6=Sat

  const fullWeeks = Math.floor(totalDays / 7);
  let count = fullWeeks * 2;
  const remainder = totalDays % 7;
  for (let i = 0; i < remainder; i++) {
    const dow = (startDow + i) % 7;
    if (dow === 0 || dow === 6) count++;
  }
  return count;
}

// ── Main engine ───────────────────────────────────────────────────────────────

/**
 * Run all active rules against the provided shifts.
 * Shifts must be sorted by (memberId ASC, shiftDate ASC).
 */
export function runEbaChecks(
  shifts: ShiftRecord[],
  rules: CtoRosterEbaRule[]
): EbaFinding[] {
  const findings: EbaFinding[] = [];
  const activeRules = rules.filter(r => r.isActive);

  // Today's date string "YYYY-MM-DD" — findings with all dates in the past are suppressed
  const todayStr = toLocalDateString(new Date());

  // Group shifts by member
  const byMember = new Map<number, ShiftRecord[]>();
  for (const s of shifts) {
    if (!byMember.has(s.memberId)) byMember.set(s.memberId, []);
    byMember.get(s.memberId)!.push(s);
  }

  for (const memberShifts of Array.from(byMember.values())) {
    // Sort by date ascending
    memberShifts.sort((a: ShiftRecord, b: ShiftRecord) =>
      a.shiftDate.localeCompare(b.shiftDate)
    );

    for (const rule of activeRules) {
      const found = checkRule(rule, memberShifts);
      findings.push(...found);
    }
  }

  // Filter out findings where ALL involved dates are strictly in the past.
  // This suppresses historical data that can no longer be actioned.
  return findings.filter(f => {
    // A finding is future-relevant if at least one of its dates is >= today
    return f.dates.some(d => d >= todayStr);
  });
}

function checkRule(
  rule: CtoRosterEbaRule,
  shifts: ShiftRecord[]
): EbaFinding[] {
  switch (rule.ruleKey) {
    case "max_continuous_hours":
      return checkMaxContinuousHours(rule, shifts);
    case "max_hours_7day":
      return checkMaxHours7Day(rule, shifts);
    case "max_consecutive_shifts_10h":
      return checkMaxConsecutiveShifts(rule, shifts);
    case "max_consecutive_days":
      return checkMaxConsecutiveDays(rule, shifts);
    case "min_rest_after_8_14h":
    case "min_rest_after_14_18h":
    case "min_rest_after_18h":
      return checkMinRest(rule, shifts);
    case "max_weekend_frequency":
      return checkWeekendFrequency(rule, shifts);
    case "max_oncall_28day":
      return checkOnCall28Day(rule, shifts);
    case "oncall_sequence":
      return checkOnCallSequence(rule, shifts);
    case "min_shift_length":
      return checkMinShiftLength(rule, shifts);
    case "oncall_while_on_leave":
      return checkOnCallWhileOnLeave(rule, shifts);
    case "training_consecutive_days":
      return checkTrainingConsecutiveDays(rule, shifts);
    default:
      return [];
  }
}

// ── Rule implementations ──────────────────────────────────────────────────────

/** s.33(11): No more than 12 continuous hours in one shift */
function checkMaxContinuousHours(
  rule: CtoRosterEbaRule,
  shifts: ShiftRecord[]
): EbaFinding[] {
  const limit = rule.thresholdValue ?? 12;
  const findings: EbaFinding[] = [];
  for (const s of shifts) {
    // Skip rest days (r, l, o)
    if (!isWorkedShift(s.shiftCode)) continue;
    // Use effective interval (doc→d, aoc→a, adoc→ad)
    const interval = computeEffectiveInterval(s.shiftCode, s.shiftTime);
    if (interval.durationHours > limit) {
      findings.push({
        ruleKey: rule.ruleKey,
        ruleTitle: rule.title,
        eaReference: rule.eaReference,
        memberId: s.memberId,
        memberName: s.memberName,
        dates: [s.shiftDate],
        detail: `${s.memberName}: ${s.shiftCode.toUpperCase()} on ${s.shiftDate} is ${interval.durationHours}h — exceeds ${limit}h limit.`,
        severity: "warning",
      });
    }
  }
  return findings;
}

/** s.33(12): No more than 60 hours in any rolling 7-day period */
function checkMaxHours7Day(
  rule: CtoRosterEbaRule,
  shifts: ShiftRecord[]
): EbaFinding[] {
  const limit = rule.thresholdValue ?? 60;
  const findings: EbaFinding[] = [];
  // "o" is a rest day — exclude it along with r and l
  const working = shifts.filter(s => isWorkedShift(s.shiftCode));

  for (let i = 0; i < working.length; i++) {
    const anchor = working[i];
    const windowEnd = addDays(anchor.shiftDate, 7);
    const window = working.filter(
      s => s.shiftDate >= anchor.shiftDate && s.shiftDate < windowEnd
    );
    const totalHours = window.reduce((sum, s) => {
      // Use effective interval so doc/aoc/adoc contribute their underlying hours
      const iv = computeEffectiveInterval(s.shiftCode, s.shiftTime);
      return sum + iv.durationHours;
    }, 0);
    if (totalHours > limit) {
      findings.push({
        ruleKey: rule.ruleKey,
        ruleTitle: rule.title,
        eaReference: rule.eaReference,
        memberId: anchor.memberId,
        memberName: anchor.memberName,
        dates: [anchor.shiftDate, addDays(anchor.shiftDate, 6)],
        detail: `${anchor.memberName}: ${totalHours.toFixed(1)}h worked in 7-day window starting ${anchor.shiftDate} — exceeds ${limit}h limit.`,
        severity: "warning",
      });
      // Skip ahead to avoid duplicate windows
      while (i + 1 < working.length && working[i + 1].shiftDate < windowEnd)
        i++;
    }
  }
  return findings;
}

/** s.33(13): Max 6 consecutive shifts of 10h, or 5 consecutive shifts >10h */
function checkMaxConsecutiveShifts(
  rule: CtoRosterEbaRule,
  shifts: ShiftRecord[]
): EbaFinding[] {
  const limit10 = rule.thresholdValue ?? 6;
  const limitOver10 = rule.thresholdValue2 ?? 5;
  const findings: EbaFinding[] = [];
  // "o" is a rest day — breaks consecutive runs
  const working = shifts.filter(s => isWorkedShift(s.shiftCode));

  let run10 = 0;
  let runOver10 = 0;
  let runDates: string[] = [];

  for (const s of working) {
    const iv = computeEffectiveInterval(s.shiftCode, s.shiftTime);
    if (iv.durationHours >= 10) {
      run10++;
      runDates.push(s.shiftDate);
      if (iv.durationHours > 10) runOver10++;
      else runOver10 = 0;
    } else {
      run10 = 0;
      runOver10 = 0;
      runDates = [];
    }

    if (run10 > limit10) {
      findings.push({
        ruleKey: rule.ruleKey,
        ruleTitle: rule.title,
        eaReference: rule.eaReference,
        memberId: s.memberId,
        memberName: s.memberName,
        dates: runDates.slice(-limit10 - 1),
        detail: `${s.memberName}: ${run10} consecutive shifts of ≥10h ending ${s.shiftDate} — exceeds ${limit10} consecutive limit.`,
        severity: "warning",
      });
      run10 = 0;
      runOver10 = 0;
      runDates = [];
    } else if (runOver10 > limitOver10) {
      findings.push({
        ruleKey: rule.ruleKey,
        ruleTitle: rule.title,
        eaReference: rule.eaReference,
        memberId: s.memberId,
        memberName: s.memberName,
        dates: runDates.slice(-limitOver10 - 1),
        detail: `${s.memberName}: ${runOver10} consecutive shifts of >10h ending ${s.shiftDate} — exceeds ${limitOver10} consecutive limit.`,
        severity: "warning",
      });
      run10 = 0;
      runOver10 = 0;
      runDates = [];
    }
  }
  return findings;
}

/** s.33(14): No 10+ consecutive days >6h each; must have 2 rest days after */
function checkMaxConsecutiveDays(
  rule: CtoRosterEbaRule,
  shifts: ShiftRecord[]
): EbaFinding[] {
  const limit = rule.thresholdValue ?? 9;
  const findings: EbaFinding[] = [];

  let run = 0;
  let runStart = "";

  for (const s of shifts) {
    // "o" is a rest day — it breaks a consecutive run
    if (!isWorkedShift(s.shiftCode)) {
      run = 0;
      continue;
    }
    const iv = computeEffectiveInterval(s.shiftCode, s.shiftTime);
    const isLongEnough = iv.durationHours > 6;

    if (isLongEnough) {
      if (run === 0) runStart = s.shiftDate;
      run++;
      if (run > limit) {
        findings.push({
          ruleKey: rule.ruleKey,
          ruleTitle: rule.title,
          eaReference: rule.eaReference,
          memberId: s.memberId,
          memberName: s.memberName,
          dates: [runStart, s.shiftDate],
          detail: `${s.memberName}: ${run} consecutive working days (>6h each) from ${runStart} to ${s.shiftDate} — approaches/exceeds 10-day limit. Two consecutive rest days required after this block.`,
          severity: "warning",
        });
        run = 0;
      }
    } else {
      run = 0;
    }
  }
  return findings;
}

/** s.33(15a/b/c): Minimum rest periods between shifts */
function checkMinRest(
  rule: CtoRosterEbaRule,
  shifts: ShiftRecord[]
): EbaFinding[] {
  const findings: EbaFinding[] = [];
  // "o" is a rest day — exclude from consecutive shift pairs
  const working = shifts.filter(s => isWorkedShift(s.shiftCode));

  for (let i = 0; i < working.length - 1; i++) {
    const curr = working[i];
    const next = working[i + 1];

    // Use effective intervals (doc→d, aoc→a, adoc→ad)
    const currIv = computeEffectiveInterval(curr.shiftCode, curr.shiftTime);
    const nextIv = computeEffectiveInterval(next.shiftCode, next.shiftTime);

    const currRange = shiftToDateRange(curr.shiftDate, currIv);
    const nextRange = shiftToDateRange(next.shiftDate, nextIv);

    const restHours = diffHours(currRange.end, nextRange.start);
    if (restHours < 0) continue; // overlapping — skip

    const prevDuration = currIv.durationHours;

    let requiredRest = 0;
    let applicableRule = "";

    if (prevDuration >= 18) {
      requiredRest = 24;
      applicableRule = "s.33(15c)";
    } else if (prevDuration >= 14) {
      requiredRest = 14;
      applicableRule = "s.33(15b)";
    } else if (prevDuration >= 8) {
      requiredRest = 11;
      applicableRule = "s.33(15a)";
    }

    // Only check the rule that matches this procedure's ruleKey
    const ruleMap: Record<string, number> = {
      min_rest_after_8_14h: 11,
      min_rest_after_14_18h: 14,
      min_rest_after_18h: 24,
    };
    const thisRuleRest = ruleMap[rule.ruleKey];
    if (!thisRuleRest || requiredRest !== thisRuleRest) continue;

    if (restHours < requiredRest) {
      findings.push({
        ruleKey: rule.ruleKey,
        ruleTitle: rule.title,
        eaReference: applicableRule,
        memberId: curr.memberId,
        memberName: curr.memberName,
        dates: [curr.shiftDate, next.shiftDate],
        detail: `${curr.memberName}: Only ${restHours.toFixed(1)}h rest between ${curr.shiftCode.toUpperCase()} on ${curr.shiftDate} (${prevDuration}h shift) and ${next.shiftCode.toUpperCase()} on ${next.shiftDate} — minimum ${requiredRest}h required (${applicableRule}).`,
        severity: "warning",
      });
    }
  }
  return findings;
}

/** s.33(17): Max average 1 in 2 weekends over the period */
function checkWeekendFrequency(
  rule: CtoRosterEbaRule,
  shifts: ShiftRecord[]
): EbaFinding[] {
  const findings: EbaFinding[] = [];
  if (shifts.length === 0) return findings;

  const memberName = shifts[0].memberName;
  const memberId = shifts[0].memberId;

  const startDate = shifts[0].shiftDate;
  const endDate = shifts[shifts.length - 1].shiftDate;

  // Count weekend days worked — "o" is a rest day so it does NOT count
  const weekendDaysWorked = shifts.filter(
    s => isWeekend(s.shiftDate) && isWorkedShift(s.shiftCode)
  );

  const totalWeekendDays = countWeekendDaysInRange(startDate, endDate);

  const totalWeekends = Math.floor(totalWeekendDays / 2);
  const workedWeekends = Math.ceil(weekendDaysWorked.length / 2);

  if (totalWeekends >= 4 && workedWeekends > totalWeekends / 2) {
    findings.push({
      ruleKey: rule.ruleKey,
      ruleTitle: rule.title,
      eaReference: rule.eaReference,
      memberId,
      memberName,
      dates: [startDate, endDate],
      detail: `${memberName}: Worked ${workedWeekends} of ${totalWeekends} weekends in the period — exceeds 1-in-2 average (${rule.eaReference}).`,
      severity: "warning",
    });
  }
  return findings;
}

/** s.42(3): Max 7 on-call days in any rolling 28-day period */
function checkOnCall28Day(
  rule: CtoRosterEbaRule,
  shifts: ShiftRecord[]
): EbaFinding[] {
  const limit = rule.thresholdValue ?? 7;
  const findings: EbaFinding[] = [];
  // All on-call codes count for this obligation check (separate from shift rules)
  const onCallShifts = shifts.filter(s =>
    ["o", "doc", "adoc", "aoc"].includes(s.shiftCode.toLowerCase())
  );

  for (let i = 0; i < onCallShifts.length; i++) {
    const anchor = onCallShifts[i];
    const windowEnd = addDays(anchor.shiftDate, 28);
    const window = onCallShifts.filter(
      s => s.shiftDate >= anchor.shiftDate && s.shiftDate < windowEnd
    );
    if (window.length > limit) {
      findings.push({
        ruleKey: rule.ruleKey,
        ruleTitle: rule.title,
        eaReference: rule.eaReference,
        memberId: anchor.memberId,
        memberName: anchor.memberName,
        dates: [anchor.shiftDate, addDays(anchor.shiftDate, 27)],
        detail: `${anchor.memberName}: ${window.length} on-call days in 28-day window starting ${anchor.shiftDate} — standard limit is ${limit} days (${rule.eaReference}).`,
        severity: "warning",
      });
      while (
        i + 1 < onCallShifts.length &&
        onCallShifts[i + 1].shiftDate < windowEnd
      )
        i++;
    }
  }
  return findings;
}

// ── New rules added after second EA scan ─────────────────────────────────────

/** s.25(8): No shift rostered for less than 8 hours (unless agreement exists) */
function checkMinShiftLength(
  rule: CtoRosterEbaRule,
  shifts: ShiftRecord[]
): EbaFinding[] {
  const minHours = rule.thresholdValue ?? 8;
  const findings: EbaFinding[] = [];
  // Leave (l) and rest (r, o) are excluded — they are not "worked shifts"
  // Court (c) is fixed 8h so won't trigger; training (tt) is 8h
  // This rule catches any manually-entered custom time that results in <8h
  for (const s of shifts) {
    if (!isWorkedShift(s.shiftCode)) continue;
    const iv = computeEffectiveInterval(s.shiftCode, s.shiftTime);
    if (iv.durationHours < minHours) {
      findings.push({
        ruleKey: rule.ruleKey,
        ruleTitle: rule.title,
        eaReference: rule.eaReference,
        memberId: s.memberId,
        memberName: s.memberName,
        dates: [s.shiftDate],
        detail: `${s.memberName}: ${s.shiftCode.toUpperCase()} on ${s.shiftDate} is ${iv.durationHours}h — below the minimum 8h per rostered occurrence (s.25(8)). Requires supervisor agreement.`,
        severity: "warning",
      });
    }
  }
  return findings;
}

/** s.42(6): Employee cannot be on-call while on any form of leave */
function checkOnCallWhileOnLeave(
  rule: CtoRosterEbaRule,
  shifts: ShiftRecord[]
): EbaFinding[] {
  const findings: EbaFinding[] = [];
  const ONCALL_CODES = new Set(["o", "doc", "adoc", "aoc"]);
  const LEAVE_CODES = new Set(["l", "al", "sl", "cl", "pl", "lsl"]);

  // Build a set of dates that have a leave code
  const leaveDates = new Set<string>();
  for (const s of shifts) {
    if (LEAVE_CODES.has(s.shiftCode.toLowerCase())) {
      leaveDates.add(s.shiftDate);
    }
  }

  // Flag any on-call shift on a leave date
  for (const s of shifts) {
    if (
      ONCALL_CODES.has(s.shiftCode.toLowerCase()) &&
      leaveDates.has(s.shiftDate)
    ) {
      findings.push({
        ruleKey: rule.ruleKey,
        ruleTitle: rule.title,
        eaReference: rule.eaReference,
        memberId: s.memberId,
        memberName: s.memberName,
        dates: [s.shiftDate],
        detail: `${s.memberName}: ${s.shiftCode.toUpperCase()} (on-call) on ${s.shiftDate} conflicts with leave — employees cannot be on-call while on any form of leave (s.42(6)).`,
        severity: "error",
      });
    }
  }
  return findings;
}

/** s.30(5b): Training in excess of 10 consecutive days (≥6h each) triggers additional pay */
function checkTrainingConsecutiveDays(
  rule: CtoRosterEbaRule,
  shifts: ShiftRecord[]
): EbaFinding[] {
  const limit = rule.thresholdValue ?? 10;
  const findings: EbaFinding[] = [];

  let run = 0;
  let runStart = "";

  for (const s of shifts) {
    if (s.shiftCode.toLowerCase() !== "tt") {
      run = 0;
      continue;
    }
    const iv = computeEffectiveInterval(s.shiftCode, s.shiftTime);
    if (iv.durationHours >= 6) {
      if (run === 0) runStart = s.shiftDate;
      run++;
      if (run > limit) {
        findings.push({
          ruleKey: rule.ruleKey,
          ruleTitle: rule.title,
          eaReference: rule.eaReference,
          memberId: s.memberId,
          memberName: s.memberName,
          dates: [runStart, s.shiftDate],
          detail: `${s.memberName}: ${run} consecutive training days (≥6h each) from ${runStart} to ${s.shiftDate} — exceeds ${limit}-day limit. Additional Base Salary Hourly Rate applies for excess days (s.30(5b)).`,
          severity: "warning",
        });
        run = 0;
      }
    } else {
      run = 0;
    }
  }
  return findings;
}

/** Operational rule: on-call weekend sequence must be adoc(Fri)→o(Sat)→o(Sun)→doc(Mon) */
function checkOnCallSequence(
  rule: CtoRosterEbaRule,
  shifts: ShiftRecord[]
): EbaFinding[] {
  const findings: EbaFinding[] = [];
  const byDate = new Map<string, ShiftRecord>();
  for (const s of shifts) byDate.set(s.shiftDate, s);

  // Find every Friday that has an on-call shift (start of on-call block)
  const onCallCodes = new Set(["o", "doc", "adoc", "aoc"]);
  const fridays = shifts.filter(
    s =>
      dayOfWeek(s.shiftDate) === 5 && onCallCodes.has(s.shiftCode.toLowerCase())
  );

  for (const fri of fridays) {
    const sat = addDays(fri.shiftDate, 1);
    const sun = addDays(fri.shiftDate, 2);
    const mon = addDays(fri.shiftDate, 3);

    const friShift = byDate.get(fri.shiftDate);
    const satShift = byDate.get(sat);
    const sunShift = byDate.get(sun);
    const monShift = byDate.get(mon);

    const issues: string[] = [];

    // Friday must be adoc (Admin on-call)
    if (friShift?.shiftCode !== "adoc") {
      issues.push(
        `Friday should be adoc (got ${friShift?.shiftCode ?? "none"})`
      );
    }
    if (!satShift || satShift.shiftCode !== "o") {
      issues.push(
        `Saturday should be o (got ${satShift?.shiftCode ?? "none"})`
      );
    }
    if (!sunShift || sunShift.shiftCode !== "o") {
      issues.push(`Sunday should be o (got ${sunShift?.shiftCode ?? "none"})`);
    }
    if (!monShift || monShift.shiftCode !== "doc") {
      issues.push(
        `Monday should be doc (got ${monShift?.shiftCode ?? "none"})`
      );
    }

    if (issues.length > 0) {
      findings.push({
        ruleKey: rule.ruleKey,
        ruleTitle: rule.title,
        eaReference: rule.eaReference,
        memberId: fri.memberId,
        memberName: fri.memberName,
        dates: [fri.shiftDate, mon],
        detail: `${fri.memberName}: On-call sequence broken for week of ${fri.shiftDate}: ${issues.join("; ")}.`,
        severity: "warning",
      });
    }
  }
  return findings;
}
