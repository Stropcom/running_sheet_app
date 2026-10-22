import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { CIN_LINK_CATEGORY } from "@shared/attachmentLinking";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAllUsers,
  getMembersByRowIds,
  getRowsBySheetId,
  getRunningSheetById,
  getAttachmentsByRowIds,
} from "../db";

export const statementRouter = router({
  /**
   * Returns the data needed to generate statements for the given sheets.
   * For each CIN found in the selected sheets, returns surveillance dates,
   * author dates, image dates, and an optional exclusion reason.
   *
   * Exclusion rules (CIN gets no statement if ALL its row appearances are excluded):
   *   1. "Surveillance Commenced" / "Surveillance Ceased" rows — not real observations
   *   2. "Travelled Via" rows — observation ends in "whereat" AND the immediately
   *      preceding row (by sort order) contains "continued via:" in its observation
   */
  previewData: protectedProcedure
    .input(z.object({ sheetIds: z.array(z.number()).min(1) }))
    .query(async ({ input }) => {
      const sheets = await Promise.all(
        input.sheetIds.map(id => getRunningSheetById(id))
      );
      const validSheets = sheets.filter(Boolean) as NonNullable<
        Awaited<ReturnType<typeof getRunningSheetById>>
      >[];

      // Build per-CIN data, tracking qualifying vs excluded rows
      const cinMap = new Map<
        string,
        {
          surveillanceDates: number[];
          authorDates: number[];
          imageDates: number[];
          hasQualifyingRow: boolean;
          exclusionReasons: Set<string>;
        }
      >();

      for (const sheet of validSheets) {
        const sheetDate = sheet.sheetDate
          ? new Date(`${sheet.sheetDate}T00:00:00+08:00`).getTime()
          : new Date(sheet.createdAt).setHours(0, 0, 0, 0);
        let roster: {
          cin: string;
          hasImages?: boolean;
          isAuthor?: boolean;
        }[] = [];
        try {
          roster = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : [];
        } catch {
          roster = [];
        }

        // Fetch rows for this sheet to apply exclusion rules
        const rows = await getRowsBySheetId(sheet.id);
        const rowIds = rows.map(r => r.id);
        const members =
          rowIds.length > 0 ? await getMembersByRowIds(rowIds) : [];

        // Build sorted row list for "previous row" lookups
        const sortedRows = [...rows]; // already sorted by timeMinutes/rowNumber from db

        // Determine which rows are "excluded" observation types
        const excludedRowIds = new Set<number>();
        const excludedRowReasons = new Map<number, string>();

        for (let i = 0; i < sortedRows.length; i++) {
          const row = sortedRows[i];
          const obs = (row.observation ?? "").trim();

          // Rule 1: Surveillance Commenced / Surveillance Ceased
          const isSurveillanceMarker =
            /^surveillance commenced/i.test(obs) ||
            /^surveillance ceased/i.test(obs);
          if (isSurveillanceMarker) {
            excludedRowIds.add(row.id);
            excludedRowReasons.set(row.id, "surveillance-marker");
            continue;
          }

          // Rule 2: Travelled Via — ends in "whereat" (optionally followed by : or ;)
          //         AND the previous row contains "continued via" (followed by : or ;)
          const endsInWhereat = /whereat[;:]?\s*$/i.test(obs);
          if (endsInWhereat && i > 0) {
            const prevObs = (sortedRows[i - 1].observation ?? "").toLowerCase();
            if (/continued via[;:]/.test(prevObs)) {
              excludedRowIds.add(row.id);
              excludedRowReasons.set(row.id, "travelled-via");
            }
          }
        }

        // For each roster CIN, check if they appear in any qualifying row
        for (const entry of roster) {
          const cinUpper = entry.cin.toUpperCase();
          if (!cinMap.has(cinUpper)) {
            cinMap.set(cinUpper, {
              surveillanceDates: [],
              authorDates: [],
              imageDates: [],
              hasQualifyingRow: false,
              exclusionReasons: new Set(),
            });
          }
          const data = cinMap.get(cinUpper)!;
          data.surveillanceDates.push(sheetDate);
          if (entry.isAuthor) data.authorDates.push(sheetDate);
          if (entry.hasImages) data.imageDates.push(sheetDate);

          // Check if this CIN appears in any qualifying (non-excluded) row
          const cinRowIds = members
            .filter(m => m.memberName.toUpperCase() === cinUpper)
            .map(m => m.rowId);

          for (const rowId of cinRowIds) {
            if (!excludedRowIds.has(rowId)) {
              data.hasQualifyingRow = true;
            } else {
              const reason = excludedRowReasons.get(rowId);
              if (reason) data.exclusionReasons.add(reason);
            }
          }

          // If CIN has no row appearances at all in this sheet, still mark as qualifying
          // (they're on the roster — the sheet itself counts as a surveillance date)
          if (cinRowIds.length === 0) {
            data.hasQualifyingRow = true;
          }
        }
      }

      // Resolve CIN → name from users table
      const allUsers = await getAllUsers();
      const userByCin = new Map(allUsers.map(u => [u.cin.toUpperCase(), u]));

      return Array.from(cinMap.entries())
        .map(([cin, data]) => {
          const user = userByCin.get(cin);
          // Build exclusion reason string if CIN has no qualifying rows
          let excludedReason: string | null = null;
          if (!data.hasQualifyingRow) {
            const reasons = Array.from(data.exclusionReasons);
            if (
              reasons.includes("surveillance-marker") &&
              reasons.includes("travelled-via")
            ) {
              excludedReason =
                "Only appears in Surveillance Commenced/Ceased and Travelled Via rows";
            } else if (reasons.includes("surveillance-marker")) {
              excludedReason =
                "Only appears in Surveillance Commenced/Ceased rows";
            } else if (reasons.includes("travelled-via")) {
              excludedReason = "Only appears in Travelled Via rows";
            } else {
              excludedReason = "No qualifying observation rows found";
            }
          }
          return {
            cin,
            name: user?.name ?? cin,
            surveillanceDates: data.surveillanceDates,
            authorDates: data.authorDates,
            imageDates: data.imageDates,
            excludedReason,
          };
        })
        .sort((a, b) => a.cin.localeCompare(b.cin));
    }),

  /**
   * Generates a Base64-encoded .docx for the given CIN across the selected sheets.
   * Returns { filename, base64 } for each requested CIN.
   * CINs that only appear in excluded rows (Surveillance Commenced/Ceased or Travelled Via)
   * are skipped and returned in the `skipped` array with a reason.
   */
  generate: protectedProcedure
    .input(
      z.object({
        sheetIds: z.array(z.number()).min(1),
        cins: z.array(z.string()).min(1),
        operationName: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { generateStatementDocx } = await import("../statementGenerator");
      const JSZip = (await import("jszip")).default;

      const sheets = await Promise.all(
        input.sheetIds.map(id => getRunningSheetById(id))
      );
      const validSheets = sheets.filter(Boolean) as NonNullable<
        Awaited<ReturnType<typeof getRunningSheetById>>
      >[];

      const allUsers = await getAllUsers();
      const userByCin = new Map(allUsers.map(u => [u.cin.toUpperCase(), u]));

      // Build per-CIN data from sheets, applying exclusion rules
      // surveillanceDays: one entry per sheet, carrying date, isAuthor flag, and image times for that CIN
      const cinMap = new Map<
        string,
        {
          surveillanceDays: {
            date: number;
            isAuthor: boolean;
            imageTimes: string[];
          }[];
          hasQualifyingRow: boolean;
          exclusionReasons: Set<string>;
        }
      >();

      // Photo/video observation keyword pattern (matches PT shortcut expansion and variants)
      const PHOTO_PATTERN = /photograph|photo\/s|pt\b|video|image/i;

      for (const sheet of validSheets) {
        // Read the sheet's picker date directly (falls back to createdAt
        // only for legacy sheets predating sheetDate) — not the title,
        // which is only ever a rendering of this same field.
        let sheetDate: number;
        if (sheet.sheetDate) {
          const [y, mo, da] = sheet.sheetDate.split("-").map(Number);
          sheetDate = Date.UTC(y, mo - 1, da);
        } else {
          const d = new Date(
            sheet.createdAt instanceof Date
              ? sheet.createdAt.getTime()
              : sheet.createdAt
          );
          sheetDate = Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate()
          );
        }

        let roster: {
          cin: string;
          hasImages?: boolean;
          isAuthor?: boolean;
        }[] = [];
        try {
          roster = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : [];
        } catch {
          roster = [];
        }

        const rows = await getRowsBySheetId(sheet.id);
        const rowIds = rows.map(r => r.id);
        const members =
          rowIds.length > 0 ? await getMembersByRowIds(rowIds) : [];
        const sortedRows = [...rows];

        const excludedRowIds = new Set<number>();
        const excludedRowReasons = new Map<number, string>();

        for (let i = 0; i < sortedRows.length; i++) {
          const row = sortedRows[i];
          const obs = (row.observation ?? "").trim();
          const isSurveillanceMarker =
            /^surveillance commenced/i.test(obs) ||
            /^surveillance ceased/i.test(obs);
          if (isSurveillanceMarker) {
            excludedRowIds.add(row.id);
            excludedRowReasons.set(row.id, "surveillance-marker");
            continue;
          }
          const endsInWhereat = /whereat[;:]?\s*$/i.test(obs);
          if (endsInWhereat && i > 0) {
            const prevObs = (sortedRows[i - 1].observation ?? "").toLowerCase();
            if (/continued via[;:]/.test(prevObs)) {
              excludedRowIds.add(row.id);
              excludedRowReasons.set(row.id, "travelled-via");
            }
          }
        }

        // Which CIN actually took a row's photo/s is decided by the
        // attachment→CIN links built at upload time (single-member rows
        // auto-link) or confirmed by an officer via LinkAttachmentDialog
        // (multi-member rows) — see shared/attachmentLinking.ts. A
        // statement must only ever claim an officer took images they're
        // actually confirmed for, not every CIN who happened to be on the
        // row. Rows with attachments still pending a CIN link get no
        // credit yet (nobody's statement should assert it ahead of that
        // confirmation); rows with no attachments at all (legacy text-only
        // entries predating the upload feature) fall back to crediting
        // every CIN on the row, as before.
        const rowIdToConfirmedCins = new Map<number, Set<string>>();
        const rowIdsWithAttachments = new Set<number>();
        if (rowIds.length > 0) {
          const attachments = await getAttachmentsByRowIds(rowIds);
          for (const att of attachments) {
            if (att.rowId == null) continue;
            rowIdsWithAttachments.add(att.rowId);
            const cins = (att.linkedEntities ?? [])
              .filter(e => e.category === CIN_LINK_CATEGORY)
              .map(e => e.label.toUpperCase());
            if (cins.length === 0) continue;
            const set = rowIdToConfirmedCins.get(att.rowId) ?? new Set();
            for (const c of cins) set.add(c);
            rowIdToConfirmedCins.set(att.rowId, set);
          }
        }

        // Build a map of rowId → { time, cins } for photo rows. cins ===
        // null means "credit every CIN on the row" (legacy fallback).
        const photoRowCredit = new Map<
          number,
          { time: string; cins: Set<string> | null }
        >();
        for (const row of sortedRows) {
          const obs = (row.observation ?? "").trim();
          if (!(PHOTO_PATTERN.test(obs) && row.time)) continue;
          if (rowIdsWithAttachments.has(row.id)) {
            const confirmed = rowIdToConfirmedCins.get(row.id);
            if (confirmed && confirmed.size > 0) {
              photoRowCredit.set(row.id, { time: row.time, cins: confirmed });
            }
            // else: attachments exist but aren't linked to a CIN yet — no
            // credit until that's resolved.
          } else {
            photoRowCredit.set(row.id, { time: row.time, cins: null });
          }
        }

        for (const entry of roster) {
          const cinUpper = entry.cin.toUpperCase();
          if (!cinMap.has(cinUpper)) {
            cinMap.set(cinUpper, {
              surveillanceDays: [],
              hasQualifyingRow: false,
              exclusionReasons: new Set(),
            });
          }
          const data = cinMap.get(cinUpper)!;

          const cinRowIds = members
            .filter(m => m.memberName.toUpperCase() === cinUpper)
            .map(m => m.rowId);

          // Collect image times: rows where this CIN is a member AND is
          // either the confirmed photo-taker (linked rows) or the row has
          // no attachment records at all (legacy fallback — see above).
          const imageTimes: string[] = [];
          for (const rowId of cinRowIds) {
            const credit = photoRowCredit.get(rowId);
            if (!credit) continue;
            if (credit.cins === null || credit.cins.has(cinUpper)) {
              imageTimes.push(credit.time);
            }
          }

          data.surveillanceDays.push({
            date: sheetDate,
            isAuthor: !!entry.isAuthor,
            imageTimes,
          });

          for (const rowId of cinRowIds) {
            if (!excludedRowIds.has(rowId)) {
              data.hasQualifyingRow = true;
            } else {
              const reason = excludedRowReasons.get(rowId);
              if (reason) data.exclusionReasons.add(reason);
            }
          }
          if (cinRowIds.length === 0) {
            data.hasQualifyingRow = true;
          }
        }
      }

      const certifierUser = userByCin.get(ctx.user.cin?.toUpperCase() ?? "");
      const certifierCin = ctx.user.cin ?? "UNKNOWN";
      const certifierName = certifierUser?.name ?? ctx.user.name ?? "Unknown";
      const producedAt = Date.now();

      const requestedCins = input.cins.map(c => c.toUpperCase());
      const results: { cin: string; filename: string; base64: string }[] = [];
      const skipped: { cin: string; reason: string }[] = [];

      for (const cin of requestedCins) {
        const data = cinMap.get(cin);
        if (!data) continue;

        // Skip CINs with no qualifying rows
        if (!data.hasQualifyingRow) {
          const reasons = Array.from(data.exclusionReasons);
          let reason = "No qualifying observation rows found";
          if (
            reasons.includes("surveillance-marker") &&
            reasons.includes("travelled-via")
          ) {
            reason =
              "Only appears in Surveillance Commenced/Ceased and Travelled Via rows";
          } else if (reasons.includes("surveillance-marker")) {
            reason = "Only appears in Surveillance Commenced/Ceased rows";
          } else if (reasons.includes("travelled-via")) {
            reason = "Only appears in Travelled Via rows";
          }
          skipped.push({ cin, reason });
          continue;
        }

        const user = userByCin.get(cin);
        const name = user?.name ?? cin;
        const buf = await generateStatementDocx({
          cin,
          name,
          operationName: input.operationName,
          surveillanceDays: data.surveillanceDays,
          certifierCin,
          certifierName,
          producedAt,
        });
        const filename = `Statement_${cin}_${input.operationName.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
        results.push({ cin, filename, base64: buf.toString("base64") });
      }

      if (results.length === 0 && skipped.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No matching CINs found in the selected sheets.",
        });
      }

      // If multiple, also produce a ZIP
      let zipBase64: string | null = null;
      if (results.length > 1) {
        const zip = new JSZip();
        for (const r of results) {
          zip.file(r.filename, Buffer.from(r.base64, "base64"));
        }
        const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
        zipBase64 = zipBuf.toString("base64");
      }

      return {
        results,
        skipped,
        zipBase64,
        operationName: input.operationName,
        producedAt,
      };
    }),
});
