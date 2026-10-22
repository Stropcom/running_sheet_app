import { filterByOperationAccess, toAccessUser } from "../operationAccess";
import { protectedProcedure, router } from "../_core/trpc";
import { getOperations, getRunningSheets } from "../db";

export const calendarRouter = router({
  /** Return all operations and running sheets as calendar events */
  events: protectedProcedure.query(async ({ ctx }) => {
    const me = toAccessUser(ctx.user);
    const operations = await filterByOperationAccess(
      me,
      await getOperations(),
      o => o.id
    );
    const sheets = await filterByOperationAccess(
      me,
      await getRunningSheets(),
      s => s.operationId
    );
    const events: {
      id: string;
      title: string;
      start: number;
      end: number;
      type: "operation" | "sheet";
      operationId: number | null;
      sheetId: number | null;
      operationName: string | null;
    }[] = [];

    /**
     * Extract a UTC-safe day start from a title that begins with YYYYMMDD,
     * e.g. "20260702 - FOREST (OSBORNE)" → 2026-07-02T00:00:00Z.
     * Falls back to the UTC date of the createdAt timestamp so no timezone
     * shift occurs on the server (which runs in UTC). Operations have no
     * picker-set date field of their own, so this title-regex approach is
     * still the right one for them.
     */
    function dayStartFromTitleOrDate(
      title: string,
      createdAt: number | Date
    ): number {
      const m = title.match(/^(\d{4})(\d{2})(\d{2})/);
      if (m) {
        // Parse directly as UTC midnight — no timezone shift
        return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      }
      // No date prefix: use UTC date components of createdAt to avoid server-TZ shift
      const d = new Date(
        typeof createdAt === "number" ? createdAt : createdAt.getTime()
      );
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }

    /** UTC-safe day start from a YYYY-MM-DD string. */
    function dayStartFromISODate(dateISO: string): number {
      const [y, mo, da] = dateISO.split("-").map(Number);
      return Date.UTC(y, mo - 1, da);
    }

    for (const op of operations) {
      const dayStart = dayStartFromTitleOrDate(op.name, op.createdAt);
      events.push({
        id: `op-${op.id}`,
        title: op.name,
        start: dayStart,
        end: dayStart,
        type: "operation",
        operationId: op.id,
        sheetId: null,
        operationName: op.name,
      });
    }

    for (const sheet of sheets) {
      // Read the sheet's picker date directly rather than re-deriving it
      // by parsing the title (title is generated from sheetDate, so this
      // used to happen to agree, but only by coincidence of format — this
      // reads the source field). Legacy sheets predating sheetDate still
      // fall back to the title/createdAt parse.
      const dayStart = sheet.sheetDate
        ? dayStartFromISODate(sheet.sheetDate)
        : dayStartFromTitleOrDate(sheet.title, sheet.createdAt);
      const op = operations.find(o => o.id === sheet.operationId);
      events.push({
        id: `sheet-${sheet.id}`,
        title: sheet.title,
        start: dayStart,
        end: dayStart,
        type: "sheet",
        operationId: sheet.operationId ?? null,
        sheetId: sheet.id,
        operationName: op?.name ?? null,
      });
    }

    return events;
  }),
});
