import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { vaultEncrypt, vaultDecrypt, fingerprintVaultKey } from "../wipcVault";

import {
  wipcMembers,
  wipcOfficerProfiles,
  wipcAuditLog,
  wipcVaultKeyCheck,
  WipcMemberRecord,
  WipcOfficerProfile,
  smeacBriefings,
  SmeacBriefing,
  smeacAcknowledgements,
  SmeacAcknowledgement,
  ucoGuideBriefings,
  UcoGuideBriefing,
  ucoGuideAcknowledgements,
  UcoGuideAcknowledgement,
} from "../../drizzle/schema";

import { getDb } from "./core";
import { getAllUsers } from "./accounts";
import { createNotificationsForUsers } from "./notifications";
import { getRunningSheetById } from "./operations";

// ─── WIPC Vault Helpers ───────────────────────────────────────────────────────
// All sensitive fields are encrypted/decrypted via wipcVault.ts (AES-256-GCM).
// These helpers are called only from server-side procedures with admin guards.

const WIPC_MEMBER_FIELDS = [
  "fullName",
  "dob",
  "afpId",
  "cinNumber",
  "aiInitials",
  "aiKnownAs",
] as const;

const WIPC_OFFICER_FIELDS = [
  "fullName",
  "afpId",
  "workLocation",
  "portfolio",
  "contactNumber",
] as const;

export function encryptMember(
  m: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...m };
  for (const f of WIPC_MEMBER_FIELDS) {
    if (typeof out[f] === "string") out[f] = vaultEncrypt(out[f] as string);
  }
  return out;
}

function decryptMember(m: Record<string, unknown>): Record<string, unknown> {
  const out = { ...m };
  for (const f of WIPC_MEMBER_FIELDS) {
    if (typeof out[f] === "string") out[f] = vaultDecrypt(out[f] as string);
  }
  return out;
}

function encryptOfficer(o: Record<string, unknown>): Record<string, unknown> {
  const out = { ...o };
  for (const f of WIPC_OFFICER_FIELDS) {
    if (typeof out[f] === "string") out[f] = vaultEncrypt(out[f] as string);
  }
  return out;
}

function decryptOfficer(o: Record<string, unknown>): Record<string, unknown> {
  const out = { ...o };
  for (const f of WIPC_OFFICER_FIELDS) {
    if (typeof out[f] === "string") out[f] = vaultDecrypt(out[f] as string);
  }
  return out;
}

/**
 * Guards against the WIPC vault silently swapping keys underneath existing
 * data. A wrong/rotated WIPC_VAULT_KEY doesn't fail loudly on its own — it
 * just makes vaultDecrypt() throw (or worse, on a key of the right shape,
 * decrypt to garbage) the next time someone happens to open an existing
 * record. Called once at server startup (see server/_core/index.ts) so a
 * mismatch is caught before the app ever serves a request, not weeks later
 * when an officer opens a real WIPC record.
 *
 * On the very first run with a given key (no canary row yet) it records a
 * fingerprint of that key plus a small encrypted marker, so future startups
 * have something to check against.
 */
export async function verifyWipcVaultKeyOrThrow(): Promise<void> {
  if (!process.env.WIPC_VAULT_KEY) return; // vault not configured — nothing to check yet
  const db = await getDb();
  if (!db) return; // DB unavailable — let the normal DB connectivity checks surface this

  const fingerprint = fingerprintVaultKey();
  const [existing] = await db.select().from(wipcVaultKeyCheck).limit(1);

  if (!existing) {
    await db.insert(wipcVaultKeyCheck).values({
      keyFingerprint: fingerprint,
      canaryValue: vaultEncrypt("WIPC_VAULT_KEY_OK"),
    });
    return;
  }

  if (
    existing.keyFingerprint !== fingerprint ||
    vaultDecrypt(existing.canaryValue) !== "WIPC_VAULT_KEY_OK"
  ) {
    throw new Error(
      "WIPC_VAULT_KEY does not match the key that encrypted the existing WIPC vault data. " +
        "Refusing to start with a mismatched key — using it would make existing WIPC records " +
        "permanently unreadable rather than just blocking new saves. If this key change is " +
        "intentional (e.g. the old WIPC data is known-disposable test data), clear the " +
        "wipc_officer_profiles, wipc_members and wipc_vault_key_check tables first, then restart."
    );
  }
}

