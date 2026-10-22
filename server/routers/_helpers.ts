import { storagePut } from "../storage";
import { convertDocxToPdf } from "../documentImport/docxToPdf";
import { embedFaceAt } from "../faceRecognition";
import { lowerVehicleColour } from "@shared/vehicleColour";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME, SESSION_EXPIRY_MS } from "@shared/const";
import { COMMAND_CODES, COMMAND_LABELS } from "@shared/commands";
import {
  commandsOfUsers,
  filterByOperationAccess,
  toAccessUser,
} from "../operationAccess";
import { sanitizeTargetSpecialProjects } from "@shared/targetStatus";
import { getSessionCookieOptions } from "../_core/cookies";
import { type PasskeyPerson } from "@shared/passkeyRules";
import { protectedProcedure } from "../_core/trpc";
import { sdk } from "../_core/sdk";
import {
  createAuditLog,
  listTeams,
  getTeamById,
  getAllUsers,
  getOperationById,
  getRunningSheetById,
  getUserById,
  setTargetBackground,
  visitorTeamMap,
  getAttachmentRowSheetInfo,
  findSimilarFaces,
  type FaceMatchCandidate,
} from "../db";

import { listWipcMembers } from "../db";

// ─── Role Guards ──────────────────────────────────────────────────────────────

/** Member or Admin can certify/uncertify */
export const certifierOrAdminProcedure = protectedProcedure.use(
  ({ ctx, next }) => {
    if (ctx.user.role !== "member" && ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Member or Admin role required.",
      });
    }
    return next({ ctx });
  }
);

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required." });
  }
  return next({ ctx });
});

/**
 * Throws FORBIDDEN if the operation containing a sheet is not in 'active' status.
 * Used to block all mutations on Before Court / Archive operations.
 */
export async function guardActiveOperation(operationId: number) {
  const op = await getOperationById(operationId);
  if (!op)
    throw new TRPCError({ code: "NOT_FOUND", message: "Operation not found." });
  if (op.status !== "active") {
    const label = op.status === "before_court" ? "Before Court" : "Archive";
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `This operation is in ${label} status. Move it back to Active before making changes.`,
    });
  }
}

export async function guardActiveSheet(sheetId: number) {
  const sheet = await getRunningSheetById(sheetId);
  if (!sheet)
    throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
  await guardActiveOperation(sheet.operationId);
}

// A photo's identity (which Target/Associate/Vehicle/person it's tagged
// as) is part of the same evidentiary record as the row's observation
// text — row.update/member.add already refuse to touch a row once it's
// locked (fully certified), but the attachment-entity-link mutations
// (linking, unlinking, confirming a face, uploading a new photo) didn't
// check this at all, so a photo could be relabelled after its row was
// certified or its sheet closed. Mirrors the check
// confirmFaceMatch/db.ts already applies to its own (automatic,
// FR-triggered) rename path. Attachments with no row (manual uploads not
// tied to any sheet) have nothing to guard against.
export async function guardAttachmentRowUnlocked(attachmentId: number) {
  const info = await getAttachmentRowSheetInfo(attachmentId);
  if (info && (info.isRowLocked || info.isSheetClosed)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: info.isSheetClosed
        ? "This photo's running sheet is closed. Reopen it to change this image."
        : "This photo's row is certified/locked. Uncertify it to change this image.",
    });
  }
}

// Structured input fields shared by target.create/update and
// target.registry.create/update (and the associate.* router) — the raw
// controlled parts a Target/Associate's name/tgt, hbf/hb, v1f/v1 are
// composed from client-side, kept here so re-editing later starts from the
// same structured values instead of just the composed strings.
export const structuredTargetFieldsSchema = {
  firstNames: z.string().optional().nullable(),
  surname: z.string().optional().nullable(),
  bornDate: z.string().optional().nullable(), // ISO yyyy-mm-dd
  addrUnitNo: z.string().optional().nullable(),
  addrHouseNo: z.string().optional().nullable(),
  addrStreetName: z.string().optional().nullable(),
  addrStreetType: z.string().optional().nullable(),
  addrSuburb: z.string().optional().nullable(),
  addrState: z.string().optional().nullable(),
  addrBusinessName: z.string().optional().nullable(),
  vehRegistration: z.string().optional().nullable(),
  vehState: z.string().optional().nullable(),
  // A vehicle's colour is always saved in lower case (shared/vehicleColour.ts).
  vehColour: z
    .string()
    .optional()
    .nullable()
    .transform(v => (typeof v === "string" ? lowerVehicleColour(v) : v)),
  vehMake: z.string().optional().nullable(),
  vehModel: z.string().optional().nullable(),
  vehType: z.string().optional().nullable(),
  extraAddresses: z.string().optional().nullable(), // JSON array of {label?,unitNo,houseNo,streetName,streetType,suburb,state,full,short}
};

