// Part of the target queries (server/ctoRoster.ts): saved rosters: their teams, members and shifts.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { and, eq, inArray, desc, asc, max } from "drizzle-orm";
import { getDb } from "../db";
import {
  ctoRosterSavedRosters,
  ctoRosterSavedRosterTeams,
  ctoRosterSavedRosterMembers,
  ctoRosterSavedRosterShifts,
  CtoRosterSavedRoster,
} from "../../drizzle/schema";
import { inCommand } from "./liveRoster";

// ── Saved Rosters (named point-in-time archive/export) ─────────────────────────
// Own free-text teams/members (not CIN-linked — see schema comment): a saved
// roster is a frozen snapshot, so it must keep the display names as they were
// at save time even if the underlying RunLog user's name later changes.

export async function getAllCtoRosterSavedRosters(): Promise<
  CtoRosterSavedRoster[]
> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ctoRosterSavedRosters)
    .where(inCommand(ctoRosterSavedRosters.command))
    .orderBy(desc(ctoRosterSavedRosters.createdAt));
}

export async function getCtoRosterSavedRosterById(
  id: number
): Promise<CtoRosterSavedRoster | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(ctoRosterSavedRosters)
    .where(
      and(
        eq(ctoRosterSavedRosters.id, id),
        inCommand(ctoRosterSavedRosters.command)
      )
    );
  return rows[0];
}

export async function deleteCtoRosterSavedRoster(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(ctoRosterSavedRosterShifts)
    .where(eq(ctoRosterSavedRosterShifts.savedRosterId, id));
  await db
    .delete(ctoRosterSavedRosterMembers)
    .where(eq(ctoRosterSavedRosterMembers.savedRosterId, id));
  await db
    .delete(ctoRosterSavedRosterTeams)
    .where(eq(ctoRosterSavedRosterTeams.savedRosterId, id));
  await db
    .delete(ctoRosterSavedRosters)
    .where(eq(ctoRosterSavedRosters.id, id));
}

export async function renameCtoRosterSavedRoster(
  id: number,
  name: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterSavedRosters)
    .set({ name })
    .where(eq(ctoRosterSavedRosters.id, id));
}

export async function setCtoRosterSavedRosterTimeframe(
  id: number,
  startDate: string,
  endDate: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterSavedRosters)
    .set({ startDate, endDate })
    .where(eq(ctoRosterSavedRosters.id, id));
}

export async function getCtoRosterSavedRosterTeamsAndMembers(
  savedRosterId: number
) {
  const db = await getDb();
  if (!db) return { teams: [], members: [] };
  const [teams, members] = await Promise.all([
    db
      .select()
      .from(ctoRosterSavedRosterTeams)
      .where(eq(ctoRosterSavedRosterTeams.savedRosterId, savedRosterId))
      .orderBy(asc(ctoRosterSavedRosterTeams.sortOrder)),
    db
      .select()
      .from(ctoRosterSavedRosterMembers)
      .where(eq(ctoRosterSavedRosterMembers.savedRosterId, savedRosterId))
      .orderBy(asc(ctoRosterSavedRosterMembers.sortOrder)),
  ]);
  return { teams, members };
}

export async function getCtoRosterSavedRosterShifts(savedRosterId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(ctoRosterSavedRosterShifts)
    .where(eq(ctoRosterSavedRosterShifts.savedRosterId, savedRosterId));
}

export async function upsertCtoRosterSavedRosterShift(
  savedRosterId: number,
  memberId: number,
  shiftDate: string,
  shiftCode: string,
  updatedBy?: number,
  comment?: string | null,
  isActing?: boolean,
  shiftTime?: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (shiftCode === "") {
    await db
      .delete(ctoRosterSavedRosterShifts)
      .where(
        and(
          eq(ctoRosterSavedRosterShifts.savedRosterId, savedRosterId),
          eq(ctoRosterSavedRosterShifts.memberId, memberId),
          eq(ctoRosterSavedRosterShifts.shiftDate, shiftDate)
        )
      );
    return;
  }
  await db
    .insert(ctoRosterSavedRosterShifts)
    .values({
      savedRosterId,
      memberId,
      shiftDate,
      shiftCode,
      shiftTime: shiftTime ?? null,
      comment: comment ?? null,
      isActing: isActing ?? false,
      updatedBy,
    })
    .onDuplicateKeyUpdate({
      set: {
        shiftCode,
        shiftTime: shiftTime ?? null,
        comment: comment ?? null,
        isActing: isActing ?? false,
        updatedBy,
      },
    });
}