/** Write an entry to the WIPC audit log */
export async function createWipcAuditEntry(data: {
  userId: number;
  action: string;
  targetId?: number;
  detail?: string;
  ipAddress?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(wipcAuditLog).values({
    userId: data.userId,
    action: data.action,
    targetId: data.targetId ?? null,
    detail: data.detail ?? null,
    ipAddress: data.ipAddress ?? null,
  });
}

/** Get all WIPC audit log entries (admin only) */
export async function getWipcAuditLog(limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(wipcAuditLog)
    .orderBy(desc(wipcAuditLog.createdAt))
    .limit(limit);
}

/** Save or update the requesting officer profile for a user (encrypted) */
export async function upsertWipcOfficerProfile(
  userId: number,
  data: {
    fullName: string;
    afpId: string;
    workLocation?: string;
    portfolio?: string;
    contactNumber?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const encrypted = encryptOfficer({ ...data }) as typeof data;
  const existing = await db
    .select({ id: wipcOfficerProfiles.id })
    .from(wipcOfficerProfiles)
    .where(eq(wipcOfficerProfiles.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(wipcOfficerProfiles)
      .set({ ...encrypted, updatedAt: new Date() })
      .where(eq(wipcOfficerProfiles.userId, userId));
  } else {
    await db.insert(wipcOfficerProfiles).values({
      userId,
      fullName: encrypted.fullName as string,
      afpId: encrypted.afpId as string,
      workLocation: encrypted.workLocation as string | undefined,
      portfolio: encrypted.portfolio as string | undefined,
      contactNumber: encrypted.contactNumber as string | undefined,
    });
  }
}

/** Get the requesting officer profile for a user (decrypted) */
export async function getWipcOfficerProfile(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(wipcOfficerProfiles)
    .where(eq(wipcOfficerProfiles.userId, userId))
    .limit(1);
  if (!row) return null;
  return decryptOfficer(
    row as unknown as Record<string, unknown>
  ) as unknown as WipcOfficerProfile;
}

/** List all WIPC members (decrypted) — admin only */
export async function listWipcMembers() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(wipcMembers)
    .orderBy(wipcMembers.createdAt);
  return rows.map(
    r =>
      decryptMember(
        r as unknown as Record<string, unknown>
      ) as unknown as WipcMemberRecord
  );
}

// ─── SMEAC Briefings ───────────────────────────────────────────────────────
// See drizzle/schema.ts for the "exceptional use only" framing. A draft is
// only visible to its creator; posting is the one-way action that notifies
// every user and makes it visible to everyone.

export interface SmeacTeamSlot {
  name: string;
  // Only set when this slot came from a real roster CIN (via
  // getSmeacRosterPrefill) — lets the acknowledgement view match this slot
  // to a real acknowledgement. A manually-typed team member has no cin and
  // so can't show an acknowledged/not-acknowledged state, only "unlinked".
  cin?: string | null;
  vehicle: string;
  foot: string;
  skill: string;
  kit: string;
  isTeamLeader: boolean;
}

function parseSmeacStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSmeacTeamSlots(raw: string | null): SmeacTeamSlot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // sheetCins (the source for a slot's cin) is stored in whatever case it
    // was entered, but users.cin and acknowledgement cins are always
    // upper-cased — normalize here so the acknowledgedCins match works.
    return parsed.map((slot: SmeacTeamSlot) => ({
      ...slot,
      cin: slot.cin ? slot.cin.toUpperCase() : slot.cin,
    }));
  } catch {
    return [];
  }
}