// Person-target status fields — Motor Drivers Licence and bail. Kept out of
// structuredTargetFieldsSchema because that's also spread into the
// associate.* procedures, and associates don't carry these. Values are
// free-text varchars in the DB for forward-compat, but constrained here.
export const targetStatusFieldsSchema = {
  mdlStatus: z.enum(["active", "none", "suspended"]).optional().nullable(),
  bailStatus: z.enum(["yes", "no"]).optional().nullable(),
  bailConditions: z.enum(["yes", "no"]).optional().nullable(),
  bailConditionsText: z.string().optional().nullable(),
  // JSON [{key, detail}] — only TI/LBS/SEEK/CAD survive (see shared/targetStatus).
  specialProjects: z
    .string()
    .optional()
    .nullable()
    .transform(v =>
      v === undefined ? undefined : sanitizeTargetSpecialProjects(v)
    ),
};

/** Saves a target's freeform Background and writes the audit entry — shared
 * by target.registry.setBackground (editing on the registry card) and the
 * two create procedures (typed in Add Target to Registry). */
/** The closest faces on file to the `faceIndex`th face in `buffer`, limited to
 * operations the person can reach (see attachment.faceMatches). */
export async function faceMatchesFor(
  user: Parameters<typeof toAccessUser>[0],
  buffer: Buffer,
  faceIndex: number
): Promise<{ matches: FaceMatchCandidate[] }> {
  const face = await embedFaceAt(buffer, faceIndex);
  if (!face) return { matches: [] };
  const candidates = await findSimilarFaces(face.embedding, -1);
  return {
    matches: await filterByOperationAccess(
      toAccessUser(user),
      candidates,
      c => c.sourceOperationId
    ),
  };
}

export async function saveTargetBackgroundWithAudit(
  user: { id: number; cin?: string | null },
  target: { id: number; name: string; registryBackground?: string | null },
  background: string
) {
  const saved = await setTargetBackground(
    target.id,
    background,
    user.cin ?? null
  );
  await createAuditLog({
    sheetId: 0,
    userId: user.id,
    userName: user.cin ?? "Unknown",
    userCIN: user.cin ?? null,
    action: "target_background_updated",
    details: `Background ${
      saved.registryBackground ? "updated" : "cleared"
    } on target "${target.name}" (${
      (target.registryBackground ?? "").length
    } to ${(saved.registryBackground ?? "").length} characters)`,
    createdAt: Date.now(),
  });
  return saved;
}

export const smeacTeamSlotSchema = z.object({
  name: z.string(),
  cin: z.string().optional().nullable(),
  vehicle: z.string(),
  foot: z.string(),
  skill: z.string(),
  kit: z.string(),
  isTeamLeader: z.boolean(),
});

export const smeacBriefingFieldsSchema = {
  operationId: z.number(),
  sheetId: z.number().optional().nullable(),
  targetId: z.number().optional().nullable(),
  voiOverride: z.string().optional().nullable(),
  hbOverride: z.string().optional().nullable(),
  extraLocations: z.array(z.string()).optional(),
  situation: z.string().optional().nullable(),
  backgroundIntel: z.string().optional().nullable(),
  knownRisks: z.string().optional().nullable(),
  otherAgencies: z.array(z.string()).optional(),
  mission: z.string().optional().nullable(),
  overallPlan: z.string().optional().nullable(),
  actionsOn: z.string().optional().nullable(),
  situationChange: z.string().optional().nullable(),
  objectives: z.array(z.string()).optional(),
  legalAuthArrest: z.string().optional().nullable(),
  afpOrders: z.string().optional().nullable(),
  warrant: z.string().optional().nullable(),
  accoutrements: z.array(z.string()).optional(),
  covertIdentifiers: z.array(z.string()).optional(),
  firstAidAllVehicles: z.boolean().optional(),
  firstAidMemberName: z.string().optional().nullable(),
  commsPrimary: z.string().optional().nullable(),
  commsSecondary: z.string().optional().nullable(),
  locationOfTeamLeader: z.string().optional().nullable(),
  reportingProcedures: z.string().optional().nullable(),
  teamSlots: z.array(smeacTeamSlotSchema).optional(),
  mapSnapshotUrl: z.string().optional().nullable(),
  mapSnapshotSource: z.string().optional().nullable(),
};

