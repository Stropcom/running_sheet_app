/**
 * Regression tests for entity TYPE classification (person / vehicle /
 * address / business) in extractEntitiesFromText — as distinct from
 * addressFormat.test.ts, which covers address LABEL recovery once an
 * entity is already known to be an address.
 */

import { describe, it, expect } from "vitest";
import { extractEntitiesFromText } from "./db";

describe("extractEntitiesFromText — vehicle vs address disambiguation", () => {
  it("classifies a 'station sedan' vehicle mention as a vehicle, not an address (the reported bug)", () => {
    // "station sedan"/"station wagon" is body-style terminology, but the
    // address-detection pass (which runs before vehicle keywords are even
    // considered) had a bare "station" keyword meant for transit stations —
    // it fired on this phrase and misclassified the vehicle as an address,
    // so it silently never appeared as a vehicle chip on the Summary tab.
    const text =
      "A blue Volkswagen Passat station sedan, bearing WA registration 1DHY084 (Vehicle 1DHY084) parked and unattended in the driveway at 101 Eric Street.";
    const entities = extractEntitiesFromText(text);
    const vehicle = entities.find(e => e.rawShortForm === "Vehicle 1DHY084");
    expect(vehicle?.type).toBe("vehicle");
  });

  it("classifies a 'station wagon' vehicle mention as a vehicle", () => {
    const text =
      "A white Holden Commodore station wagon, bearing WA registration 1ABC123 (Vehicle 1ABC123) departed.";
    const entities = extractEntitiesFromText(text);
    const vehicle = entities.find(e => e.rawShortForm === "Vehicle 1ABC123");
    expect(vehicle?.type).toBe("vehicle");
  });

  it("still classifies a real train station as an address (the fix must not break this)", () => {
    const text =
      "TGT (TGT) observed entering Fremantle Train Station, ADELAIDE ST (Fremantle Train Station).";
    const entities = extractEntitiesFromText(text);
    const address = entities.find(
      e => e.rawShortForm === "Fremantle Train Station"
    );
    expect(address?.type).toBe("address");
  });

  it("still classifies a bus station address correctly", () => {
    const text =
      "Vehicle 1XYZ789, TGT driver and sole occupant, arrived at Perth Busport Bus Station, WELLINGTON ST (Perth Busport Bus Station).";
    const entities = extractEntitiesFromText(text);
    const address = entities.find(
      e => e.rawShortForm === "Perth Busport Bus Station"
    );
    expect(address?.type).toBe("address");
  });

  it("classifies the first vehicle in a row even after a leading, bracket-less address sentence (the WTQ304 bug)", () => {
    // The regex that pairs preceding text with a bracket has nothing to
    // anchor its start once it reaches the very first bracket in a row —
    // if that row opens with a plain-prose address statement and no
    // bracket of its own ("Vehicles visible at 81 Redmond Road."), the
    // whole leading sentence bleeds into the first bracketed entity's
    // fullDescription. Address detection used to scan the entire
    // fullDescription, so "81 Redmond Road" from the unrelated leading
    // sentence misclassified the vehicle that followed it.
    const text =
      "Vehicles visible at 81 Redmond Road. A green Toyota Prado, bearing WA registration WTQ304 (Vehicle WTQ304), a silver Hyundai Getz, bearing WA registration 1CWY970 (Vehicle 1CWY970) parked and unattended on the driveway.";
    const entities = extractEntitiesFromText(text);
    const wtq304 = entities.find(e => e.rawShortForm === "Vehicle WTQ304");
    expect(wtq304?.type).toBe("vehicle");
  });

  it("classifies a short all-caps bracket code as a person, not a rego (the Basil CAT bug)", () => {
    // A short (2-3 letter) all-caps bracket code with no digits is an
    // ordinary short surname — but it also matches WA_REGO's personalised-
    // plate catch-all (`^[A-Z0-9]{2,7}$`), and the guard meant to exclude
    // all-caps names from that branch only excluded names of 4+ letters.
    // A person misclassified as a vehicle silently skips the person-only
    // fuzzy-match against the Target/Associate Registry (see
    // checkPossibleTargetMatches), so the "possible duplicate" prompt never
    // fires even for an already-registered exact name match.
    for (const surname of ["CAT", "FOX", "LEE", "COX", "IVY", "OLD"]) {
      const entities = extractEntitiesFromText(`John ${surname} (${surname})`);
      const person = entities.find(e => e.rawShortForm === surname);
      expect(person?.type).toBe("person");
    }
  });

  it("still classifies a genuine bare rego mention as a vehicle", () => {
    // Non-regression: a rego that actually contains digits must still
    // classify as a vehicle even with no "vehicle"/"registration" keyword
    // nearby — shortFormLooksLikeName requires no digits, so this is
    // unaffected by the person-code fix above.
    const text = "Parked outside the address (1FAT004).";
    const entities = extractEntitiesFromText(text);
    const vehicle = entities.find(e => e.rawShortForm === "1FAT004");
    expect(vehicle?.type).toBe("vehicle");
  });

  it("skips UM/UF unidentified-person placeholders instead of misreading them as a vehicle", () => {
    // Reported bug: "IKIN and a young girl (UF1), in school uniform
    // exited..." — UF1 (unidentified female) was never in the skip list
    // (only UM was), so it fell through to the vehicle catch-all and
    // showed up as a fake vehicle in the Vehicles tab.
    const text =
      "IKIN and a young girl (UF1), in school uniform exited the vehicle.";
    const entities = extractEntitiesFromText(text);
    expect(entities.find(e => e.rawShortForm === "UF1")).toBeUndefined();
  });

  it("still skips UM unidentified-male placeholders (the original case)", () => {
    const text = "IKIN met with an unknown male (UM1) outside the address.";
    const entities = extractEntitiesFromText(text);
    expect(entities.find(e => e.rawShortForm === "UM1")).toBeUndefined();
  });

  it("skips YC young-child placeholders the same way", () => {
    const text = "IKIN collected a young child (YC1) from the school gate.";
    const entities = extractEntitiesFromText(text);
    expect(entities.find(e => e.rawShortForm === "YC1")).toBeUndefined();
  });

  it("skips UCO undercover-operative placeholders the same way", () => {
    const text =
      "The undercover operative (UCO1) approached IKIN outside the address.";
    const entities = extractEntitiesFromText(text);
    expect(entities.find(e => e.rawShortForm === "UCO1")).toBeUndefined();
  });

  it("still classifies a real address after a leading sentence correctly", () => {
    // Non-regression: the address check must still fire for an address
    // whose own street-type words are in the same sentence as the bracket,
    // even with an earlier, unrelated sentence before it.
    const text =
      "Vehicles visible nearby. TGT (TGT) departed and arrived at 44 Elvira Street, PALMYRA WA (44 Elvira Street).";
    const entities = extractEntitiesFromText(text);
    const address = entities.find(e => e.rawShortForm === "44 Elvira Street");
    expect(address?.type).toBe("address");
  });
});

