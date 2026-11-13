// Part of the target queries (server/db/targets.ts): the Shortcuts page's expansions and each target's own shortcuts.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { eq, sql } from "drizzle-orm";
import { initialShortcutOrder } from "../../../shared/rsChips";
import {
  runningSheets,
  shortcuts,
  InsertShortcut,
  targetShortcuts,
  InsertTargetShortcut,
} from "../../../drizzle/schema";
import { getDb } from "../core";

// ─── Shortcuts ───────────────────────────────────────────────────────────────

export async function listShortcuts() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(shortcuts)
    .orderBy(shortcuts.sortOrder, shortcuts.trigger);
}

export async function createShortcut(
  data: Omit<InsertShortcut, "id" | "createdAt" | "updatedAt" | "sortOrder">
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // A new shortcut goes to the end of the list (and so the end of the chips).
  const [last] = await db
    .select({ max: sql<number>`COALESCE(MAX(${shortcuts.sortOrder}), 0)` })
    .from(shortcuts);
  await db
    .insert(shortcuts)
    .values({ ...data, sortOrder: Number(last?.max ?? 0) + 1 });
}

/** Save a new Shortcuts-page order. `ids` is every shortcut, first to last. */
export async function reorderShortcuts(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.transaction(async tx => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(shortcuts)
        .set({ sortOrder: i + 1 })
        .where(eq(shortcuts.id, ids[i]));
    }
  });
}

/**
 * Give every shortcut that has no place yet a position: the first time round
 * (the column was added with everything at 0) that is the order the chips used
 * to appear on the main running sheet, then the rest A to Z. A shortcut added
 * later by startup (a missing default) goes after the ones already placed.
 */
export async function ensureShortcutOrder() {
  const db = await getDb();
  if (!db) return;
  const rows = await db
    .select({
      id: shortcuts.id,
      trigger: shortcuts.trigger,
      sortOrder: shortcuts.sortOrder,
    })
    .from(shortcuts);
  const unplaced = rows.filter(r => r.sortOrder <= 0);
  if (unplaced.length === 0) return;
  const start = Math.max(0, ...rows.map(r => r.sortOrder));
  await db.transaction(async tx => {
    for (const o of initialShortcutOrder(unplaced)) {
      await tx
        .update(shortcuts)
        .set({ sortOrder: start + o.sortOrder })
        .where(eq(shortcuts.id, o.id));
    }
  });
  console.log(
    `[Shortcuts] Placed ${unplaced.length} shortcut(s) in the chip order`
  );
}

export async function updateShortcut(
  id: number,
  data: {
    trigger?: string;
    expansion?: string;
    showInRs?: boolean;
    startsRow?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(shortcuts).set(data).where(eq(shortcuts.id, id));
}

export async function deleteShortcut(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(shortcuts).where(eq(shortcuts.id, id));
}

/** Seed the default shortcuts if the table is empty. Called at server startup. */
export async function seedShortcutsIfEmpty(systemUserId: number) {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ id: shortcuts.id })
    .from(shortcuts)
    .limit(1);
  if (existing.length > 0) return;
  const defaults = [
    { trigger: "sc", expansion: "Surveillance commenced in the vicinity of" },
    { trigger: "rack", expansion: "Surveillance ceased in the vicinity of" },
    { trigger: "oos", expansion: "Out of sight" },
    { trigger: "coos", expansion: "Continued out of sight" },
    { trigger: "pt", expansion: "PHOTOGRAPH/S TAKEN" },
  ];
  for (const s of defaults) {
    await db
      .insert(shortcuts)
      .values({ ...s, createdBy: systemUserId })
      .catch(() => {
        /* ignore duplicate */
      });
  }
}

/**
 * Ensure specific default shortcuts exist — inserts each if its trigger is not already present.
 * Safe to call on every startup even when the table already has rows.
 */
export async function ensureDefaultShortcuts(systemUserId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Shortcuts] DB unavailable, skipping ensureDefaultShortcuts");
    return;
  }
  const required = [
    { trigger: "sc", expansion: "Surveillance commenced in the vicinity of" },
    { trigger: "rack", expansion: "Surveillance ceased in the vicinity of" },
    { trigger: "oos", expansion: "Out of sight" },
    { trigger: "coos", expansion: "Continued out of sight" },
    { trigger: "pt", expansion: "PHOTOGRAPH/S TAKEN" },
    { trigger: "dso", expansion: "driver and sole occupant" },
    { trigger: "d", expansion: "departed and" },
    { trigger: "ar", expansion: "arrived and" },
  ];
  const existing = await db
    .select({ trigger: shortcuts.trigger })
    .from(shortcuts);
  const existingTriggers = new Set(existing.map(s => s.trigger.toLowerCase()));
  for (const s of required) {
    if (!existingTriggers.has(s.trigger.toLowerCase())) {
      try {
        await db.insert(shortcuts).values({ ...s, createdBy: systemUserId });
        console.log(`[Shortcuts] Inserted default shortcut: ${s.trigger}`);
      } catch (err) {
        console.error(
          `[Shortcuts] Failed to insert shortcut '${s.trigger}':`,
          err
        );
      }
    }
  }
  console.log(
    `[Shortcuts] ensureDefaultShortcuts complete. Existing: [${Array.from(existingTriggers).join(", ")}]`
  );
}

// ─── Target Shortcuts ─────────────────────────────────────────────────────────

export async function getTargetShortcuts(targetId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(targetShortcuts)
    .where(eq(targetShortcuts.targetId, targetId));
}

export async function createTargetShortcut(data: InsertTargetShortcut) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(targetShortcuts).values(data);
  return { id: (result as { insertId: number }).insertId };
}

export async function updateTargetShortcut(
  id: number,
  data: Partial<Pick<InsertTargetShortcut, "trigger" | "expansion">>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(targetShortcuts).set(data).where(eq(targetShortcuts.id, id));
  return { id };
}

export async function deleteTargetShortcut(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(targetShortcuts).where(eq(targetShortcuts.id, id));
}

export async function getTargetShortcutsForSheet(sheetId: number) {
  // Returns target shortcuts for the target assigned to the given sheet
  const db = await getDb();
  if (!db) return [];
  const sheet = await db
    .select({ targetId: runningSheets.targetId })
    .from(runningSheets)
    .where(eq(runningSheets.id, sheetId))
    .limit(1);
  if (!sheet[0]?.targetId) return [];
  return db
    .select()
    .from(targetShortcuts)
    .where(eq(targetShortcuts.targetId, sheet[0].targetId));
}