export interface SmeacBriefingView
  extends Omit<
    SmeacBriefing,
    | "objectives"
    | "teamSlots"
    | "extraLocations"
    | "otherAgencies"
    | "accoutrements"
    | "covertIdentifiers"
  > {
  objectives: string[];
  teamSlots: SmeacTeamSlot[];
  extraLocations: string[];
  otherAgencies: string[];
  accoutrements: string[];
  covertIdentifiers: string[];
}

function toSmeacBriefingView(row: SmeacBriefing): SmeacBriefingView {
  return {
    ...row,
    objectives: parseSmeacStringArray(row.objectives),
    teamSlots: parseSmeacTeamSlots(row.teamSlots),
    extraLocations: parseSmeacStringArray(row.extraLocations),
    otherAgencies: parseSmeacStringArray(row.otherAgencies),
    accoutrements: parseSmeacStringArray(row.accoutrements),
    covertIdentifiers: parseSmeacStringArray(row.covertIdentifiers),
  };
}

export interface UpsertSmeacBriefingInput {
  operationId: number;
  sheetId?: number | null;
  targetId?: number | null;
  voiOverride?: string | null;
  hbOverride?: string | null;
  extraLocations?: string[];
  situation?: string | null;
  backgroundIntel?: string | null;
  knownRisks?: string | null;
  otherAgencies?: string[];
  mission?: string | null;
  overallPlan?: string | null;
  actionsOn?: string | null;
  situationChange?: string | null;
  objectives?: string[];
  legalAuthArrest?: string | null;
  afpOrders?: string | null;
  warrant?: string | null;
  accoutrements?: string[];
  covertIdentifiers?: string[];
  firstAidAllVehicles?: boolean;
  firstAidMemberName?: string | null;
  commsPrimary?: string | null;
  commsSecondary?: string | null;
  locationOfTeamLeader?: string | null;
  reportingProcedures?: string | null;
  teamSlots?: SmeacTeamSlot[];
  mapSnapshotUrl?: string | null;
  mapSnapshotSource?: string | null;
}

export async function createSmeacBriefingDraft(
  data: UpsertSmeacBriefingInput,
  createdBy: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(smeacBriefings).values({
    operationId: data.operationId,
    sheetId: data.sheetId ?? null,
    targetId: data.targetId ?? null,
    voiOverride: data.voiOverride ?? null,
    hbOverride: data.hbOverride ?? null,
    extraLocations: JSON.stringify(data.extraLocations ?? []),
    situation: data.situation ?? null,
    backgroundIntel: data.backgroundIntel ?? null,
    knownRisks: data.knownRisks ?? null,
    otherAgencies: JSON.stringify(data.otherAgencies ?? []),
    mission: data.mission ?? null,
    overallPlan: data.overallPlan ?? null,
    actionsOn: data.actionsOn ?? null,
    situationChange: data.situationChange ?? null,
    objectives: JSON.stringify(data.objectives ?? []),
    legalAuthArrest: data.legalAuthArrest ?? null,
    afpOrders: data.afpOrders ?? null,
    warrant: data.warrant ?? null,
    accoutrements: JSON.stringify(data.accoutrements ?? []),
    covertIdentifiers: JSON.stringify(data.covertIdentifiers ?? []),
    firstAidAllVehicles: data.firstAidAllVehicles ?? true,
    firstAidMemberName: data.firstAidMemberName ?? null,
    commsPrimary: data.commsPrimary ?? null,
    commsSecondary: data.commsSecondary ?? null,
    locationOfTeamLeader: data.locationOfTeamLeader ?? null,
    reportingProcedures: data.reportingProcedures ?? null,
    teamSlots: JSON.stringify(data.teamSlots ?? []),
    mapSnapshotUrl: data.mapSnapshotUrl ?? null,
    mapSnapshotSource: data.mapSnapshotSource ?? null,
    status: "draft",
    createdBy,
  });
  return result.insertId as number;
}

/**
 * Updates a briefing's content regardless of status — a posted briefing can
 * be corrected without that alone re-notifying anyone; re-notifying is only
 * ever a deliberate, separate call to postSmeacBriefing.
 */
