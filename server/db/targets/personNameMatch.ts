// Part of the target queries (server/db/targets.ts): person-name spelling matches against the registry, and the mention / address suggestions.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { and, eq } from "drizzle-orm";
import {
  bracketCodeFromRegisteredName,
  nameWithoutBornClause,
} from "@shared/addressFormat";
import {
  knownAddressMatches,
  knownPlaceMatches,
  parseKnownAddress,
} from "@shared/knownAddress";
import { personNameMatchDecisions } from "../../../drizzle/schema";
import {
  comparePersonNames,
  type DedupType,
  type DedupCandidateEntity,
} from "../../entityDedup";
import { getDb } from "../core";
import { getAllIntelligenceEntities } from "../reports";
import { computeEntityKey } from "../intelligence";

// ─── Person Name Match (Target/Associate Registry spelling correction) ────
// Distinct from the entityAliases merge system above: that links two ordinary
// text-mined entities without touching the observation text. This checks a
// not-yet-saved person mention against the formal Target/Associate Registry
// and, when confirmed, corrects the row's own text to the registered
// spelling before it's saved — see routers.ts row.update's use of this.

export interface PersonTargetMatch {
  targetId?: number;
  associateId?: number;
  name: string;
  tgtAlias: string | null;
  /** The registry's own structured surname field (targets.surname /
   * associates.surname) — the actual bracket code to suggest when there's
   * no tgtAlias, since `name` is the full registered name with no bracket
   * of its own to extract one from (see the real bug this fixed: the
   * client used to fall back to bracketing the WHOLE name, e.g. "(Declan
   * WESTBROOK)", instead of just the surname, "(WESTBROOK)"). Null for a
   * business-name associate, which has no surname to fall back to. */
  surname: string | null;
  score: number;
  reason: string;
}

/** Silent auto-correction lookup: has this exact spelling already been
 * confirmed against a Target/Associate? Used to rewrite the observation text
 * at save time without prompting again — the "remembered" half of the
 * spellcheck-style flow the officer confirms once. */
export async function getKnownPersonNameCorrection(spelling: string): Promise<{
  correctSpelling: string;
  targetId: number | null;
  associateId: number | null;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const norm = spelling.trim().toUpperCase();
  if (!norm) return null;
  const rows = await db
    .select()
    .from(personNameMatchDecisions)
    .where(
      and(
        eq(personNameMatchDecisions.decision, "confirmed"),
        eq(personNameMatchDecisions.spelling, norm)
      )
    )
    .limit(1);
  if (!rows.length || !rows[0].correctSpelling) return null;
  return {
    correctSpelling: rows[0].correctSpelling,
    targetId: rows[0].targetId,
    associateId: rows[0].associateId,
  };
}

/** Fuzzy-match a not-yet-saved person mention against the Target/Associate
 * Registry — backs the save-time "is this an existing Target?" prompt.
 * Excludes anything that already exactly matches a registered TGT/associate
 * alias (that already auto-links silently via getAllIntelligenceEntities,
 * nothing to ask) and anything with a prior decision recorded for this exact
 * (spelling, target/associate) pairing, confirmed or rejected. */
