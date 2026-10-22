import { and, desc, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";

import { notifications } from "../../drizzle/schema";

import { getDb } from "./core";

// ─── In-app Notifications ─────────────────────────────────────────────────────
// See schema.ts comment on the notifications table for why this exists
// instead of browser push.
export async function createNotificationsForUsers(
  userIds: number[],
  params: {
    title: string;
    body: string;
    url?: string;
    sourceModule?: string;
    meta?: string;
  }
) {
  const db = await getDb();
  if (!db || userIds.length === 0) return;
  await db.insert(notifications).values(
    userIds.map(userId => ({
      userId,
      title: params.title,
      body: params.body,
      url: params.url,
      sourceModule: params.sourceModule,
      meta: params.meta,
    }))
  );
}

/**
 * Most recent still-unread notification for this user/sourceModule created
 * within the last `sinceMs` — used to coalesce repeated events (e.g. CTO
 * Roster shift edits) into one bumped row instead of a new notification per
 * event. See upsertRosterShiftNotification in ctoRoster.ts.
 */
export async function findRecentUnreadNotification(
  userId: number,
  sourceModule: string,
  sinceMs: number
) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.sourceModule, sourceModule),
        isNull(notifications.readAt),
        gt(notifications.createdAt, new Date(Date.now() - sinceMs))
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  return rows[0];
}

/** Overwrite an existing notification's content and bump createdAt to now, so it resurfaces as fresh in the bell. */
export async function updateNotificationContent(
  id: number,
  params: { title: string; body: string; meta?: string }
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({
      title: params.title,
      body: params.body,
      meta: params.meta,
      createdAt: new Date(),
    })
    .where(eq(notifications.id, id));
}

export async function getNotificationsForUser(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadNotificationCount(
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  // Scoped to userId so one user can't mark another's notification read.
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function deleteNotification(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  // Scoped to userId so one user can't delete another's notification.
  await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function deleteReadNotificationsForUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(notifications)
    .where(
      and(eq(notifications.userId, userId), isNotNull(notifications.readAt))
    );
}

const NOTIFICATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Opportunistic purge (no cron — see references/periodic-updates.md),
// triggered on read like purgeExpiredRecycleBinItems, so the table doesn't
// grow forever even if nobody manually clears their bell.
export async function purgeExpiredNotifications() {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(notifications)
    .where(
      lt(
        notifications.createdAt,
        new Date(Date.now() - NOTIFICATION_MAX_AGE_MS)
      )
    );
}