export async function updateSmeacBriefing(
  id: number,
  data: UpsertSmeacBriefingInput
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(smeacBriefings)
    .set({
      operationId: data.operationId,
      sheetId: data.sheetId ?? null,
      targetId: data.targetId ?? null,
      voiOverride: data.voiOverride ?? null,
      hbOverride: data.hbOverride ?? null,
      extraLocations: JSON.stringify(data.extraLocations ?? []),
      situation: data.situation ?? null,
      backgroundIntel: data.backgroundIntel ?? null,
      knownRisks: data.knownRisks ?? null,
      otherAgencies: JSON.stringify(data.otherAgencies ?? []),
      mission: data.mission ?? null,
      overallPlan: data.overallPlan ?? null,
      actionsOn: data.actionsOn ?? null,
      situationChange: data.situationChange ?? null,
      objectives: JSON.stringify(data.objectives ?? []),
      legalAuthArrest: data.legalAuthArrest ?? null,
      afpOrders: data.afpOrders ?? null,
      warrant: data.warrant ?? null,
      accoutrements: JSON.stringify(data.accoutrements ?? []),
      covertIdentifiers: JSON.stringify(data.covertIdentifiers ?? []),
      firstAidAllVehicles: data.firstAidAllVehicles ?? true,
      firstAidMemberName: data.firstAidMemberName ?? null,
      commsPrimary: data.commsPrimary ?? null,
      commsSecondary: data.commsSecondary ?? null,
      locationOfTeamLeader: data.locationOfTeamLeader ?? null,
      reportingProcedures: data.reportingProcedures ?? null,
      teamSlots: JSON.stringify(data.teamSlots ?? []),
      mapSnapshotUrl: data.mapSnapshotUrl ?? null,
      mapSnapshotSource: data.mapSnapshotSource ?? null,
      revision: sql`${smeacBriefings.revision} + 1`,
    })
    .where(eq(smeacBriefings.id, id));
}

export async function getSmeacBriefingById(
  id: number
): Promise<SmeacBriefingView | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(smeacBriefings)
    .where(and(eq(smeacBriefings.id, id), isNull(smeacBriefings.deletedAt)))
    .limit(1);
  return row ? toSmeacBriefingView(row) : undefined;
}

export async function listSmeacBriefings(): Promise<SmeacBriefingView[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(smeacBriefings)
    .where(isNull(smeacBriefings.deletedAt))
    .orderBy(desc(smeacBriefings.createdAt));
  return rows.map(toSmeacBriefingView);
}

/**
 * Posts (or re-posts) a briefing — always notifies every user, whether this
 * is the first post of a draft or a re-post after editing a already-posted
 * one. Returns the id list notified, or undefined if the briefing doesn't
 * exist (or was deleted).
 */
export async function postSmeacBriefing(
  id: number,
  postedByCIN: string,
  notifyBody: { title: string; body: string; url: string },
  // Explicit recipient list (e.g. from the "who to notify" picker) — falls
  // back to every registered user when omitted or empty, same as before.
  targetUserIds?: number[]
): Promise<number[] | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db
    .select()
    .from(smeacBriefings)
    .where(and(eq(smeacBriefings.id, id), isNull(smeacBriefings.deletedAt)))
    .limit(1);
  if (!existing) return undefined;

  await db
    .update(smeacBriefings)
    .set({ status: "posted", postedAt: Date.now(), postedByCIN })
    .where(eq(smeacBriefings.id, id));

  // Distinguish "no list passed" (default: everyone, back-compat for any
  // caller that doesn't offer a picker) from "explicitly an empty list"
  // (the picker's Select All was cleared — notify no one, don't silently
  // fall back to everyone).
  const userIds =
    targetUserIds !== undefined
      ? targetUserIds
      : (await getAllUsers()).map(u => u.id);
  await createNotificationsForUsers(userIds, {
    title: notifyBody.title,
    body: notifyBody.body,
    url: notifyBody.url,
    sourceModule: "smeacBriefing",
  });
  return userIds;
}

