// Part of the target queries (server/ctoRoster.ts): the EBA rules, their defaults and the rule check.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  ctoRosterShifts,
  ctoRosterDraftMembers,
  ctoRosterDraftShifts,
  ctoRosterSavedRosterMembers,
  ctoRosterSavedRosterShifts,
  ctoRosterEbaRules,
  ctoRosterAuditLog,
  ctoRosterDismissedFindings,
  CtoRosterEbaRule,
} from "../../drizzle/schema";
import {
  runEbaChecks,
  type EbaFinding,
  type ShiftRecord,
} from "../ctoRosterEbaEngine";
import { computeShiftInterval } from "../../shared/ctoRosterShiftDuration";
import type { ShiftChange } from "../../shared/ctoRosterNotice";
import {
  datesKeyOf,
  findingKey,
  type FindingIdentity,
} from "../../shared/ebaFindingKey";
import { rosterCommandForWrite } from "../rosterContext";
import {
  liveShiftScope,
  getAllCtoRosterMembers,
  inCommand,
  writeCtoRosterAudit,
} from "./liveRoster";

// ── EA Compliance (EBA rule engine) ─────────────────────────────────────────────

/** Default rule set, seeded into the DB on first read so the engine has something to run. */
const DEFAULT_EBA_RULES: Omit<
  CtoRosterEbaRule,
  "id" | "createdAt" | "updatedAt"
>[] = [
  {
    ruleKey: "max_continuous_hours",
    title: "Maximum continuous hours per shift",
    description: "No more than 12 continuous hours in one shift.",
    eaReference: "s.33(11)",
    thresholdValue: 12,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "max_hours_7day",
    title: "Maximum hours in a 7-day period",
    description: "No more than 60 hours worked in any rolling 7-day period.",
    eaReference: "s.33(12)",
    thresholdValue: 60,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "max_consecutive_shifts_10h",
    title: "Maximum consecutive shifts of 10+ hours",
    description:
      "No more than 6 consecutive shifts of 10h, or 5 consecutive shifts over 10h.",
    eaReference: "s.33(13)",
    thresholdValue: 6,
    thresholdValue2: 5,
    isActive: true,
  },
  {
    ruleKey: "max_consecutive_days",
    title: "Maximum consecutive working days",
    description:
      "No 10+ consecutive working days (>6h each) without two consecutive rest days after.",
    eaReference: "s.33(14)",
    thresholdValue: 9,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "min_rest_after_8_14h",
    title: "Minimum rest after an 8-14h shift",
    description:
      "At least 11 hours rest required after a shift of 8 to 14 hours.",
    eaReference: "s.33(15a)",
    thresholdValue: 11,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "min_rest_after_14_18h",
    title: "Minimum rest after a 14-18h shift",
    description:
      "At least 14 hours rest required after a shift of 14 to 18 hours.",
    eaReference: "s.33(15b)",
    thresholdValue: 14,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "min_rest_after_18h",
    title: "Minimum rest after an 18h+ shift",
    description:
      "At least 24 hours rest required after a shift of 18 hours or more.",
    eaReference: "s.33(15c)",
    thresholdValue: 24,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "max_weekend_frequency",
    title: "Maximum weekend work frequency",
    description: "Average no more than 1 in 2 weekends worked over the period.",
    eaReference: "s.33(17)",
    thresholdValue: null,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "max_oncall_28day",
    title: "Maximum on-call days in a 28-day period",
    description: "No more than 7 on-call days in any rolling 28-day period.",
    eaReference: "s.42(3)",
    thresholdValue: 7,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "oncall_sequence",
    title: "On-call weekend sequence",
    description:
      "On-call weekend blocks must follow adoc(Fri) → o(Sat) → o(Sun) → doc(Mon).",
    eaReference: "Operational",
    thresholdValue: null,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "min_shift_length",
    title: "Minimum shift length",
    description:
      "No shift rostered for less than 8 hours, unless supervisor agreement exists.",
    eaReference: "s.25(8)",
    thresholdValue: 8,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "oncall_while_on_leave",
    title: "On-call while on leave",
    description: "An employee cannot be on-call while on any form of leave.",
    eaReference: "s.42(6)",
    thresholdValue: null,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "training_consecutive_days",
    title: "Maximum consecutive training days",
    description:
      "Training in excess of 10 consecutive days (≥6h each) triggers additional pay.",
    eaReference: "s.30(5b)",
    thresholdValue: 10,
    thresholdValue2: null,
    isActive: true,
  },
  {
    ruleKey: "min_notice_of_change",
    title: "Minimum notice of a change to attendance",
    description:
      "An Employee will be given a minimum of 24 hours notice of any change to their normal pattern of attendance. A change is notified by direct verbal communication unless another arrangement is mutually agreed; the safety net may be breached for an Operational Requirement. Flags a saved change made less than 24 hours before the shift starts.",
    eaReference: "s.33(16)(a)",
    thresholdValue: 24,
    thresholdValue2: null,
    isActive: true,
  },
];

