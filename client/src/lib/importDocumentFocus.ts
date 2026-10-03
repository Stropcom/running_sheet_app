/**
 * A parsed import document can describe several targets (a Tactical Profile
 * has one card per target, each with its own associates and photos). Every
 * target goes through the SAME steps — review screen, then the Add Target
 * form — one after another. This narrows the full parse result down to the
 * one target currently being reviewed ("focus"), so the review screen itself
 * stays a single-target screen and needn't know the document held more.
 *
 * Focus 0 is the document's primary target (the parse result's own fields);
 * focus n is `additionalTargets[n - 1]`. Associates follow the target their
 * card names ("Associate of Target …"); a card that names none belongs to the
 * primary.
 */
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export type ParsedDocument =
  inferRouterOutputs<AppRouter>["target"]["registry"]["parseDocument"];

export function normPersonName(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z' -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fullName(n: { firstNames: string; surname: string } | null): string {
  return n ? `${n.firstNames} ${n.surname}`.trim() : "";
}

/** How many targets the document describes (1 for an ordinary document). */
export function documentTargetCount(full: ParsedDocument): number {
  return 1 + (full.additionalTargets?.length ?? 0);
}

/** Display names of every target, in review order. */
export function documentTargetNames(full: ParsedDocument): string[] {
  return [
    fullName(full.name),
    ...(full.additionalTargets ?? []).map(t => fullName(t.name)),
  ];
}

/** Which target (0 = primary) an associate card belongs to. */
export function ownerIndexOfAssociate(
  full: ParsedDocument,
  ownerTargetName: string | undefined
): number {
  const owner = normPersonName(ownerTargetName ?? "");
  if (!owner) return 0;
  const idx = documentTargetNames(full).findIndex(
    n => normPersonName(n) === owner
  );
  return idx === -1 ? 0 : idx;
}

/** The people (other targets and THEIR associates) a photo caption could name
 * who are NOT part of the target in focus — a photo captioned with one of
 * them belongs to a later review, not this one. */
export function namesOutsideFocus(
  full: ParsedDocument,
  focus: number
): Set<string> {
  const out = new Set<string>();
  documentTargetNames(full).forEach((n, i) => {
    if (i !== focus) out.add(normPersonName(n));
  });
  for (const a of full.associateBlocks) {
    if (ownerIndexOfAssociate(full, a.ownerTargetName) !== focus) {
      out.add(normPersonName(`${a.firstNames} ${a.surname}`));
    }
  }
  return out;
}

/** The parse result as it should look when reviewing target `focus` only. */
export function focusParsedDocument(
  full: ParsedDocument,
  focus: number
): ParsedDocument {
  const associateBlocks = full.associateBlocks.filter(
    a => ownerIndexOfAssociate(full, a.ownerTargetName) === focus
  );
  if (focus === 0 || !full.additionalTargets?.[focus - 1]) {
    return { ...full, associateBlocks, additionalTargets: [] };
  }
  const t = full.additionalTargets[focus - 1];
  return {
    ...full,
    name: t.name,
    addresses: t.addresses,
    vehicles: t.vehicles,
    unmappedFields: t.unmappedFields,
    freeText: t.freeText,
    candidateEntities: t.candidateEntities,
    needsReview: t.needsReview,
    mdlStatus: t.mdlStatus,
    bailStatus: t.bailStatus,
    bailConditions: t.bailConditions,
    bailConditionsText: t.bailConditionsText,
    associateBlocks,
    additionalTargets: [],
    // The on-device AI re-check only ran for the primary target.
    aiSuggestions: [],
    addressAiOutcomes: t.addresses.map(() => ({ status: "declined" as const })),
    vehicleAiOutcomes: t.vehicles.map(() => ({ status: "declined" as const })),
  };
}
