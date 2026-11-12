// Part of the Intelligence entity builder (server/db/intelEntities.ts). The builder used to be
// one 1,500-line function; each step is now its own function that takes what the earlier
// steps made and hands on what the later steps use. The steps run in this order:
// registry → targetCards → associateCards → occurrences → registeredMentions → sheetPass → finish.
// Same code in the same order as before; see docs/features/dev-and-ops.md (Big-file plan, 4c).

import {
  aliasMentionCompatible,
  aliasSearchFlags,
  bareAliasFollowsOtherGivenName,
} from "../../personAliasMatch";
import { bareAliasOwner } from "@shared/aliasSeeding";
import {
  registeredAddressIn,
  registeredPlatesIn,
} from "@shared/registeredMentions";
import { insideCapsSuburb } from "@shared/suburbMention";
import { extractEntitiesFromText, vehicleRegoKey } from "../intelligence";
import type { RegistryState } from "./registry";
import type { OccurrencesState } from "./occurrences";
import type { RegisteredMentionsState } from "./registeredMentions";

export function scanSheets(
  s: Pick<
    RegistryState,
    | "targetRows"
    | "sheetTargetIdBySheet"
    | "tgtAliasToFullName"
    | "registeredNamesByAlias"
  > &
    Pick<OccurrencesState, "rowsBySheet" | "registerOccurrence"> &
    Pick<
      RegisteredMentionsState,
      | "registeredPlateLabel"
      | "registeredStreets"
      | "registeredPlateSet"
      | "creditedInRow"
    >
) {
  const {
    targetRows,
    sheetTargetIdBySheet,
    tgtAliasToFullName,
    registeredNamesByAlias,
    rowsBySheet,
    registerOccurrence,
    registeredPlateLabel,
    registeredStreets,
    registeredPlateSet,
    creditedInRow,
  } = s;

  for (const [, sheetRows_] of Array.from(rowsBySheet.entries())) {
    // ── Pass A: build per-sheet entity dictionary from bracketed introductions ──
    // Dictionary key: shortForm.toLowerCase() AND rawShortForm.toLowerCase() (both point to same entry)
    // This is critical: name-recovery may change "HOTA" → "G HOTA", so we must register
    // BOTH keys so that Pass B can find "HOTA" in subsequent rows even though the
    // display name is "G HOTA".
    type DictEntry = {
      shortForm: string;
      rawShortForm: string;
      fullDescription: string;
      type: "person" | "vehicle" | "address" | "business" | "unknown";
    };
    const sheetDict = new Map<string, DictEntry>();

    // Keys pre-seeded from the target registry (see below) → that target's
    // full name. A person introduced in this sheet's own text under the same
    // surname alias but with a different given name is someone else, and the
    // sheet's own introduction wins for bare mentions on this sheet.
    const preseededAliasName = new Map<string, string>();
    // The same registered name, looked up by the dictionary entry itself
    // (Pass B below needs it when it scans text for the alias).
    const preseededEntryName = new WeakMap<DictEntry, string>();
    // Surname aliases this sheet uses for TWO different people ("Grace TAN
    // (TAN)" and "Lawrence TAN (TAN)"). A bare "TAN" on such a sheet can't be
    // attributed to either, so Pass B doesn't search for the bare alias — each
    // person is still found by their full name — and Check Sheet flags it.
    const ambiguousAliasKeys = new Set<string>();
    const registerDictEntry = (key: string, entry: DictEntry) => {
      const preseedName = preseededAliasName.get(key);
      if (
        preseedName !== undefined &&
        entry.type === "person" &&
        !aliasMentionCompatible(
          entry.shortForm,
          entry.rawShortForm,
          preseedName
        )
      ) {
        sheetDict.set(key, entry);
        preseededAliasName.delete(key);
        return;
      }
      if (!sheetDict.has(key)) {
        sheetDict.set(key, entry);
      } else {
        const existing = sheetDict.get(key)!;
        // Same surname bracket, different given names → two different
        // people. Never fold one into the other (that would rewrite the
        // first person's entry as the second).
        if (
          entry.type === "person" &&
          existing.type === "person" &&
          existing !== entry &&
          key === entry.rawShortForm.toLowerCase() &&
          !aliasMentionCompatible(
            entry.shortForm,
            entry.rawShortForm,
            existing.shortForm
          )
        ) {
          ambiguousAliasKeys.add(key);
          return;
        }
        // Upgrade to longer shortForm if available
        if (entry.shortForm.length > existing.shortForm.length) {
          existing.shortForm = entry.shortForm;
          existing.fullDescription = entry.fullDescription;
        }
      }
    };

    // ── Pre-seed sheetDict with ALL target aliases from the target registry ──
    // Operators often write the target alias (e.g. "JAMES", "SMITH") from the very
    // first row without ever bracketing it, because the target card IS the introduction.
    // Without pre-seeding, Pass B would never find these tokens.
    // We register each alias under its lowercase key so Pass B can match it in any row.
    // The target this very sheet was opened for (shared/aliasSeeding.ts): its
    // own TGT alias is the word the team writes for them, so a surname shared
    // with someone else on the registry still means THIS sheet's target here.
    const ownTargetId = sheetTargetIdBySheet.get(sheetRows_[0]?.sheetId ?? -1);
    const ownTargetRow =
      ownTargetId !== undefined
        ? targetRows.find(
            t =>
              t.targetId === ownTargetId &&
              (!t.targetType || t.targetType === "person") &&
              !!t.tgt?.trim()
          )
        : undefined;
    const ownTarget = ownTargetRow
      ? { name: ownTargetRow.targetName, alias: ownTargetRow.tgt!.trim() }
      : null;
    for (const [alias, mappedName] of Array.from(
      tgtAliasToFullName.entries()
    )) {
      const aliasKey = alias.toLowerCase();
      const sharers = new Set(
        (registeredNamesByAlias.get(alias) ?? []).map(n => n.toUpperCase())
      );
      const canonicalName = bareAliasOwner({
        alias,
        sharedBy: sharers.size,
        mappedName,
        ownTarget,
      });
      if (canonicalName === null) continue;
      if (!sheetDict.has(aliasKey)) {
        const seeded: DictEntry = {
          shortForm: canonicalName, // display as full canonical name
          rawShortForm: alias, // raw alias is the search token
          fullDescription: `Target: ${canonicalName}`,
          type: "person",
        };
        sheetDict.set(aliasKey, seeded);
        preseededAliasName.set(aliasKey, canonicalName);
        preseededEntryName.set(seeded, canonicalName);
      }
    }

    for (const row of sheetRows_) {
      if (!row.observation) continue;
      const bracketed = extractEntitiesFromText(row.observation);
      for (const e of bracketed) {
        const entry: DictEntry = {
          shortForm: e.shortForm,
          rawShortForm: e.rawShortForm,
          fullDescription: e.fullDescription,
          type: e.type,
        };
        // Register by displayName key (e.g. "g hota")
        registerDictEntry(e.shortForm.toLowerCase(), entry);
        // Also register by raw bracketed token key (e.g. "hota") if different
        // This ensures Pass B can find "HOTA" in subsequent rows even though
        // the display name is "G HOTA".
        if (e.rawShortForm.toLowerCase() !== e.shortForm.toLowerCase()) {
          registerDictEntry(e.rawShortForm.toLowerCase(), entry);
        }
      }
    }

    // ── Pass B: scan every row for both bracketed AND unbracketed occurrences ──
    // Build a sorted list of known short forms (longest first to avoid partial matches)
    const knownEntries = Array.from(sheetDict.values()).sort(
      (a, b) => b.shortForm.length - a.shortForm.length
    );

    for (const row of sheetRows_) {
      if (!row.observation) continue;

      // First, register all bracketed entities in this row (as before)
      const bracketed = extractEntitiesFromText(row.observation);
      // Track both displayName and rawShortForm so we don't double-count
      // e.g. "G HOTA" (displayName) and "HOTA" (rawShortForm) are the same entity
      const bracketedShortForms = new Set<string>();
      for (const e of bracketed) {
        bracketedShortForms.add(e.shortForm.toLowerCase());
        bracketedShortForms.add(e.rawShortForm.toLowerCase());
      }
      for (const e of bracketed) {
        registerOccurrence(e, row);
      }

      // Then, scan for unbracketed occurrences of known short forms.
      //
      // Correct approach: work on the ORIGINAL observation text but track only
      // the paren content ranges "(ShortForm)" — i.e. the brackets themselves.
      // A short-form match is considered "inside a bracket" only if it falls
      // entirely within one of those paren ranges.  This correctly handles rows
      // like "Vehicle 1CZQ642 (1CZQ642) with G HOTA (HOTA) ..." where the same
      // token appears both unbracketed (the real entity) and inside parens
      // (the short-form label) — we want the unbracketed occurrence.
      //
      // Step 1: collect all paren-content ranges [start, end) in this row.
      //         We mark the entire "(ShortForm)" including the parens.
      const parenRanges: Array<[number, number]> = [];
      const parenPattern = /\([^()]{1,80}\)/g;
      let spanMatch: RegExpExecArray | null;
      while ((spanMatch = parenPattern.exec(row.observation)) !== null) {
        parenRanges.push([
          spanMatch.index,
          spanMatch.index + spanMatch[0].length,
        ]);
      }

      // Helper: returns true if the match at [start, end) is entirely inside a paren
      const isInsideParenContent = (start: number, end: number): boolean =>
        parenRanges.some(([s, e]) => start >= s && end <= e);

      // Deduplicate knownEntries so we don't emit two occurrences for the same entity
      // (sheetDict may have both "g hota" and "hota" pointing to the same DictEntry object)
      const seenEntryObjects = new Set<DictEntry>();

      for (const entry of knownEntries) {
        // Skip duplicates (same DictEntry registered under multiple keys)
        if (seenEntryObjects.has(entry)) continue;
        seenEntryObjects.add(entry);

        // Skip if this entity was already captured as a bracketed entity in this row
        // (check both displayName and rawShortForm)
        if (bracketedShortForms.has(entry.shortForm.toLowerCase())) continue;
        if (bracketedShortForms.has(entry.rawShortForm.toLowerCase())) continue;

        // For person, address, and business entities, search by BOTH the
        // enriched displayName ("G HOTA" / "54 Terrace Road, PERTH") AND the
        // raw bracketed token ("HOTA" / "54 Terrace Road") — subsequent rows
        // routinely use the short form (e.g. re-visits that don't repeat the
        // suburb every time: "returned to 54 Terrace Road"), and searching
        // only the full enriched form would miss those, undercounting visits.
        const searchTerms: string[] = [entry.shortForm];
        const aliasIsAmbiguous =
          entry.type === "person" &&
          ambiguousAliasKeys.has(entry.rawShortForm.toLowerCase());
        if (
          !aliasIsAmbiguous &&
          (entry.type === "person" ||
            entry.type === "address" ||
            entry.type === "business" ||
            entry.type === "vehicle") &&
          entry.rawShortForm !== entry.shortForm
        ) {
          searchTerms.push(entry.rawShortForm);
        }
        // A vehicle is identified by its registration, and later rows refer
        // back to it however the officer typed it that day — "Vehicle
        // 1FAD093", "in 1FAD093", or the bare plate. Searching the plate
        // itself catches all of those. Without it the only term searched is
        // the enriched display form ("1FAD093 red Mercedes SUV"), which this
        // pipeline assembles and which therefore never appears verbatim in a
        // later row — so every bare vehicle re-mention went uncounted, and a
        // vehicle never co-occurred with the target driving it.
        if (entry.type === "vehicle") {
          const rego = vehicleRegoKey(entry.shortForm);
          const alreadySearched = searchTerms.some(
            t => t.toLowerCase() === rego
          );
          if (
            rego &&
            rego !== entry.shortForm.toLowerCase() &&
            !alreadySearched
          ) {
            searchTerms.push(rego);
          }
        }

        let found = false;
        for (const term of searchTerms) {
          if (found) break;
          // Build a word-boundary regex for the search term.
          // For vehicle registrations (e.g. "1CZQ642") use lookahead/lookbehind for
          // non-alphanumeric boundaries; for alphabetic terms use \b.
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const wordBoundary = /^[A-Za-z]/.test(term)
            ? `\\b${escaped}\\b`
            : `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`;
          // An all-caps surname alias ("PARK") only counts when written in
          // capitals — see aliasSearchFlags.
          const re = new RegExp(
            wordBoundary,
            entry.type === "person" ? aliasSearchFlags(term) : "gi"
          );

          let tokenMatch: RegExpExecArray | null;
          while ((tokenMatch = re.exec(row.observation)) !== null) {
            const mStart = tokenMatch.index;
            const mEnd = mStart + tokenMatch[0].length;
            // A capital word that is part of a suburb ("MAIDA VALE WA") is the
            // place, not a person of that surname — see shared/suburbMention.ts.
            if (
              entry.type === "person" &&
              insideCapsSuburb(row.observation, mStart, mEnd)
            )
              continue;
            // Only count this occurrence if it is NOT inside a paren
            if (!isInsideParenContent(mStart, mEnd)) {
              // A bare surname alias that follows a different given name
              // mid-sentence ("met Lawrence TAN") is someone else, not the
              // registered "Grace Olivia TAN". At the start of a sentence a
              // capitalised word is as likely to be ordinary text ("Then
              // TAN left"), so that case still counts as before.
              const registeredName = preseededEntryName.get(entry);
              if (
                registeredName &&
                term === entry.rawShortForm &&
                bareAliasFollowsOtherGivenName(
                  row.observation.slice(0, mStart),
                  term,
                  registeredName
                )
              ) {
                continue;
              }
              found = true;
              break;
            }
          }
        }

        if (found) {
          registerOccurrence(
            {
              shortForm: entry.shortForm,
              rawShortForm: entry.rawShortForm,
              fullDescription: entry.fullDescription,
              type: entry.type,
            },
            row
          );
        }
      }

      // Plain-text mentions of a REGISTERED plate or street address that the
      // sheet never bracketed (see registeredMentions above). Skipped for a row
      // the bracket path already credited, so nothing is counted twice.
      for (const plate of registeredPlatesIn(
        row.observation,
        registeredPlateSet
      )) {
        const key = `vehicle::${plate}`;
        if (creditedInRow(key, row.rowId)) continue;
        registerOccurrence(
          {
            shortForm: registeredPlateLabel.get(plate) ?? plate,
            fullDescription: `Registered vehicle ${plate.toUpperCase()} named in the row`,
            type: "vehicle",
          },
          row
        );
      }
      for (const reg of registeredStreets) {
        if (creditedInRow(reg.key, row.rowId)) continue;
        if (!registeredAddressIn(row.observation, reg.street, reg.suburb))
          continue;
        registerOccurrence(
          {
            shortForm: reg.street,
            fullDescription: `Registered address ${reg.street} named in the row`,
            type: "address",
          },
          row
        );
      }
    }
  }
}