export async function softDeleteSmeacBriefing(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(smeacBriefings)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(smeacBriefings.id, id));
}

// ── Recycle Bin support — see getRecycleBinItems()/purgeExpiredRecycleBinItems() ──
export async function reinstateSmeacBriefing(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(smeacBriefings)
    .set({ deletedAt: null, deletedByCIN: null })
    .where(eq(smeacBriefings.id, id));
}

// Hard delete — used once a soft-deleted briefing's 7-day recycle bin grace
// period expires, or an admin permanently deletes it directly from the bin.
// Acknowledgements have no meaning without their briefing (no FK constraint
// to enforce this at the DB level, since none of this schema's tables
// declare .references() — see the acknowledgements table definitions), so
// they're cleaned up here rather than left behind as orphaned rows.
export async function deleteSmeacBriefing(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(smeacAcknowledgements)
    .where(eq(smeacAcknowledgements.briefingId, id));
  await db.delete(smeacBriefings).where(eq(smeacBriefings.id, id));
}

/**
 * Explicit, audited "I have seen this" — deliberately not the same thing as
 * opening the notification. Scoped to a revision: an edit + re-post is a
 * new revision, and a prior revision's acknowledgement doesn't carry
 * forward, so this is "first acknowledgement of THIS revision wins".
 */
export async function acknowledgeSmeacBriefing(
  briefingId: number,
  userId: number,
  cin: string,
  revision: number
): Promise<SmeacAcknowledgement> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db
    .select()
    .from(smeacAcknowledgements)
    .where(
      and(
        eq(smeacAcknowledgements.briefingId, briefingId),
        eq(smeacAcknowledgements.userId, userId),
        eq(smeacAcknowledgements.revision, revision)
      )
    )
    .limit(1);
  if (existing) return existing;

  const acknowledgedAt = Date.now();
  const cinUpper = cin.toUpperCase();
  await db.insert(smeacAcknowledgements).values({
    briefingId,
    userId,
    cin: cinUpper,
    revision,
    acknowledgedAt,
  });
  return { id: 0, briefingId, userId, cin: cinUpper, revision, acknowledgedAt };
}

export async function getSmeacAcknowledgementForUser(
  briefingId: number,
  userId: number,
  revision: number
): Promise<SmeacAcknowledgement | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(smeacAcknowledgements)
    .where(
      and(
        eq(smeacAcknowledgements.briefingId, briefingId),
        eq(smeacAcknowledgements.userId, userId),
        eq(smeacAcknowledgements.revision, revision)
      )
    )
    .limit(1);
  return row;
}

/** Acknowledgements for the given revision only — a prior revision's don't count. */
export async function getSmeacAcknowledgements(
  briefingId: number,
  revision: number
): Promise<SmeacAcknowledgement[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(smeacAcknowledgements)
    .where(
      and(
        eq(smeacAcknowledgements.briefingId, briefingId),
        eq(smeacAcknowledgements.revision, revision)
      )
    )
    .orderBy(asc(smeacAcknowledgements.acknowledgedAt));
}

/** Today's sheet roster (CIN -> display name) to pre-fill the team grid when raising a briefing from a running sheet. */
export async function getSmeacRosterPrefill(
  sheetId: number
): Promise<SmeacTeamSlot[]> {
  const sheet = await getRunningSheetById(sheetId);
  if (!sheet || !sheet.sheetCins) return [];
  let cins: { cin: string }[] = [];
  try {
    const parsed = JSON.parse(sheet.sheetCins);
    if (Array.isArray(parsed)) cins = parsed;
  } catch {
    return [];
  }
  const allUsers = await getAllUsers();
  const byCin = new Map(allUsers.map(u => [u.cin, u.name]));
  return cins.map(({ cin }) => {
    const cinUpper = cin.toUpperCase();
    return {
      name: byCin.get(cinUpper) ?? cin,
      cin: cinUpper,
      vehicle: "",
      foot: "",
      skill: "",
      kit: "",
      isTeamLeader: false,
    };
  });
}

