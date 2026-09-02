// Manual backup check over every entity already mined into the Intelligence
// folder, looking for shapes that suggest a parsing/classification slip
// rather than a genuine person/vehicle/address/business — e.g. the UF1/
// YC1/UCO1 placeholder-code bug (server/db.ts's extractEntitiesFromText
// skip list), or a vehicle rego that picked up a stray comma from an
// address bleeding into its bracket. Deliberately rule-based and narrow
// (see CLAUDE.md's Golden Rule) — each rule below is something that was
// either an actual reported bug, or the same failure shape as one. This
// never runs automatically; it's triggered on demand from the admin's own
// profile page and only ever notifies that one admin, so a flagged entity
// gets a human look, not an automatic change.
import type { IntelligenceEntity } from "./db";

export interface ScanFinding {
  ruleId: string;
  reason: string;
  type: IntelligenceEntity["type"];
  shortForm: string;
  occurrences: Array<{
    sheetId: number;
    sheetTitle: string;
    rowId: number;
    operationName: string;
    observationSnippet: string;
  }>;
}

// Same shape as the UM/UF/YC/UCO placeholder codes already skipped in
// extractEntitiesFromText (a short letter-prefix + a number, e.g. "UM1",
// "YC12") — this rule exists specifically to catch the NEXT one of these
// the team starts using before it's been added to that skip list, rather
// than needing another screenshot/bug report each time.
const PLACEHOLDER_CODE_SHAPE_RE = /^[A-Z]{1,4}\d{1,2}$/i;

/** A real WA rego always has at least one digit — a vehicle-typed entity
 * with none is either a misclassification or a garbled short form. */
function vehicleShortFormLacksDigits(shortForm: string): boolean {
  return !/\d/.test(shortForm);
}

export function scanIntelligenceEntities(
  entities: IntelligenceEntity[]
): ScanFinding[] {
  const findings: ScanFinding[] = [];

  const addFinding = (
    entity: IntelligenceEntity,
    ruleId: string,
    reason: string
  ) => {
    findings.push({
      ruleId,
      reason,
      type: entity.type,
      shortForm: entity.shortForm,
      occurrences: entity.occurrences
        .filter(o => o.rowId > 0)
        .map(o => ({
          sheetId: o.sheetId,
          sheetTitle: o.sheetTitle,
          rowId: o.rowId,
          operationName: o.operationName,
          observationSnippet: o.observationSnippet,
        })),
    });
  };

  for (const entity of entities) {
    // Registry cards (targets/associates) and indices-only entries are
    // typed in deliberately, not mined from prose — these rules are about
    // catching a parser slip, so they only apply to entities that actually
    // came from observation text.
    if (entity.isTarget || entity.isAssociate || entity.isIndicesOnly) continue;
    if (entity.occurrences.every(o => o.rowId <= 0)) continue;

    const shortForm = entity.shortForm.trim();

    if (
      (entity.type === "person" ||
        entity.type === "vehicle" ||
        entity.type === "business") &&
      PLACEHOLDER_CODE_SHAPE_RE.test(shortForm)
    ) {
      addFinding(
        entity,
        "placeholder-code-shape",
        `"${shortForm}" is shaped like a placeholder code (e.g. UM1/UF1/YC1/UCO1) but was recorded as a ${entity.type} entity — check whether it's a new placeholder code that needs adding to the skip list, or a genuine ${entity.type}.`
      );
      continue;
    }

    // A comma inside the bracket short form itself (not the surrounding
    // sentence) — a real rego/name/business bracket never legitimately
    // contains one; it's the signature of the "bracket balloon" bug class
    // (an earlier clause's text bleeding into this entity's short form).
    // Reported as happening "particularly with vehicles".
    if (
      shortForm.includes(",") &&
      (entity.type === "vehicle" ||
        entity.type === "person" ||
        entity.type === "business")
    ) {
      addFinding(
        entity,
        "comma-in-short-form",
        `"${shortForm}" has a comma inside the ${entity.type} short form — likely text from an adjacent clause bled into this entity's bracket rather than a genuine part of it.`
      );
      continue;
    }

    if (entity.type === "vehicle" && vehicleShortFormLacksDigits(shortForm)) {
      addFinding(
        entity,
        "vehicle-no-digits",
        `"${shortForm}" is recorded as a vehicle but has no digits at all — real WA regos always have at least one; likely a misclassified name or code.`
      );
      continue;
    }

    if (entity.type === "person" && /\d/.test(shortForm)) {
      addFinding(
        entity,
        "person-has-digits",
        `"${shortForm}" is recorded as a person but contains a digit — check it isn't actually a vehicle rego or reference code.`
      );
      continue;
    }

    const realOccurrences = entity.occurrences.filter(o => o.rowId > 0);
    if (entity.lowConfidence && realOccurrences.length === 1) {
      addFinding(
        entity,
        "single-mention-low-confidence",
        `"${shortForm}" was only ever mined once, at low confidence — often a stray fragment of surrounding text rather than a real entity.`
      );
    }
  }

  return findings;
}