export async function checkPossibleTargetMatches(
  label: string
): Promise<PersonTargetMatch[]> {
  const db = await getDb();
  if (!db) return [];
  const labelUpper = label.trim().toUpperCase();
  if (!labelUpper) return [];

  const allEntities = await getAllIntelligenceEntities();
  const registryEntities = allEntities.filter(e => e.isTarget || e.isAssociate);

  // Already an exact alias match — the existing tgtAlias/associate-alias
  // mechanism already folds this into the target/associate silently.
  if (
    registryEntities.some(
      e => e.tgtAlias && e.tgtAlias.trim().toUpperCase() === labelUpper
    )
  ) {
    return [];
  }

  const decisions = await db
    .select()
    .from(personNameMatchDecisions)
    .where(eq(personNameMatchDecisions.spelling, labelUpper));
  const decidedTargetIds = new Set(
    decisions.filter(d => d.targetId != null).map(d => d.targetId)
  );
  const decidedAssociateIds = new Set(
    decisions.filter(d => d.associateId != null).map(d => d.associateId)
  );

  const results: PersonTargetMatch[] = [];
  for (const e of registryEntities) {
    if (e.isTarget && e.targetId != null && decidedTargetIds.has(e.targetId))
      continue;
    if (
      e.isAssociate &&
      e.associateId != null &&
      decidedAssociateIds.has(e.associateId)
    )
      continue;

    const candidateNames = [e.shortForm, e.tgtAlias].filter(
      (v): v is string => !!v && v.trim().length > 0
    );
    let best: { score: number; reason: string } | null = null;
    for (const c of candidateNames) {
      const cmp = comparePersonNames(label, c);
      if (cmp && (!best || cmp.score > best.score)) best = cmp;
    }
    if (!best) continue;

    results.push({
      targetId: e.isTarget ? (e.targetId ?? undefined) : undefined,
      associateId: e.isAssociate ? (e.associateId ?? undefined) : undefined,
      name: e.shortForm,
      tgtAlias: e.tgtAlias ?? null,
      surname: e.surname ?? null,
      score: best.score,
      reason: best.reason,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 3);
}

async function upsertPersonNameMatchDecision(data: {
  spelling: string;
  targetId?: number;
  associateId?: number;
  correctSpelling?: string;
  decidedByCIN: string | undefined;
  decision: "confirmed" | "rejected";
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const norm = data.spelling.trim().toUpperCase();
  const existing = await db
    .select()
    .from(personNameMatchDecisions)
    .where(
      and(
        eq(personNameMatchDecisions.spelling, norm),
        data.targetId != null
          ? eq(personNameMatchDecisions.targetId, data.targetId)
          : eq(personNameMatchDecisions.associateId, data.associateId!)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(personNameMatchDecisions)
      .set({
        decision: data.decision,
        correctSpelling: data.correctSpelling ?? null,
        decidedByCIN: data.decidedByCIN,
        decidedAt: Date.now(),
      })
      .where(eq(personNameMatchDecisions.id, existing[0].id));
  } else {
    await db.insert(personNameMatchDecisions).values({
      spelling: norm,
      targetId: data.targetId ?? null,
      associateId: data.associateId ?? null,
      decision: data.decision,
      correctSpelling: data.correctSpelling ?? null,
      decidedByCIN: data.decidedByCIN,
      decidedAt: Date.now(),
    });
  }
}

/** Records a confirmed spelling correction against a Target/Associate — this
 * exact spelling auto-corrects silently on every future save from now on. */
export async function confirmPersonNameMatch(data: {
  spelling: string;
  targetId?: number;
  associateId?: number;
  correctSpelling: string;
  decidedByCIN: string | undefined;
}): Promise<void> {
  await upsertPersonNameMatchDecision({ ...data, decision: "confirmed" });
}

/** Records "not the same person" so this exact (spelling, target/associate)
 * pairing isn't asked about again. */
export async function rejectPersonNameMatch(data: {
  spelling: string;
  targetId?: number;
  associateId?: number;
  decidedByCIN: string | undefined;
}): Promise<void> {
  await upsertPersonNameMatchDecision({
    spelling: data.spelling,
    targetId: data.targetId,
    associateId: data.associateId,
    decidedByCIN: data.decidedByCIN,
    decision: "rejected",
  });
}

/**
 * Search existing entities of one type by substring — backs the manual Merge
 * Entities picker (excludeTargets: true, the default) and the Target
 * Registry name/vehicle autocomplete (excludeTargets: false — that feature's
 * whole point is suggesting entities already seen in observations, and most
 * of those worth adding as a Target have often already been promoted to one
 * elsewhere, so filtering them out there defeats the feature).
 */
export async function searchIntelligenceEntities(
  type: DedupType,
  query: string,
  excludeTargets = true
): Promise<DedupCandidateEntity[]> {
  const allEntities = await getAllIntelligenceEntities();
  const q = query.trim().toLowerCase();
  return allEntities
    .filter(
      e =>
        (!excludeTargets || !e.isTarget) &&
        e.type === type &&
        (!q || e.shortForm.toLowerCase().includes(q))
    )
    .map(e => ({
      key: computeEntityKey(type, e.shortForm),
      label: e.shortForm,
      type,
      rowCount: e.occurrences.filter(o => o.rowId > 0).length,
    }))
    .sort((a, b) => b.rowCount - a.rowCount)
    .slice(0, 25);
}

export interface PersonMentionSuggestion {
  key: string;
  /** The name portion an officer would write before the bracket, e.g. "Basil CAT". */
  displayName: string;
  /** The bracket code to write it with, e.g. "CAT". */
  bracketCode: string;
  rowCount: number;
  /** Exactly one of these is set — which Registry record this suggestion is,
   * so selecting it can immediately record the same confirmed link
   * checkPossibleTargetMatches' save-time prompt would otherwise still ask
   * for, rather than asking again for a person the officer just picked by
   * name. */
  targetId: number | null;
  associateId: number | null;
}

/**
 * Live "as you type" suggestions for the observation field's inline mention
 * autocomplete — scoped to registered Target/Associate Registry people only
 * (not bare text-mined mentions), since only a registry entry reliably
 * carries a clean "Name, born DATE (BRACKET)" shape to split into a display
 * name and bracket code. A bare text-mined person's bracket code isn't
 * recoverable from the merged entity alone, and registry entries are also
 * exactly the ones worth proactively linking to as an officer types.
 */
export async function searchRegisteredPersonMentions(
  query: string
): Promise<PersonMentionSuggestion[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const allEntities = await getAllIntelligenceEntities();
  return allEntities
    .filter(
      e =>
        e.type === "person" &&
        (e.isTarget || e.isAssociate) &&
        e.shortForm.toLowerCase().includes(q)
    )
    .map(e => ({
      key: computeEntityKey("person", e.shortForm),
      displayName: nameWithoutBornClause(e.shortForm),
      bracketCode: bracketCodeFromRegisteredName(e.shortForm),
      rowCount: e.occurrences.filter(o => o.rowId > 0).length,
      targetId: e.isTarget ? (e.targetId ?? null) : null,
      associateId: e.isAssociate ? (e.associateId ?? null) : null,
    }))
    .sort((a, b) => b.rowCount - a.rowCount)
    .slice(0, 8);
}

export interface KnownAddressSuggestion {
  key: string;
  /** Intelligence display form, e.g. "13 Denford Street, KENWICK". */
  label: string;
  businessName: string;
  street: string;
  suburb: string;
  rowCount: number;
}

/**
 * Live "as you type" suggestions for addresses the app already knows —
 * every address/business entity Intelligence has seen (observations plus
 * Target/Associate registry cards) whose street starts with what the officer
 * has typed ("13 Den" → "13 Denford Street, KENWICK"). Deterministic string
 * matching only; the Google fallback for addresses the app doesn't know yet
 * runs in the browser against the map service.
 */
export async function searchKnownAddresses(
  query: string,
  places = false
): Promise<KnownAddressSuggestion[]> {
  const q = query.trim();
  if (q.length < (places ? 2 : 3)) return [];
  const allEntities = await getAllIntelligenceEntities();
  const seen = new Set<string>();
  const out: KnownAddressSuggestion[] = [];
  for (const e of allEntities) {
    if (e.type !== "address" && e.type !== "business") continue;
    if (
      places
        ? !knownPlaceMatches(q, e.shortForm)
        : !knownAddressMatches(q, e.shortForm)
    )
      continue;
    const parts = parseKnownAddress(e.shortForm);
    if (!parts) continue;
    const dedupe = `${parts.street}|${parts.suburb}`.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      key: computeEntityKey(e.type, e.shortForm),
      label: e.shortForm,
      businessName: parts.businessName,
      street: parts.street,
      suburb: parts.suburb,
      rowCount: e.occurrences.filter(o => o.rowId > 0).length,
    });
  }
  return out.sort((a, b) => b.rowCount - a.rowCount).slice(0, 6);
}
