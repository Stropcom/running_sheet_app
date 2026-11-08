import { eq } from "drizzle-orm";

import { offlineActionKeys } from "../../drizzle/schema";

import { getDb } from "./core";

/**
 * Makes a record at most once for an offline action.
 *
 * The phone gives each create an id (`clientActionId`). The first call claims
 * it, makes the record and notes its id; a replay of the same action (a reply
 * that was lost, a second tab) gets back `{ id }` of the record already made.
 * Without an id the record is just made, as before. A replay returns the id
 * only — the offline sync reads nothing else.
 *
 * Two copies arriving together: only one can claim the key; the other is told
 * to try again shortly, by which time the first has finished.
 */
export async function runOnce<T extends { id: number }>(
  userId: number,
  clientActionId: string | undefined,
  kind: string,
  make: () => Promise<T>
): Promise<T> {
  if (!clientActionId) return make();
  const db = await getDb();
  if (!db) return make();
  const actionKey = `${userId}:${clientActionId}`.slice(0, 120);

  const [claim] = await db
    .insert(offlineActionKeys)
    .ignore()
    .values({ actionKey, kind, resultId: 0, createdAt: Date.now() });
  const claimed = ((claim as { affectedRows?: number }).affectedRows ?? 0) > 0;

  if (!claimed) {
    const [seen] = await db
      .select()
      .from(offlineActionKeys)
      .where(eq(offlineActionKeys.actionKey, actionKey))
      .limit(1);
    if (seen && seen.resultId > 0) return { id: seen.resultId } as T;
    throw new Error("This action is already being sent. Try again shortly.");
  }

  try {
    const made = await make();
    await db
      .update(offlineActionKeys)
      .set({ resultId: made.id })
      .where(eq(offlineActionKeys.actionKey, actionKey));
    return made;
  } catch (err) {
    // Nothing was made: free the key so a retry can try again.
    await db
      .delete(offlineActionKeys)
      .where(eq(offlineActionKeys.actionKey, actionKey));
    throw err;
  }
}