export const ucoGuideBriefingFieldsSchema = {
  operationId: z.number(),
  sheetId: z.number().optional().nullable(),
  targetId: z.number().optional().nullable(),
  voiOverride: z.string().optional().nullable(),
  hbOverride: z.string().optional().nullable(),
  extraLocations: z.array(z.string()).optional(),
  accoutrements: z.array(z.string()).optional(),
  moeEquipment: z.array(z.string()).optional(),
  opBackground: z.string().optional().nullable(),
  opObjective: z.string().optional().nullable(),
  riskAssessment: z.string().optional().nullable(),
  ucoPhotoRef: z.string().optional().nullable(),
  ucoVehiclePhotoRef: z.string().optional().nullable(),
  ucoNames: z.string().optional().nullable(),
  planObjective: z.string().optional().nullable(),
  planTimings: z.string().optional().nullable(),
  planControllerLocation: z.string().optional().nullable(),
  planTracking: z.string().optional().nullable(),
  planComms: z.string().optional().nullable(),
  planDangerSignal: z.string().optional().nullable(),
  planIngressEgress: z.string().optional().nullable(),
  planAuthorisedActions: z.string().optional().nullable(),
  teamLeaderCin: z.string().optional().nullable(),
  seniorOperativeCin: z.string().optional().nullable(),
  huxCin: z.string().optional().nullable(),
  ramCin: z.string().optional().nullable(),
  additionalMemberCins: z.array(z.string()).optional(),
  teamMemberCins: z.array(z.string()).optional(),
  tacticsNotes: z.string().optional().nullable(),
  currentLevel: z.number().min(1).max(5).optional(),
  levelNotes: z.array(z.string()).length(5).optional(),
  commsVehiclePrimary: z.string().optional().nullable(),
  commsVehicleAlternate: z.string().optional().nullable(),
  commsFootPrimary: z.string().optional().nullable(),
  commsFootAlternate: z.string().optional().nullable(),
  commsNotes: z.string().optional().nullable(),
};

// Stores a document-import's original file (any type) and, for a DOCX
// upload specifically, a companion PDF rendered via LibreOffice so the
// in-app viewer can show it pixel-for-pixel through the same pdf.js path
// used for real PDF uploads (see DocumentViewerModal.tsx and
// docxToPdf.ts's own comment) instead of mammoth.js's HTML approximation.
// Shared by all three save paths that can carry a document snapshot
// (target.registry.create, createLinkedFromAssociate, mergeFieldDetails)
// so the conversion logic only lives in one place.
export async function storeTargetDocumentSourceFile(params: {
  targetId: number;
  fileName: string | null | undefined;
  base64: string;
  mimeType: string | null | undefined;
}): Promise<{ sourceFileUrl: string; renderablePdfUrl: string | null }> {
  const buffer = Buffer.from(params.base64, "base64");
  const { url: sourceFileUrl } = await storagePut(
    `target-documents/target-${params.targetId}/${Date.now()}-${params.fileName || "document"}`,
    buffer,
    params.mimeType || "application/octet-stream"
  );
  const isDocx =
    params.mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(params.fileName || "");
  let renderablePdfUrl: string | null = null;
  if (isDocx) {
    const pdfBytes = await convertDocxToPdf(buffer);
    if (pdfBytes) {
      const put = await storagePut(
        `target-documents/target-${params.targetId}/${Date.now()}-rendered.pdf`,
        pdfBytes,
        "application/pdf"
      );
      renderablePdfUrl = put.url;
    }
  }
  return { sourceFileUrl, renderablePdfUrl };
}

// ─── App Router ───────────────────────────────────────────────────────────────

/** WIPC members are sensitive: each belongs to the Command of the admin who
 * created them, and only that Command's admins (or an all-region admin) see
 * or change them. */
export async function assertCanManageWipcMember(
  admin: { command: string; allRegions: boolean },
  memberId: number
) {
  if (admin.allRegions) return;
  const [members, commands] = await Promise.all([
    listWipcMembers(),
    commandsOfUsers(),
  ]);
  const m = members.find(x => x.id === memberId);
  if (m && commands.get(m.createdBy) !== admin.command) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "That WIPC member belongs to another Command.",
    });
  }
}

/** An admin manages people in their own Command; only an all-region admin
 * reaches across Commands. */