// ─── UCO Surveillance Deployment Guide ─────────────────────────────────────

export interface UcoGuideBriefingView
  extends Omit<
    UcoGuideBriefing,
    | "accoutrements"
    | "moeEquipment"
    | "additionalMemberCins"
    | "teamMemberCins"
    | "levelNotes"
    | "recipientCins"
    | "extraLocations"
  > {
  accoutrements: string[];
  moeEquipment: string[];
  additionalMemberCins: string[];
  teamMemberCins: string[];
  levelNotes: string[];
  recipientCins: string[];
  extraLocations: string[];
}

function toUcoGuideBriefingView(row: UcoGuideBriefing): UcoGuideBriefingView {
  return {
    ...row,
    accoutrements: parseSmeacStringArray(row.accoutrements),
    moeEquipment: parseSmeacStringArray(row.moeEquipment),
    additionalMemberCins: parseSmeacStringArray(row.additionalMemberCins),
    teamMemberCins: parseSmeacStringArray(row.teamMemberCins),
    levelNotes: parseSmeacStringArray(row.levelNotes),
    recipientCins: parseSmeacStringArray(row.recipientCins),
    extraLocations: parseSmeacStringArray(row.extraLocations),
  };
}

export interface UpsertUcoGuideBriefingInput {
  operationId: number;
  sheetId?: number | null;
  targetId?: number | null;
  voiOverride?: string | null;
  hbOverride?: string | null;
  extraLocations?: string[];
  accoutrements?: string[];
  moeEquipment?: string[];
  opBackground?: string | null;
  opObjective?: string | null;
  riskAssessment?: string | null;
  ucoPhotoRef?: string | null;
  ucoVehiclePhotoRef?: string | null;
  ucoNames?: string | null;
  planObjective?: string | null;
  planTimings?: string | null;
  planControllerLocation?: string | null;
  planTracking?: string | null;
  planComms?: string | null;
  planDangerSignal?: string | null;
  planIngressEgress?: string | null;
  planAuthorisedActions?: string | null;
  teamLeaderCin?: string | null;
  seniorOperativeCin?: string | null;
  huxCin?: string | null;
  ramCin?: string | null;
  additionalMemberCins?: string[];
  teamMemberCins?: string[];
  tacticsNotes?: string | null;
  currentLevel?: number;
  levelNotes?: string[];
  commsVehiclePrimary?: string | null;
  commsVehicleAlternate?: string | null;
  commsFootPrimary?: string | null;
  commsFootAlternate?: string | null;
  commsNotes?: string | null;
}

function ucoGuideUpsertValues(data: UpsertUcoGuideBriefingInput) {
  return {
    operationId: data.operationId,
    sheetId: data.sheetId ?? null,
    targetId: data.targetId ?? null,
    voiOverride: data.voiOverride ?? null,
    hbOverride: data.hbOverride ?? null,
    extraLocations: JSON.stringify(data.extraLocations ?? []),
    accoutrements: JSON.stringify(data.accoutrements ?? []),
    moeEquipment: JSON.stringify(data.moeEquipment ?? []),
    opBackground: data.opBackground ?? null,
    opObjective: data.opObjective ?? null,
    riskAssessment: data.riskAssessment ?? null,
    ucoPhotoRef: data.ucoPhotoRef ?? null,
    ucoVehiclePhotoRef: data.ucoVehiclePhotoRef ?? null,
    ucoNames: data.ucoNames ?? null,
    planObjective: data.planObjective ?? null,
    planTimings: data.planTimings ?? null,
    planControllerLocation: data.planControllerLocation ?? null,
    planTracking: data.planTracking ?? null,
    planComms: data.planComms ?? null,
    planDangerSignal: data.planDangerSignal ?? null,
    planIngressEgress: data.planIngressEgress ?? null,
    planAuthorisedActions: data.planAuthorisedActions ?? null,
    teamLeaderCin: data.teamLeaderCin ?? null,
    seniorOperativeCin: data.seniorOperativeCin ?? null,
    huxCin: data.huxCin ?? null,
    ramCin: data.ramCin ?? null,
    additionalMemberCins: JSON.stringify(data.additionalMemberCins ?? []),
    teamMemberCins: JSON.stringify(data.teamMemberCins ?? []),
    tacticsNotes: data.tacticsNotes ?? null,
    currentLevel: data.currentLevel ?? 2,
    levelNotes: JSON.stringify(data.levelNotes ?? ["", "", "", "", ""]),
    commsVehiclePrimary: data.commsVehiclePrimary ?? null,
    commsVehicleAlternate: data.commsVehicleAlternate ?? null,
    commsFootPrimary: data.commsFootPrimary ?? null,
    commsFootAlternate: data.commsFootAlternate ?? null,
    commsNotes: data.commsNotes ?? null,
  };
}

