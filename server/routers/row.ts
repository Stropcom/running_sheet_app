import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { firstRowFill } from "@shared/firstRow";
import { ceaseMembers, ceaseRowText } from "@shared/ceaseRow";
import { rowTimeForNewRow } from "@shared/rowTime";
import {
  addRowMember,
  createAuditLog,
  getAllUsers,
  createSheetRow,
  deleteSheetRow,
  getCertificationsByRowIds,
  getMembersByRowIds,
  getRowById,
  getRowsBySheetId,
  getSheetEntityChips,
  getPendingVehicleDepartures,
  getPendingVehicleArrivals,
  getPendingWalkIns,
  getSurveillanceState,
  getPendingHeadingTo,
  getPendingPlacements,
  getPendingContinuityWithDraft,
  isAddressAlreadyMentioned,
  findMissingLocationSuggestion,
  findVagueVehicleMatch,
  getRunningSheetById,
  addDaysISO,
  updateSheetRow,
  insertTravelledViaRow,
  textHasContinuedVia,
  getAttachmentsByRowIds,
} from "../db";

import { guardActiveSheet } from "./_helpers";

const createRowInput = z.object({
  sheetId: z.number(),
  time: z.string().optional(),
  timeMinutes: z.number().optional(),
  dayOffset: z.number().optional(),
  rowDate: z.string().optional(),
  observation: z.string().optional(),
  // Set when any of this row's observation text came from the on-device voice
  // transcription feature (RS Quick Entry's mic button) rather than typing/
  // chips alone — recorded in the row_created audit log entry as an evidentiary
  // trail per CLAUDE.md's audit trail convention, since this is a legal
  // running-sheet record. A whole-row flag, not per-sentence: text can mix typed
  // and voice-inserted content in one submission.
  viaVoice: z.boolean().optional(),
  // Fill in what is missing on a new row: the current Perth time when none is
  // given (shared/rowTime.ts), and on the first row of a sheet "Surveillance
  // commenced in the vicinity of " and the whole team roster
  // (shared/firstRow.ts). The offline sync turns this off — it replays a row
  // later than it was made and adds the row's CINs itself. `autoFirstRow` is
  // the older name for the same switch, still honoured for screens that have
  // not reloaded.
  autoFill: z.boolean().optional(),
  autoFirstRow: z.boolean().optional(),
});
type CreateRowInput = z.infer<typeof createRowInput>;

type RowCtx = { user: { id: number; cin?: string | null } };

/** Makes a row: the one place a new row is written, so Add Row, Quick Entry,
 * the map's Quick Entry and the ceased row all behave alike. `members` puts
 * exactly those CINs on the row (each registered, each audited) in place of
 * the first-row team. */