export async function assertCanManageUser(
  admin: { command: (typeof COMMAND_CODES)[number]; allRegions: boolean },
  targetUserId: number
) {
  const target = await getUserById(targetUserId);
  if (!target) return;
  if (!admin.allRegions && target.command !== admin.command) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${target.name} belongs to ${COMMAND_LABELS[target.command]}. Only that Command's admins can change their account.`,
    });
  }
}

/**
 * A visitor the viewer's Command hosts shows in that Command's team on the
 * live map (pin colour and grouping), whatever their own Command's team is.
 */
export async function withHostedTeams<
  T extends {
    userId: number;
    teamId: number | null;
    teamName: string | null;
    teamColour: string | null;
  },
>(
  viewer: { command: (typeof COMMAND_CODES)[number]; allRegions: boolean },
  rows: T[]
): Promise<T[]> {
  const hosted = await visitorTeamMap(
    viewer.allRegions ? null : viewer.command
  );
  if (hosted.size === 0) return rows;
  const byId = new Map((await listTeams()).map(t => [t.id, t]));
  return rows.map(r => {
    const t = byId.get(hosted.get(r.userId) ?? -1);
    return t
      ? { ...r, teamId: t.id, teamName: t.name, teamColour: t.colour }
      : r;
  });
}

export const TEAM_COLOUR_RE = /^#[0-9a-fA-F]{6}$/;
export const teamInput = {
  name: z.string().trim().min(1, "Give the team a name.").max(64),
  /** #rrggbb */
  colour: z
    .string()
    .regex(TEAM_COLOUR_RE, "Pick a colour.")
    .nullable()
    .optional(),
  /** Assumed Identity phones for the Crash Helper. */
  aiPhones: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  /** Map Settings → Teams: always listed, or only while someone is logged in. */
  mapVisibility: z.enum(["always", "online"]).default("always"),
  /** Members' location sharing is forced on at login and can't be turned off. */
  forceShare: z.boolean().default(false),
  /** Offer this team as an "Add team" button on the New Running Sheet. */
  offerOnNewSheet: z.boolean().default(true),
};

/** A team can only be given to someone in the same Command. */
export async function assertTeamFitsCommand(
  teamId: number,
  command: (typeof COMMAND_CODES)[number]
) {
  const team = await getTeamById(teamId);
  if (!team || team.command !== command) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `That team doesn't belong to ${COMMAND_LABELS[command]}.`,
    });
  }
}

/** An admin manages their own Command's teams; an all-region admin any. */
export async function assertCanManageTeam(
  admin: { command: (typeof COMMAND_CODES)[number]; allRegions: boolean },
  teamId: number
) {
  const team = await getTeamById(teamId);
  if (!team) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
  }
  if (!admin.allRegions && team.command !== admin.command) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `That team belongs to ${COMMAND_LABELS[team.command]}. Only that Command's admins can change it.`,
    });
  }
  return team;
}

/** Until somebody is an all-region admin, any admin may make the first one
 * (otherwise nobody could ever be). After that only an all-region admin can. */
export async function noAllRegionAdminYet(): Promise<boolean> {
  return (await getAllUsers()).every(u => !u.allRegions);
}

/** Whole-system maintenance tools act on every Command's data. */
export function requireAllRegions(user: { allRegions: boolean }) {
  if (!user.allRegions) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an all-region admin can run system-wide tools.",
    });
  }
}

/** Starts a signed-in session for `user` (cookie), as a password sign-in does. */
export async function startSignedInSession(
  ctx: { req: Parameters<typeof getSessionCookieOptions>[0]; res: any },
  user: { username: string; name: string }
) {
  const sessionToken = await sdk.createSessionToken(user.username, {
    name: user.name,
    expiresInMs: SESSION_EXPIRY_MS,
  });
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, sessionToken, {
    ...cookieOptions,
    maxAge: SESSION_EXPIRY_MS,
  });
}

export const signedInUserShape = (user: {
  id: number;
  name: string;
  cin: string | null;
  unit: string | null;
  role: string;
  username: string;
  mustChangePassword: boolean;
}) => ({
  id: user.id,
  name: user.name,
  cin: user.cin,
  unit: user.unit,
  role: user.role,
  username: user.username,
  mustChangePassword: user.mustChangePassword,
});

export const passkeyPerson = (u: {
  id: number;
  cin: string | null;
  role: string;
  command: string;
  allRegions: boolean;
}): PasskeyPerson => ({
  id: u.id,
  cin: u.cin,
  role: u.role,
  command: u.command,
  allRegions: u.allRegions,
});