export async function createUcoGuideDraft(
  data: UpsertUcoGuideBriefingInput,
  createdBy: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(ucoGuideBriefings).values({
    ...ucoGuideUpsertValues(data),
    status: "draft",
    createdBy,
  });
  return result.insertId as number;
}

/**
 * Updates a guide's content regardless of status — same as SMEAC, a posted
 * guide can be corrected without that alone re-notifying anyone; re-notifying
 * is only ever the separate, deliberate ucoGuide.post call.
 */
export async function updateUcoGuideBriefing(
  id: number,
  data: UpsertUcoGuideBriefingInput
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(ucoGuideBriefings)
    .set({
      ...ucoGuideUpsertValues(data),
      revision: sql`${ucoGuideBriefings.revision} + 1`,
    })
    .where(eq(ucoGuideBriefings.id, id));
}

export async function getUcoGuideBriefingById(
  id: number
): Promise<UcoGuideBriefingView | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(ucoGuideBriefings)
    .where(
      and(eq(ucoGuideBriefings.id, id), isNull(ucoGuideBriefings.deletedAt))
    )
    .limit(1);
  return row ? toUcoGuideBriefingView(row) : undefined;
}

export async function listUcoGuideBriefings(): Promise<UcoGuideBriefingView[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(ucoGuideBriefings)
    .where(isNull(ucoGuideBriefings.deletedAt))
    .orderBy(desc(ucoGuideBriefings.createdAt));
  return rows.map(toUcoGuideBriefingView);
}

/**
 * Posts (or re-posts) a guide to an explicit, hand-picked set of users —
 * unlike SMEAC there is no "everyone" fallback here, since the whole point
 * is a Notify picker (roster pre-selected, everyone else opt-in). Snapshots
 * the recipients' CINs onto the row for the red/green "sent to" display,
 * since that must survive the roster changing after the fact.
 */
export async function postUcoGuideBriefing(
  id: number,
  postedByCIN: string,
  notifyBody: { title: string; body: string; url: string },
  recipientUserIds: number[]
): Promise<{ notifiedUserIds: number[]; recipientCins: string[] } | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db
    .select()
    .from(ucoGuideBriefings)
    .where(
      and(eq(ucoGuideBriefings.id, id), isNull(ucoGuideBriefings.deletedAt))
    )
    .limit(1);
  if (!existing) return undefined;

  const allUsers = await getAllUsers();
  const byId = new Map(allUsers.map(u => [u.id, u.cin]));
  const recipientCins = recipientUserIds
    .map(uid => byId.get(uid))
    .filter((cin): cin is string => !!cin)
    .map(cin => cin.toUpperCase());

  await db
    .update(ucoGuideBriefings)
    .set({
      status: "posted",
      postedAt: Date.now(),
      postedByCIN,
      recipientCins: JSON.stringify(recipientCins),
    })
    .where(eq(ucoGuideBriefings.id, id));

  await createNotificationsForUsers(recipientUserIds, {
    title: notifyBody.title,
    body: notifyBody.body,
    url: notifyBody.url,
    sourceModule: "ucoGuideBriefing",
  });
  return { notifiedUserIds: recipientUserIds, recipientCins };
}