async function createRowFor(
  ctx: RowCtx,
  input: CreateRowInput,
  extra: { members?: string[]; membersNote?: string; note?: string } = {}
) {
  await guardActiveSheet(input.sheetId);
  const existingRows = await getRowsBySheetId(input.sheetId);
  const rowNumber = existingRows.length + 1;
  const sheet = await getRunningSheetById(input.sheetId);
  const auto = input.autoFill !== false && input.autoFirstRow !== false;
  const fill = !auto
    ? {
        observation: input.observation,
        members: [] as string[],
        filledObservation: false,
      }
    : extra.members
      ? {
          observation: input.observation,
          members: extra.members,
          filledObservation: false,
        }
      : firstRowFill(existingRows.length, sheet?.sheetCins, input.observation);
  // The current time, when none was given (not on a sheet for another day).
  const stamp = auto
    ? rowTimeForNewRow({
        now: new Date(),
        sheetDate: sheet?.sheetDate,
        time: input.time,
        timeMinutes: input.timeMinutes,
      })
    : {
        time: input.time,
        timeMinutes: input.timeMinutes,
        stamped: false,
      };
  // A row always gets a concrete rowDate at creation, even when the caller
  // doesn't supply one — derived from the sheet's picker date (sheetDate),
  // never left to be inferred later from createdAt, which is just when this DB
  // row happened to be inserted and can differ from the sheet's actual calendar
  // date (e.g. a sheet backfilled for a past/future date). Legacy sheets with no
  // sheetDate yet are the only case this still leaves null.
  let rowDate = input.rowDate;
  if (!rowDate) {
    if (sheet?.sheetDate) {
      rowDate = addDaysISO(sheet.sheetDate, input.dayOffset ?? 0);
    }
  }
  const id = await createSheetRow({
    sheetId: input.sheetId,
    rowNumber,
    time: stamp.time,
    timeMinutes: stamp.timeMinutes,
    dayOffset: input.dayOffset ?? 0,
    rowDate,
    observation: fill.observation,
    isLocked: false,
  });
  // The team goes on the row as if each CIN had been added by hand: only
  // registered CINs (the same check as member.add), in the order given, each
  // with its own audit entry.
  let teamAdded = 0;
  if (fill.members.length) {
    const registered = new Set(
      (await getAllUsers()).map(u => u.cin.toUpperCase())
    );
    for (const cin of fill.members) {
      if (!registered.has(cin)) continue;
      const memberId = await addRowMember({
        rowId: id,
        memberName: cin,
        sortOrder: teamAdded + 1,
      });
      teamAdded++;
      await createAuditLog({
        sheetId: input.sheetId,
        rowId: id,
        memberId,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "member_added",
        details: `CIN ${cin} added to row (${
          extra.membersNote ??
          "first row of the sheet: whole team from the roster"
        })`,
        createdAt: Date.now(),
      });
    }
  }
  const autoFilled =
    fill.filledObservation || (!extra.members && teamAdded > 0);
  const filledBits: string[] = [];
  if (autoFilled)
    filledBits.push(
      `first row of the sheet filled in automatically${
        fill.filledObservation
          ? ' with "Surveillance commenced in the vicinity of"'
          : ""
      }${teamAdded > 0 ? ` and ${teamAdded} team CIN${teamAdded === 1 ? "" : "s"}` : ""}`
    );
  if (extra.note) filledBits.push(extra.note);
  if (stamp.stamped) filledBits.push("time set to now automatically");
  await createAuditLog({
    sheetId: input.sheetId,
    rowId: id,
    userId: ctx.user.id,
    userName: ctx.user.cin ?? "Unknown",
    userCIN: ctx.user.cin ?? undefined,
    action: "row_created",
    details:
      (input.viaVoice
        ? `Row ${rowNumber} created (includes voice-transcribed text, on-device)`
        : `Row ${rowNumber} created`) +
      (filledBits.length ? ` — ${filledBits.join("; ")}` : ""),
    createdAt: Date.now(),
  });
  // See insertTravelledViaRow — a row created with "continued via:" already in
  // its text (e.g. via the "Vehicle departing" RS Quick Entry chip) gets its
  // empty travelled-via row right away, same as one that gains the phrase
  // through an edit below.
  if (textHasContinuedVia(input.observation)) {
    const tvRowId = await insertTravelledViaRow({
      sheetId: input.sheetId,
      time: stamp.time ?? null,
      timeMinutes: stamp.timeMinutes ?? null,
      dayOffset: input.dayOffset ?? 0,
      rowDate: rowDate ?? null,
    });
    await createAuditLog({
      sheetId: input.sheetId,
      rowId: tvRowId,
      userId: ctx.user.id,
      userName: ctx.user.cin ?? "Unknown",
      userCIN: ctx.user.cin ?? undefined,
      action: "row_created",
      details: `Travelled-via row auto-created after row ${rowNumber}`,
      createdAt: Date.now(),
    });
  }
  return { id, rowNumber, autoFilled, timeStamped: stamp.stamped };
}

