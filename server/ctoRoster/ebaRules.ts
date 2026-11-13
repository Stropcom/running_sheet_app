// Part of the target queries (server/ctoRoster.ts): the EBA rules, their defaults and the rule check.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import {
  ctoRosterShifts,
  ctoRosterDraftMembers,
  ctoRosterDraftShifts,
  ctoRosterSavedRosterMembers,
  ctoRosterSavedRosterShifts,
  ctoRosterEbaRules,
  CtoRosterEbaRule,
} from "../../drizzle/schema";
import { runEbaChecks, type ShiftRecord } from "../ctoRosterEbaEngine";
import { computeShiftInterval } from "../../shared/ctoRosterShiftDuration";
import { liveShiftScope, getAllCtoRosterMembers } from "./liveRoster";

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

export type CtoRosterEbaScope = "main" | "draft" | "custom" | "saved";

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
  }[];
  let memberMap = new Map<number, string>();

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
      })
      .from(ctoRosterShifts)
      .where(conditions.length ? and(...conditions) : undefined);
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

  const findings = runEbaChecks(shiftRecords, rules);
  const missingTime = shiftRecords.filter(
    s => computeShiftInterval(s.shiftCode, s.shiftTime).missingRequiredTime
  );

  return {
    findings,
    checkedShifts: shiftRecords.length,
    missingTimeWarnings: missingTime.map(s => ({
      memberName: s.memberName,
      shiftDate: s.shiftDate,
      shiftCode: s.shiftCode,
    })),
  };
}