/** Live update of the current surveillance level only — no revision bump, no re-notification, just an in-place status change during an active deployment. */
export async function setUcoGuideLevel(id: number, level: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(ucoGuideBriefings)
    .set({ currentLevel: level })
    .where(eq(ucoGuideBriefings.id, id));
}

export async function softDeleteUcoGuideBriefing(id: number, cin: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(ucoGuideBriefings)
    .set({ deletedAt: Date.now(), deletedByCIN: cin })
    .where(eq(ucoGuideBriefings.id, id));
}

// ── Recycle Bin support — see getRecycleBinItems()/purgeExpiredRecycleBinItems() ──
export async function reinstateUcoGuideBriefing(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(ucoGuideBriefings)
    .set({ deletedAt: null, deletedByCIN: null })
    .where(eq(ucoGuideBriefings.id, id));
}

// Hard delete — see deleteSmeacBriefing's matching comment above for why
// acknowledgements are cleaned up here too.
export async function deleteUcoGuideBriefing(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(ucoGuideAcknowledgements)
    .where(eq(ucoGuideAcknowledgements.briefingId, id));
  await db.delete(ucoGuideBriefings).where(eq(ucoGuideBriefings.id, id));
}

export async function acknowledgeUcoGuideBriefing(
  briefingId: number,
  userId: number,
  cin: string,
  revision: number
): Promise<UcoGuideAcknowledgement> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db
    .select()
    .from(ucoGuideAcknowledgements)
    .where(
      and(
        eq(ucoGuideAcknowledgements.briefingId, briefingId),
        eq(ucoGuideAcknowledgements.userId, userId),
        eq(ucoGuideAcknowledgements.revision, revision)
      )
    )
    .limit(1);
  if (existing) return existing;

  const acknowledgedAt = Date.now();
  const cinUpper = cin.toUpperCase();
  await db.insert(ucoGuideAcknowledgements).values({
    briefingId,
    userId,
    cin: cinUpper,
    revision,
    acknowledgedAt,
  });
  return { id: 0, briefingId, userId, cin: cinUpper, revision, acknowledgedAt };
}

export async function getUcoGuideAcknowledgementForUser(
  briefingId: number,
  userId: number,
  revision: number
): Promise<UcoGuideAcknowledgement | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(ucoGuideAcknowledgements)
    .where(
      and(
        eq(ucoGuideAcknowledgements.briefingId, briefingId),
        eq(ucoGuideAcknowledgements.userId, userId),
        eq(ucoGuideAcknowledgements.revision, revision)
      )
    )
    .limit(1);
  return row;
}

export async function getUcoGuideAcknowledgements(
  briefingId: number,
  revision: number
): Promise<UcoGuideAcknowledgement[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ucoGuideAcknowledgements)
    .where(
      and(
        eq(ucoGuideAcknowledgements.briefingId, briefingId),
        eq(ucoGuideAcknowledgements.revision, revision)
      )
    )
    .orderBy(asc(ucoGuideAcknowledgements.acknowledgedAt));
}

/** Active running sheet's roster (CIN -> display name) — the pre-selected "primary" list in the Notify picker. */
export async function getUcoGuideRosterPrefill(
  sheetId: number
): Promise<{ cin: string; name: string }[]> {
  const sheet = await getRunningSheetById(sheetId);
  if (!sheet || !sheet.sheetCins) return [];
  let cins: { cin: string }[] = [];
  try {
    const parsed = JSON.parse(sheet.sheetCins);
    if (Array.isArray(parsed)) cins = parsed;
  } catch {
    return [];
  }
  const allUsers = await getAllUsers();
  const byCin = new Map(allUsers.map(u => [u.cin, u.name]));
  return cins.map(({ cin }) => {
    const cinUpper = cin.toUpperCase();
    return { cin: cinUpper, name: byCin.get(cinUpper) ?? cin };
  });
}
