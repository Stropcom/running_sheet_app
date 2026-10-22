import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createAuditLog,
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
    .input(
      z.object({
        sheetId: z.number(),
        time: z.string().optional(),
        timeMinutes: z.number().optional(),
        dayOffset: z.number().optional(),
        rowDate: z.string().optional(),
        observation: z.string().optional(),
        // Set when any of this row's observation text came from the
        // on-device voice transcription feature (RS Quick Entry's mic
        // button) rather than typing/chips alone — recorded in the
        // row_created audit log entry below as an evidentiary trail per
        // CLAUDE.md's audit trail convention, since this is a legal
        // running-sheet record. A whole-row flag, not per-sentence: text
        // can mix typed and voice-inserted content in one submission.
        viaVoice: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await guardActiveSheet(input.sheetId);
      const existingRows = await getRowsBySheetId(input.sheetId);
      const rowNumber = existingRows.length + 1;
      // A row always gets a concrete rowDate at creation, even when the
      // caller doesn't supply one — derived from the sheet's picker date
      // (sheetDate), never left to be inferred later from createdAt, which
      // is just when this DB row happened to be inserted and can differ
      // from the sheet's actual calendar date (e.g. a sheet backfilled for
      // a past/future date). Legacy sheets with no sheetDate yet are the
      // only case this still leaves null.
      let rowDate = input.rowDate;
      if (!rowDate) {
        const sheet = await getRunningSheetById(input.sheetId);
        if (sheet?.sheetDate) {
          rowDate = addDaysISO(sheet.sheetDate, input.dayOffset ?? 0);
        }
      }
      const id = await createSheetRow({
        sheetId: input.sheetId,
        rowNumber,
        time: input.time,
        timeMinutes: input.timeMinutes,
        dayOffset: input.dayOffset ?? 0,
        rowDate,
        observation: input.observation,
        isLocked: false,
      });
      await createAuditLog({
        sheetId: input.sheetId,
        rowId: id,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? undefined,
        action: "row_created",
        details: input.viaVoice
          ? `Row ${rowNumber} created (includes voice-transcribed text, on-device)`
          : `Row ${rowNumber} created`,
        createdAt: Date.now(),
      });
      // See insertTravelledViaRow — a row created with "continued via:"
      // already in its text (e.g. via the "Vehicle departing" RS Quick
      // Entry chip) gets its empty travelled-via row right away, same as
      // one that gains the phrase through an edit below.
      if (textHasContinuedVia(input.observation)) {
        const tvRowId = await insertTravelledViaRow({
          sheetId: input.sheetId,
          time: input.time ?? null,
          timeMinutes: input.timeMinutes ?? null,
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
      return { id, rowNumber };
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
