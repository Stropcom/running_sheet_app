import { z } from "zod";
import { rosterCommandForWrite } from "../rosterContext";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAllUsers,
  createNotificationsForUsers,
  visitorUserIdsOf,
} from "../db";
import { notifyRecipientIds } from "@shared/opManagerWeeks";

import {
  getOpManagerPriorityBoard,
  saveOpManagerPriorityBoard,
  getOpManagerTaskingCalendar,
  saveOpManagerTaskingCell,
  getOpManagerSupervisorContacts,
  saveOpManagerSupervisorContacts,
  getPostedWeeks,
  isWeekPosted,
  markWeekPosted,
  listAllOpManagerWeeks,
  copyOpManagerWeek,
  deleteOpManagerWeek,
  findOpManagerCopySourceWeek,
} from "../db";

import { certifierOrAdminProcedure, adminProcedure } from "./_helpers";

export const opManagerRouter = router({
  listUsers: certifierOrAdminProcedure.query(async () => {
    const users = await getAllUsers();
    // Deliberately everyone: SMEAC / UCO briefings use this list for their
    // recipients, which can cross Commands.
    return users
      .filter(u => !u.archivedAt)
      .map(u => ({
        id: u.id,
        name: u.name,
        cin: u.cin ?? null,
        phone: u.phone ?? null,
      }));
  }),

  getPriorityBoard: certifierOrAdminProcedure
    .input(z.object({ weekStart: z.string() }))
    .query(async ({ input }) => {
      return getOpManagerPriorityBoard(input.weekStart);
    }),

  savePriorityBoard: certifierOrAdminProcedure
    .input(
      z.object({
        weekStart: z.string(),
        rows: z.array(
          z.object({
            id: z.number().optional(),
            category: z.string(),
            priority: z.number(),
            operationId: z.number().nullable().optional(),
            operationName: z.string().nullable().optional(),
            team: z.string().nullable().optional(),
            requestType: z.string().nullable().optional(),
            sortOrder: z.number(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      await saveOpManagerPriorityBoard(input.weekStart, input.rows);
      return { ok: true };
    }),

  getTaskingCalendar: certifierOrAdminProcedure
    .input(z.object({ weekStart: z.string() }))
    .query(async ({ input }) => {
      return getOpManagerTaskingCalendar(input.weekStart);
    }),

  saveTaskingCell: certifierOrAdminProcedure
    .input(
      z.object({
        weekStart: z.string(),
        dayIndex: z.number().min(0).max(6),
        teamRow: z.string(),
        shiftTime: z.string().nullable().optional(),
        primaryTask: z.string().nullable().optional(),
        secondaryTask: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { weekStart, dayIndex, teamRow, ...data } = input;
      await saveOpManagerTaskingCell(weekStart, dayIndex, teamRow, data);
      return { ok: true };
    }),

  getSupervisorContacts: certifierOrAdminProcedure
    .input(z.object({ weekStart: z.string() }))
    .query(async ({ input }) => {
      return getOpManagerSupervisorContacts(input.weekStart);
    }),

  saveSupervisorContacts: certifierOrAdminProcedure
    .input(
      z.object({
        weekStart: z.string(),
        contacts: z.array(
          z.object({
            id: z.number().optional(),
            role: z.string(),
            userId: z.number().nullable().optional(),
            customName: z.string().nullable().optional(),
            phone: z.string().nullable().optional(),
            sortOrder: z.number(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      await saveOpManagerSupervisorContacts(input.weekStart, input.contacts);
      return { ok: true };
    }),

  // ── All weeks folder list ──────────────────────────────────────────────────
  listAllWeeks: protectedProcedure.query(async () => {
    return listAllOpManagerWeeks();
  }),

  /** The most recent week before this one that has contacts or a priority
   * board — what "Copy Last Week" copies from (null when none). */
  copySourceWeek: certifierOrAdminProcedure
    .input(z.object({ beforeWeekStart: z.string() }))
    .query(async ({ input }) => {
      return findOpManagerCopySourceWeek(input.beforeWeekStart);
    }),

  /** Deletes a whole weekly tasking into the Recycle Bin (contacts, priority
   * board, calendar and posted marker; 7 days, then purged). Admin only;
   * limited to the caller's Command. */
  deleteWeek: adminProcedure
    .input(z.object({ weekStart: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return deleteOpManagerWeek(input.weekStart, ctx.user.cin ?? null);
    }),

  /** Who a posted tasking can be sent to: this Command's people and the
   * visitors it currently hosts — not everyone in the system (listUsers). */
  notifyRecipients: adminProcedure.query(async () => {
    const command = rosterCommandForWrite();
    const [users, hosted] = await Promise.all([
      getAllUsers(),
      visitorUserIdsOf(command),
    ]);
    const allowed = notifyRecipientIds(users, command, hosted);
    return users
      .filter(u => allowed.has(u.id))
      .map(u => ({ id: u.id, name: u.name, cin: u.cin ?? null }));
  }),

  copyWeek: adminProcedure
    .input(z.object({ fromWeekStart: z.string(), toWeekStart: z.string() }))
    .mutation(async ({ input }) => {
      return copyOpManagerWeek(input.fromWeekStart, input.toWeekStart);
    }),

  // ── Posted weeks ──────────────────────────────────────────────────────────
  getPostedWeeks: protectedProcedure.query(async () => {
    return getPostedWeeks();
  }),

  isWeekPosted: protectedProcedure
    .input(z.object({ weekStart: z.string() }))
    .query(async ({ input }) => {
      return { posted: await isWeekPosted(input.weekStart) };
    }),

  postWeek: adminProcedure
    .input(
      z.object({
        weekStart: z.string(),
        userIds: z.array(z.number()).optional(), // if provided (even empty), notify only these users
      })
    )
    .mutation(async ({ ctx, input }) => {
      await markWeekPosted(input.weekStart, ctx.user.id);
      const weekLabel = new Date(
        input.weekStart + "T00:00:00Z"
      ).toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
      const title = "New CTO Tasking Posted";
      const body = `CTO Tasking for the week of ${weekLabel} has been posted.`;
      const url = "/operation-manager";
      // In-app inbox only — browser push was removed (unreliable: depends
      // on OS permissions/per-device subscriptions, broken outright on iOS
      // Safari unless installed as a home-screen PWA). See notifications
      // router / drizzle schema comment.
      // Only this Command's people and the visitors it hosts, whatever was
      // asked for (the list the screen shows is the same notifyRecipients).
      const command = rosterCommandForWrite();
      const [allUsers, hosted] = await Promise.all([
        getAllUsers(),
        visitorUserIdsOf(command),
      ]);
      const allowed = notifyRecipientIds(allUsers, command, hosted);
      // A chosen list is used as it stands (an empty one notifies nobody);
      // none chosen at all means everyone allowed.
      const targetUserIds = input.userIds
        ? input.userIds.filter(id => allowed.has(id))
        : Array.from(allowed);
      await createNotificationsForUsers(targetUserIds, {
        title,
        body,
        url,
        sourceModule: "opManager",
      }).catch(err =>
        console.warn(
          "[Notifications] Failed to create in-app notifications:",
          err
        )
      );
      return { ok: true, notified: targetUserIds.length };
    }),
});