export async function bulkUpsertCtoRosterSavedRosterShifts(
  savedRosterId: number,
  shifts: {
    memberId: number;
    shiftDate: string;
    shiftCode: string;
    shiftTime?: string | null;
    isActing?: boolean;
  }[],
  updatedBy?: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  for (const s of shifts) {
    if (s.shiftCode === "") {
      await db
        .delete(ctoRosterSavedRosterShifts)
        .where(
          and(
            eq(ctoRosterSavedRosterShifts.savedRosterId, savedRosterId),
            eq(ctoRosterSavedRosterShifts.memberId, s.memberId),
            eq(ctoRosterSavedRosterShifts.shiftDate, s.shiftDate)
          )
        );
    } else {
      await db
        .insert(ctoRosterSavedRosterShifts)
        .values({
          savedRosterId,
          memberId: s.memberId,
          shiftDate: s.shiftDate,
          shiftCode: s.shiftCode,
          shiftTime: s.shiftTime ?? null,
          isActing: s.isActing ?? false,
          updatedBy,
        })
        .onDuplicateKeyUpdate({
          set: {
            shiftCode: s.shiftCode,
            shiftTime: s.shiftTime ?? null,
            isActing: s.isActing ?? false,
            updatedBy,
          },
        });
    }
  }
}

export async function addCtoRosterSavedRosterTeam(
  savedRosterId: number,
  name: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(ctoRosterSavedRosterTeams.sortOrder) })
    .from(ctoRosterSavedRosterTeams)
    .where(eq(ctoRosterSavedRosterTeams.savedRosterId, savedRosterId));
  const [result] = await db
    .insert(ctoRosterSavedRosterTeams)
    .values({ savedRosterId, name, sortOrder: (maxOrder ?? -1) + 1 });
  return result.insertId as number;
}

export async function renameCtoRosterSavedRosterTeam(
  teamId: number,
  name: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterSavedRosterTeams)
    .set({ name })
    .where(eq(ctoRosterSavedRosterTeams.id, teamId));
}

export async function deleteCtoRosterSavedRosterTeam(
  teamId: number,
  savedRosterId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const teamMembers = await db
    .select({ id: ctoRosterSavedRosterMembers.id })
    .from(ctoRosterSavedRosterMembers)
    .where(
      and(
        eq(ctoRosterSavedRosterMembers.teamId, teamId),
        eq(ctoRosterSavedRosterMembers.savedRosterId, savedRosterId)
      )
    );
  if (teamMembers.length > 0) {
    const memberIds = teamMembers.map(m => m.id);
    await db
      .delete(ctoRosterSavedRosterShifts)
      .where(
        and(
          eq(ctoRosterSavedRosterShifts.savedRosterId, savedRosterId),
          inArray(ctoRosterSavedRosterShifts.memberId, memberIds)
        )
      );
    await db
      .delete(ctoRosterSavedRosterMembers)
      .where(inArray(ctoRosterSavedRosterMembers.id, memberIds));
  }
  await db
    .delete(ctoRosterSavedRosterTeams)
    .where(eq(ctoRosterSavedRosterTeams.id, teamId));
}

export async function addCtoRosterSavedRosterMember(
  savedRosterId: number,
  teamId: number,
  name: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [{ maxOrder }] = await db
    .select({ maxOrder: max(ctoRosterSavedRosterMembers.sortOrder) })
    .from(ctoRosterSavedRosterMembers)
    .where(
      and(
        eq(ctoRosterSavedRosterMembers.savedRosterId, savedRosterId),
        eq(ctoRosterSavedRosterMembers.teamId, teamId)
      )
    );
  const [result] = await db
    .insert(ctoRosterSavedRosterMembers)
    .values({ savedRosterId, teamId, name, sortOrder: (maxOrder ?? -1) + 1 });
  return result.insertId as number;
}

export async function renameCtoRosterSavedRosterMember(
  memberId: number,
  name: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterSavedRosterMembers)
    .set({ name })
    .where(eq(ctoRosterSavedRosterMembers.id, memberId));
}

export async function deleteCtoRosterSavedRosterMember(
  memberId: number,
  savedRosterId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(ctoRosterSavedRosterShifts)
    .where(
      and(
        eq(ctoRosterSavedRosterShifts.savedRosterId, savedRosterId),
        eq(ctoRosterSavedRosterShifts.memberId, memberId)
      )
    );
  await db
    .delete(ctoRosterSavedRosterMembers)
    .where(eq(ctoRosterSavedRosterMembers.id, memberId));
}

export async function moveCtoRosterSavedRosterMember(
  memberId: number,
  newTeamId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(ctoRosterSavedRosterMembers)
    .set({ teamId: newTeamId })
    .where(eq(ctoRosterSavedRosterMembers.id, memberId));
}