describe("extractEntitiesFromText — person name recovery", () => {
  it("recovers the full name when the officer types the registry's own 'Full Name, born <date>' convention inline", () => {
    // The registry convention "Full Name, born <date>" — see targetCoreName()
    // — used to defeat name recovery when typed directly into free-text
    // narrative: the DOB clause's digits broke the last-N-words candidate
    // search before it ever reached the actual name, so this fell back to
    // the bare bracket surname ("HARRIS") instead of "Heath HARRIS".
    const text =
      "Observed Heath HARRIS, born 12 March 2000 (HARRIS) exit the vehicle.";
    const entities = extractEntitiesFromText(text);
    const person = entities.find(e => e.rawShortForm === "HARRIS");
    expect(person?.type).toBe("person");
    expect(person?.shortForm).toBe("Heath HARRIS");
  });

  it("still recovers the full name when there is no DOB clause (the fix must not break this)", () => {
    const text = "Observed Jason JOHNSON (JOHNSON) exit the vehicle.";
    const entities = extractEntitiesFromText(text);
    const person = entities.find(e => e.rawShortForm === "JOHNSON");
    expect(person?.shortForm).toBe("Jason JOHNSON");
  });
});

describe("extractEntitiesFromText — vehicle description reconstruction", () => {
  it("doesn't leak a leading ', and' into the second of two vehicles in one sentence (the reported bug)", () => {
    // Found via the Intelligence Entity Scan: the regex boundary between
    // two bracket matches starts the second vehicle's fullDescription right
    // after the first bracket — comma and "and" included — producing
    // "1DEF456 , and orange Porsche Mecan SUV" instead of a clean
    // description. Adding "a" before the second vehicle used to work around
    // it (gave the article-cut logic something to anchor on), but the fix
    // shouldn't depend on officers remembering to do that.
    const text =
      "orange Toyota Land Cruiser 4WD, bearing WA registration 1ABC123 (Vehicle 1ABC123), and orange Porsche Mecan SUV, bearing WA registration 1DEF456 (Vehicle 1DEF456)";
    const entities = extractEntitiesFromText(text);
    const first = entities.find(e => e.rawShortForm === "Vehicle 1ABC123");
    const second = entities.find(e => e.rawShortForm === "Vehicle 1DEF456");
    expect(first?.shortForm).toBe("1ABC123 orange Toyota Land Cruiser 4WD");
    expect(second?.shortForm).toBe("1DEF456 orange Porsche Mecan SUV");
  });
});