export const rowRouter = router({
  list: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      const rows = await getRowsBySheetId(input.sheetId);
      const rowIds = rows.map(r => r.id);
      const [members, certs, attachments] = await Promise.all([
        getMembersByRowIds(rowIds),
        getCertificationsByRowIds(rowIds),
        getAttachmentsByRowIds(rowIds),
      ]);
      return rows.map(row => ({
        ...row,
        members: members.filter(m => m.rowId === row.id),
        certifications: certs.filter(c => c.rowId === row.id && c.isActive),
        attachments: attachments.filter(a => a.rowId === row.id),
      }));
    }),

  // Quick-insert chips (person/vehicle/address/business) mined from this
  // sheet's own observations so far — see getSheetEntityChips.
  entityChips: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      return getSheetEntityChips(input.sheetId);
    }),

  // Vehicles that departed somewhere on this sheet and haven't since
  // arrived anywhere — surfaced in RS Quick Entry as an "arrived at" chip
  // so the officer doesn't have to retype the occupant description.
  // Scoped to this sheet only, not the whole operation — see
  // getPendingVehicleDepartures.
  pendingVehicleDepartures: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      return getPendingVehicleDepartures(input.sheetId);
    }),

  // Vehicles that arrived somewhere on this sheet and haven't since
  // departed again — the mirror of pendingVehicleDepartures, for the
  // "Vehicle departing" chip. See getPendingVehicleArrivals.
  pendingVehicleArrivals: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      return getPendingVehicleArrivals(input.sheetId);
    }),

  // Locations someone walked into on foot on this sheet and hasn't since
  // walked back out of — the "Walked out" chip's source, so the officer
  // doesn't have to retype the route on foot back to the vehicle. See
  // getPendingWalkIns.
  pendingWalkIns: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      return getPendingWalkIns(input.sheetId);
    }),

  // Has the surveillance ended — every team member ceased, nobody
  // commenced since. See shared/surveillanceState.ts.
  surveillanceState: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      return getSurveillanceState(input.sheetId);
    }),

  // People who left a location saying where they were going and haven't
  // been logged entering it yet — the "Entered" chip's source. See
  // getPendingHeadingTo.
  pendingHeadingTo: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      return getPendingHeadingTo(input.sheetId);
    }),

  // People who walked to / got into a vehicle and haven't left it. See
  // getPendingPlacements.
  pendingPlacements: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      return getPendingPlacements(input.sheetId);
    }),

  // The pending lists above, read with text still being typed (not
  // saved) as the newest row — so the continuity cards follow each sentence
  // as it is written. See getPendingContinuityWithDraft.
  pendingWithDraft: protectedProcedure
    .input(
      z.object({
        sheetId: z.number(),
        draft: z.string().max(20000),
        excludeRowId: z.number().nullable().optional(),
      })
    )
    .query(async ({ input }) => {
      return getPendingContinuityWithDraft(
        input.sheetId,
        input.draft,
        input.excludeRowId
      );
    }),

  // Whether an address has already been mentioned (in its full bracketed
  // form) somewhere in this sheet — see isAddressAlreadyMentioned. Used by
  // the vehicle-arriving chip to decide full vs short form, following the
  // same first-mention rule as the rest of the app.
  addressMentioned: protectedProcedure
    .input(z.object({ sheetId: z.number(), shortAddress: z.string() }))
    .query(async ({ input }) => {
      return {
        mentioned: await isAddressAlreadyMentioned(
          input.sheetId,
          input.shortAddress
        ),
      };
    }),

  // Detects a vehicle-presence row ("parked and unattended...") with no
  // location entity of its own, and — if this sheet has an established
  // location to offer back (a "Surveillance commenced" row, or an
  // earlier row's location) — returns the suggestion so the client can
  // confirm with the officer before saving. See
  // findMissingLocationSuggestion for why this matters beyond readability.
  checkMissingLocation: protectedProcedure
    .input(
      z.object({
        sheetId: z.number(),
        observation: z.string(),
        excludeRowId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      return findMissingLocationSuggestion(
        input.sheetId,
        input.observation,
        input.excludeRowId
      );
    }),

  // Detects a vehicle with a real registration that might be the same
  // vehicle as an earlier vague sighting on this sheet ("Vehicle White
  // Hyundai" — no rego observed). Confirming merges the two via the same
  // entityAliases mechanism the Merge Entities tool uses (see
  // intelligence.mergeEntities) — the running sheet text itself is never
  // touched, only how the Intelligence folder links the two sightings.
  checkVagueVehicleMatch: protectedProcedure
    .input(
      z.object({
        sheetId: z.number(),
        observation: z.string(),
        excludeRowId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      return findVagueVehicleMatch(
        input.sheetId,
        input.observation,
        input.excludeRowId
      );
    }),

  create: protectedProcedure
    .input(createRowInput)
    .mutation(async ({ input, ctx }) => createRowFor(ctx, input)),

  // The ceased row — the mirror of the first row. One tap writes "Surveillance
  // ceased in the vicinity of [place]" with the current time and every CIN that
  // has not already ceased (shared/ceaseRow.ts). The place is where the sheet
  // last logged the target, sent by the screen (it holds the Target Logger's
  // lists); left blank when it can't be told, for the officer to finish.
  cease: protectedProcedure
    .input(
      z.object({
        sheetId: z.number(),
        place: z.string().max(300).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await guardActiveSheet(input.sheetId);
      const rows = await getRowsBySheetId(input.sheetId);
      if (rows.length === 0)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nothing to cease yet: this sheet has no rows.",
        });
      const state = await getSurveillanceState(input.sheetId);
      const sheet = await getRunningSheetById(input.sheetId);
      const members = ceaseMembers(state.stillOn, sheet?.sheetCins);
      if (state.ended || members.length === 0)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Surveillance has already ceased on this sheet.",
        });
      const text = ceaseRowText(input.place);
      const created = await createRowFor(
        ctx,
        { sheetId: input.sheetId, observation: text.observation },
        {
          members,
          membersNote: "ceased row: everyone still on",
          note: "Surveillance ceased row added with one tap",
        }
      );
      return { ...created, complete: text.complete };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        time: z.string().optional(),
        timeMinutes: z.number().optional(),
        dayOffset: z.number().optional(),
        rowDate: z.string().optional(),
        observation: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const row = await getRowById(input.id);
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
      await guardActiveSheet(row.sheetId);
      if (row.isLocked)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Row is locked. Uncertify to edit.",
        });
      const { id, ...data } = input;
      // See insertTravelledViaRow — only fires the FIRST time "continued
      // via:" appears in this row's text, not on every subsequent save of
      // an already-flagged row (which would otherwise insert a fresh
      // empty row on every edit).
      const gainsContinuedVia =
        data.observation !== undefined &&
        !textHasContinuedVia(row.observation) &&
        textHasContinuedVia(data.observation);
      await updateSheetRow(id, data);
      await createAuditLog({
        sheetId: row.sheetId,
        rowId: id,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "row_updated",
        details: `Row updated`,
        createdAt: Date.now(),
      });
      if (gainsContinuedVia) {
        const tvRowId = await insertTravelledViaRow({
          sheetId: row.sheetId,
          time: data.time ?? row.time ?? null,
          timeMinutes: data.timeMinutes ?? row.timeMinutes ?? null,
          dayOffset: data.dayOffset ?? row.dayOffset ?? 0,
          rowDate: data.rowDate ?? row.rowDate ?? null,
        });
        await createAuditLog({
          sheetId: row.sheetId,
          rowId: tvRowId,
          userId: ctx.user.id,
          userName: ctx.user.cin ?? "Unknown",
          userCIN: ctx.user.cin ?? undefined,
          action: "row_created",
          details: `Travelled-via row auto-created after row ${row.rowNumber}`,
          createdAt: Date.now(),
        });
      }
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const row = await getRowById(input.id);
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "Row not found." });
      await guardActiveSheet(row.sheetId);
      if (row.isLocked)
        throw new TRPCError({ code: "FORBIDDEN", message: "Row is locked." });
      await deleteSheetRow(input.id);
      await createAuditLog({
        sheetId: row.sheetId,
        rowId: input.id,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "row_deleted",
        details: `Row deleted`,
        createdAt: Date.now(),
      });
      return { success: true };
    }),
});