async function ensureCtoRosterEbaRulesSeeded(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ ruleKey: ctoRosterEbaRules.ruleKey })
    .from(ctoRosterEbaRules);
  const existingKeys = new Set(existing.map(r => r.ruleKey));
  const missing = DEFAULT_EBA_RULES.filter(r => !existingKeys.has(r.ruleKey));
  if (missing.length > 0) await db.insert(ctoRosterEbaRules).values(missing);
}

export async function getAllCtoRosterEbaRules(): Promise<CtoRosterEbaRule[]> {
  const db = await getDb();
  if (!db) return [];
  await ensureCtoRosterEbaRulesSeeded();
  return db.select().from(ctoRosterEbaRules).orderBy(ctoRosterEbaRules.id);
}

export async function updateCtoRosterEbaRule(
  id: number,
  updates: {
    isActive?: boolean;
    thresholdValue?: number | null;
    thresholdValue2?: number | null;
    description?: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const set: Partial<CtoRosterEbaRule> = {};
  if (updates.isActive !== undefined) set.isActive = updates.isActive;
  if (updates.thresholdValue !== undefined)
    set.thresholdValue = updates.thresholdValue;
  if (updates.thresholdValue2 !== undefined)
    set.thresholdValue2 = updates.thresholdValue2;
  if (updates.description !== undefined) set.description = updates.description;
  await db
    .update(ctoRosterEbaRules)
    .set(set)
    .where(eq(ctoRosterEbaRules.id, id));
}

/** A row whose last change is within this many seconds of its creation was
 * made in one go (the insert), not changed later. */
const SAME_WRITE_SECONDS = 5;
/** An audit entry and a row's updatedAt this close are the same write. */
const SAME_EVENT_MS = 30_000;

/**
 * The saved changes to the live roster (s.33(16)(a) needs to know WHEN each
 * was made):
 *  - single edits and Weekly Tasking syncs are in the audit log with the old
 *    and the new shift and the exact time (`upsert_shift`);
 *  - bulk update, bulk copy, repeat cycle and draft merge are logged as one
 *    summary line with no dates, so for those the only trace is the shift's own
 *    last-changed time: a row changed after it was created, with no audit entry
 *    at the same moment, is a change whose earlier shift is not recorded.
 */
async function liveShiftChanges(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  rows: {
    memberId: number;
    shiftDate: string;
    shiftCode: string;
    shiftTime: string | null;
    shiftDurationHours?: number | null;
    createdAt?: Date;
    updatedAt?: Date;
  }[],
  memberMap: Map<number, string>,
  startDate?: string,
  endDate?: string
): Promise<ShiftChange[]> {
  const out: ShiftChange[] = [];
  const parse = (json: string | null) => {
    if (!json) return null;
    try {
      const v = JSON.parse(json) as {
        shiftCode?: string | null;
        shiftTime?: string | null;
        shiftDurationHours?: number | null;
      };
      return {
        code: v.shiftCode ?? null,
        time: v.shiftTime ?? null,
        durationHours: v.shiftDurationHours ?? null,
      };
    } catch {
      return null;
    }
  };

  const conditions = [
    eq(ctoRosterAuditLog.action, "upsert_shift"),
    sql`${ctoRosterAuditLog.memberId} IS NOT NULL`,
    sql`${ctoRosterAuditLog.shiftDate} IS NOT NULL`,
  ];
  if (startDate) conditions.push(gte(ctoRosterAuditLog.shiftDate, startDate));
  if (endDate) conditions.push(lte(ctoRosterAuditLog.shiftDate, endDate));
  const scoped = inCommand(ctoRosterAuditLog.command);
  if (scoped) conditions.push(scoped);
  const audit = await db
    .select()
    .from(ctoRosterAuditLog)
    .where(and(...conditions));
  const auditTimes = new Map<string, number[]>();
  for (const a of audit) {
    const after = parse(a.newValue);
    if (!a.memberId || !a.shiftDate || !after) continue;
    // Only people still on this Command's roster: a member who has been
    // deleted keeps their audit entries, but there is nothing left to check.
    if (!memberMap.has(a.memberId)) continue;
    const at = a.createdAt.getTime();
    const key = `${a.memberId}|${a.shiftDate}`;
    auditTimes.set(key, [...(auditTimes.get(key) ?? []), at]);
    out.push({
      memberId: a.memberId,
      memberName: memberMap.get(a.memberId)!,
      shiftDate: a.shiftDate,
      changedAtMs: at,
      before: parse(a.oldValue),
      beforeKnown: true,
      after,
      by: a.userName ?? null,
      source: "audit",
    });
  }

  for (const r of rows) {
    if (!r.createdAt || !r.updatedAt) continue;
    if (
      r.updatedAt.getTime() - r.createdAt.getTime() <=
      SAME_WRITE_SECONDS * 1000
    )
      continue;
    const at = r.updatedAt.getTime();
    const seen = auditTimes.get(`${r.memberId}|${r.shiftDate}`) ?? [];
    if (seen.some(t => Math.abs(t - at) <= SAME_EVENT_MS)) continue;
    out.push({
      memberId: r.memberId,
      memberName: memberMap.get(r.memberId) ?? `Member ${r.memberId}`,
      shiftDate: r.shiftDate,
      changedAtMs: at,
      before: null,
      beforeKnown: false,
      after: {
        code: r.shiftCode,
        time: r.shiftTime,
        durationHours: r.shiftDurationHours ?? null,
      },
      by: null,
      source: "row",
    });
  }
  return out;
}

export type CtoRosterEbaScope = "main" | "draft" | "custom" | "saved";

/** A finding an admin has dismissed, with who and when. */
export interface DismissedEbaFinding extends EbaFinding {
  dismissedBy: string | null;
  dismissedAt: Date;
}

/**
 * Run the EA compliance engine against live shifts, a draft, a saved roster,
 * or an arbitrary custom date range on the live roster.
 */
export async function runCtoRosterEbaCheck(
  scope: CtoRosterEbaScope,
  draftId?: number,
  savedRosterId?: number,
  startDate?: string,
  endDate?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rules = await getAllCtoRosterEbaRules();

  let rawShifts: {
    memberId: number;
    shiftDate: string;
    shiftCode: string;
    shiftTime: string | null;
    shiftDurationHours?: number | null;
    createdAt?: Date;
    updatedAt?: Date;
  }[];
  let memberMap = new Map<number, string>();
  // Saved changes to the live roster, for the notice-of-change rule.
  let changes: ShiftChange[] = [];

  if (scope === "main" || scope === "custom") {
    const allMembers = await getAllCtoRosterMembers();
    memberMap = new Map(allMembers.map(m => [m.id, m.name]));
    const conditions = [];
    if (startDate) conditions.push(gte(ctoRosterShifts.shiftDate, startDate));
    if (endDate) conditions.push(lte(ctoRosterShifts.shiftDate, endDate));
    const memberScope = await liveShiftScope();
    if (memberScope) conditions.push(memberScope);
    rawShifts = await db
      .select({
        memberId: ctoRosterShifts.memberId,
        shiftDate: ctoRosterShifts.shiftDate,
        shiftCode: ctoRosterShifts.shiftCode,
        shiftTime: ctoRosterShifts.shiftTime,
        shiftDurationHours: ctoRosterShifts.shiftDurationHours,
        createdAt: ctoRosterShifts.createdAt,
        updatedAt: ctoRosterShifts.updatedAt,
      })
      .from(ctoRosterShifts)
      .where(conditions.length ? and(...conditions) : undefined);
    changes = await liveShiftChanges(
      db,
      rawShifts,
      memberMap,
      startDate,
      endDate
    );
  } else if (scope === "draft") {
    if (!draftId) throw new Error("draftId required for draft scope");
    const allMembers = await getAllCtoRosterMembers();
    memberMap = new Map(allMembers.map(m => [m.id, m.name]));
    const dMems = await db
      .select()
      .from(ctoRosterDraftMembers)
      .where(eq(ctoRosterDraftMembers.draftId, draftId));
    for (const m of dMems) memberMap.set(m.id, m.name);
    rawShifts = await db
      .select({
        memberId: ctoRosterDraftShifts.memberId,
        shiftDate: ctoRosterDraftShifts.shiftDate,
        shiftCode: ctoRosterDraftShifts.shiftCode,
        shiftTime: ctoRosterDraftShifts.shiftTime,
      })
      .from(ctoRosterDraftShifts)
      .where(eq(ctoRosterDraftShifts.draftId, draftId));
  } else {
    if (!savedRosterId)
      throw new Error("savedRosterId required for saved scope");
    const sMembers = await db
      .select()
      .from(ctoRosterSavedRosterMembers)
      .where(eq(ctoRosterSavedRosterMembers.savedRosterId, savedRosterId));
    memberMap = new Map(sMembers.map(m => [m.id, m.name]));
    rawShifts = await db
      .select({
        memberId: ctoRosterSavedRosterShifts.memberId,
        shiftDate: ctoRosterSavedRosterShifts.shiftDate,
        shiftCode: ctoRosterSavedRosterShifts.shiftCode,
        shiftTime: ctoRosterSavedRosterShifts.shiftTime,
      })
      .from(ctoRosterSavedRosterShifts)
      .where(eq(ctoRosterSavedRosterShifts.savedRosterId, savedRosterId));
  }

  const shiftRecords: ShiftRecord[] = rawShifts.map(s => ({
    memberId: s.memberId,
    memberName: memberMap.get(s.memberId) ?? `Member ${s.memberId}`,
    shiftDate: s.shiftDate,
    shiftCode: s.shiftCode,
    shiftTime: s.shiftTime,
    shiftDurationHours: s.shiftDurationHours ?? null,
  }));

  let findings = runEbaChecks(shiftRecords, rules, changes);
  // Findings an admin has dismissed on the live roster are taken out (so the
  // roster's and the Weekly Tasking's red dots clear) and handed back
  // separately so the EA Compliance page can show them and restore them.
  const dismissed: DismissedEbaFinding[] = [];
  if (scope === "main" || scope === "custom") {
    const rows = await db
      .select()
      .from(ctoRosterDismissedFindings)
      .where(inCommand(ctoRosterDismissedFindings.command));
    const byKey = new Map(
      rows.map(r => [`${r.ruleKey}|${r.memberId}|${r.datesKey}`, r])
    );
    const kept: EbaFinding[] = [];
    for (const f of findings) {
      const row = byKey.get(findingKey(f));
      if (row)
        dismissed.push({
          ...f,
          dismissedBy: row.dismissedByName ?? null,
          dismissedAt: row.createdAt,
        });
      else kept.push(f);
    }
    findings = kept;
  }
  const missingTime = shiftRecords.filter(
    s => computeShiftInterval(s.shiftCode, s.shiftTime).missingRequiredTime
  );

  return {
    findings,
    dismissed,
    checkedShifts: shiftRecords.length,
    missingTimeWarnings: missingTime.map(s => ({
      memberName: s.memberName,
      shiftDate: s.shiftDate,
      shiftCode: s.shiftCode,
    })),
  };
}

// ── Dismissing findings ──────────────────────────────────────────────────────

const describeShifts = (
  dates: string[],
  shifts: { shiftDate: string; shiftCode: string; shiftTime: string | null }[]
) =>
  dates
    .map(d => {
      const s = shifts.find(x => x.shiftDate === d);
      return `${d} ${
        s && s.shiftCode
          ? `${s.shiftCode}${s.shiftTime ? ` ${s.shiftTime}` : ""}`
          : "no shift"
      }`;
    })
    .join("; ");

/**
 * Dismiss EA findings on the live roster: they stop showing on the roster and
 * the CTO Weekly Tasking, and each is written to the roster Audit Log — who,
 * the rule, the dates and the shifts on those dates. Only findings the check
 * finds right now (with the same range the admin ran it with) are dismissed;
 * anything else asked for is ignored, so a dismissal never hides what was not
 * seen.
 */
export async function dismissCtoRosterEbaFindings(
  input: {
    scope: "main" | "custom";
    startDate?: string;
    endDate?: string;
    findings: FindingIdentity[];
  },
  actor: { id: number; name: string | null }
): Promise<{ dismissed: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const check = await runCtoRosterEbaCheck(
    input.scope,
    undefined,
    undefined,
    input.startDate,
    input.endDate
  );
  const wanted = new Set(input.findings.map(findingKey));
  const targets = check.findings.filter(f => wanted.has(findingKey(f)));
  let count = 0;
  for (const f of targets) {
    const dates = [...f.dates].sort();
    const shifts = await db
      .select({
        shiftDate: ctoRosterShifts.shiftDate,
        shiftCode: ctoRosterShifts.shiftCode,
        shiftTime: ctoRosterShifts.shiftTime,
      })
      .from(ctoRosterShifts)
      .where(
        and(
          eq(ctoRosterShifts.memberId, f.memberId),
          gte(ctoRosterShifts.shiftDate, dates[0]),
          lte(ctoRosterShifts.shiftDate, dates[dates.length - 1])
        )
      );
    await db
      .insert(ctoRosterDismissedFindings)
      .values({
        command: rosterCommandForWrite(),
        ruleKey: f.ruleKey,
        memberId: f.memberId,
        datesKey: datesKeyOf(f.dates),
        dismissedByUserId: actor.id,
        dismissedByName: actor.name,
      })
      .onDuplicateKeyUpdate({ set: { ruleKey: f.ruleKey } });
    await writeCtoRosterAudit({
      userId: actor.id,
      userName: actor.name,
      action: "dismiss_ea_breach",
      memberId: f.memberId,
      memberName: f.memberName,
      shiftDate: dates[0],
      oldValue: JSON.stringify({
        ruleKey: f.ruleKey,
        ruleTitle: f.ruleTitle,
        eaReference: f.eaReference,
        dates,
      }),
      detail: `Dismissed EA breach "${f.ruleTitle}"${f.eaReference ? ` (${f.eaReference})` : ""} for ${f.memberName} — dates: ${dates.join(", ")}. Shifts: ${describeShifts(dates, shifts)}. Finding: ${f.detail}`,
    });
    count++;
  }
  return { dismissed: count };
}

/** Bring dismissed findings back (their dots return), written to the Audit Log. */
export async function restoreCtoRosterEbaFindings(
  findings: FindingIdentity[],
  actor: { id: number; name: string | null }
): Promise<{ restored: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rules = new Map(
    (await getAllCtoRosterEbaRules()).map(r => [r.ruleKey, r])
  );
  const members = new Map(
    (await getAllCtoRosterMembers()).map(m => [m.id, m.name])
  );
  let count = 0;
  for (const f of findings) {
    const datesKey = datesKeyOf(f.dates);
    const found = await db
      .select({ id: ctoRosterDismissedFindings.id })
      .from(ctoRosterDismissedFindings)
      .where(
        and(
          inCommand(ctoRosterDismissedFindings.command),
          eq(ctoRosterDismissedFindings.ruleKey, f.ruleKey),
          eq(ctoRosterDismissedFindings.memberId, f.memberId),
          eq(ctoRosterDismissedFindings.datesKey, datesKey)
        )
      );
    if (found.length === 0) continue;
    await db
      .delete(ctoRosterDismissedFindings)
      .where(eq(ctoRosterDismissedFindings.id, found[0].id));
    const rule = rules.get(f.ruleKey);
    const name = members.get(f.memberId) ?? `Member ${f.memberId}`;
    await writeCtoRosterAudit({
      userId: actor.id,
      userName: actor.name,
      action: "restore_ea_breach",
      memberId: f.memberId,
      memberName: name,
      shiftDate: [...f.dates].sort()[0],
      detail: `Restored EA breach "${rule?.title ?? f.ruleKey}"${rule?.eaReference ? ` (${rule.eaReference})` : ""} for ${name} — dates: ${[...f.dates].sort().join(", ")}`,
    });
    count++;
  }
  return { restored: count };
}
