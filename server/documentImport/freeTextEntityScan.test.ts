import { describe, it, expect } from "vitest";
import {
  findCandidatePersons,
  findCandidateBusinesses,
  findCandidateEmails,
  findCandidatePhones,
  matchWholeLinePersonName,
  scanFreeText,
} from "./freeTextEntityScan";

// The real SUMMARY cell text from the training fixture (see
// docxTableReader.test.ts) — this is the exact "sometimes it's not
// consistent" free-text case the import feature was designed against: a
// bare person name, a business, a deliberately obfuscated email, a clean
// labelled phone number, and a second, differently-formatted phone number
// for the same person buried in a sentence.
const SUMMARY_TEXT = `On 24 December 2024, Container DFSU1205246 being held at EES Shipping (EES Shipment S00084692) 16 Baling Street, Cockburn Central WA was searched by ABF and found to contain illicit drugs. An extensive search found a total of 193 kilograms of methylamphetamine concealed within the bags of rice. 38 rice bags in total contained drugs, spread across 13 of 24 the 24 pallets. Only the 'Almeer Gold' branded.

Consignee consignment details
Ryan FORBES
Rex imports Australia Pty Ltd
Email: reximportsausATgmail.com
Mobile: 0451307189
Consignment delivery address is 2299 Great Northern Highway, Bullsbrook WA
Emails between EES Shipping and FORBES recorded his number as x451307354 (in email sign off).
EES Advised they attempted to contact FORBES multiple times and he did not collect the consignment. EES eventually contacted Rex Imports who denied knowledge of the import and denied that the entity reported (FORBES) on the Letter of Authority is a representative of the company.`;

describe("findCandidatePersons", () => {
  it("finds the bare 'Firstname SURNAME' mention", () => {
    const result = findCandidatePersons(SUMMARY_TEXT);
    expect(result.some(c => c.value === "Ryan FORBES")).toBe(true);
  });

  it("does not false-positive on 'Suburb STATE' shaped text", () => {
    const result = findCandidatePersons(SUMMARY_TEXT);
    expect(result.some(c => c.value.includes("Bullsbrook WA"))).toBe(false);
    expect(result.some(c => c.value.includes("Central WA"))).toBe(false);
  });

  // Regression: "WHITE GUM VALLEY" (an all-caps suburb, no state code) was
  // matching as if it were a person's name — "WHITE" satisfied
  // "[A-Z][a-zA-Z'-]+" the same as a real title-case word like "Woodvale"
  // did, since that character class allows uppercase letters throughout,
  // not just the first one. Found against a real training document.
  it("does not false-positive on an all-caps suburb with no state code", () => {
    const text = "David GRAY\n103 Watkins Street, WHITE GUM VALLEY";
    const result = findCandidatePersons(text);
    expect(result.map(c => c.value)).toEqual(["David GRAY"]);
  });

  // Regression: a vehicle make immediately followed by a short ALL-CAPS
  // model/trim code reads exactly like "Firstname SURNAME" — "Yamaha MT"
  // (from "...black Yamaha MT-07 motorcycle...") and "Mercedes Benz GLC"
  // (from "...silver Mercedes Benz GLC wagon...") both showed up as bare
  // person candidates against real training documents (NIGHTJAR, SEASTAR).
  it("does not false-positive on a vehicle make immediately followed by an ALL-CAPS model code", () => {
    const text =
      "1NIGHT7 (WA) 2021 black Yamaha MT-07 motorcycle. 1SJK09 (WA) 2022 silver Mercedes Benz GLC wagon.";
    const result = findCandidatePersons(text);
    expect(result.map(c => c.value)).not.toContain("Yamaha MT");
    expect(result.map(c => c.value)).not.toContain("Mercedes Benz GLC");
  });
});

describe("matchWholeLinePersonName", () => {
  it("matches a bare name line", () => {
    expect(matchWholeLinePersonName("David GRAY")).toEqual({
      firstNames: "David",
      surname: "GRAY",
    });
  });

  it("rejects an all-caps line", () => {
    expect(matchWholeLinePersonName("WHITE GUM VALLEY")).toBeNull();
  });

  it("rejects a line with trailing content", () => {
    expect(matchWholeLinePersonName("David GRAY was present")).toBeNull();
  });

  it("rejects a state code as a surname", () => {
    expect(matchWholeLinePersonName("Woodvale WA")).toBeNull();
  });

  // A document doesn't always label an associate with "Associates:" — it
  // might give no title at all (just the bare name, already covered by
  // "matches a bare name line" above), or use a relationship word instead
  // ("Mum", "Dad", "Sister", ...). A relationship word on its OWN line
  // needs no special handling (it's a single word, never matches the
  // name shape, so findAssociateBlocks just skips past it to the name on
  // the next line) — these cover the word sharing a line WITH the name.
  describe("relationship-word labels", () => {
    it("strips a leading relationship word with a dash", () => {
      expect(matchWholeLinePersonName("Mum - Jane SMITH")).toEqual({
        firstNames: "Jane",
        surname: "SMITH",
      });
    });

    it("strips a leading relationship word with a colon", () => {
      expect(matchWholeLinePersonName("Dad: John SMITH")).toEqual({
        firstNames: "John",
        surname: "SMITH",
      });
    });

    it("strips a trailing relationship word in parentheses", () => {
      expect(matchWholeLinePersonName("Jane SMITH (Sister)")).toEqual({
        firstNames: "Jane",
        surname: "SMITH",
      });
    });

    it("strips a trailing relationship word after a dash", () => {
      expect(matchWholeLinePersonName("John SMITH - Brother")).toEqual({
        firstNames: "John",
        surname: "SMITH",
      });
    });

    it("is case-insensitive on the relationship word", () => {
      expect(matchWholeLinePersonName("MUM - Jane SMITH")).toEqual({
        firstNames: "Jane",
        surname: "SMITH",
      });
    });

    it("does not strip a word that isn't a known relationship", () => {
      // "Consignee" isn't in the relationship word list, so this should
      // fail the whole-line shape check same as any other prefixed line.
      expect(matchWholeLinePersonName("Consignee - Jane SMITH")).toBeNull();
    });
  });
});

describe("findCandidateBusinesses", () => {
  it("finds the Pty Ltd business line", () => {
    const result = findCandidateBusinesses(SUMMARY_TEXT);
    expect(result.some(c => c.value === "Rex imports Australia Pty Ltd")).toBe(
      true
    );
  });

  // Regression: BUSINESS_NAME_RE used to carry a whole-pattern "i" flag
  // meant only for the suffix alternation ("Pty Ltd" vs "pty ltd"), which
  // also silently weakened the leading "[A-Z]" to match ANY letter --
  // when a real training document (SWITCHBACK) had this sentence hard-
  // wrapped mid-word across two PDF lines ("...used in connected\ndocuments.
  // Switchback Systems Pty Ltd..."), the match was allowed to start on the
  // lowercase "d" of "documents." instead of skipping ahead to the real,
  // properly-capitalised business name.
  it("never starts a business name mid-word on a lowercase letter", () => {
    const result = findCandidateBusinesses(
      "documents. Switchback Systems Pty Ltd and SB Systems are confirmed as the same organisation."
    );
    expect(result.map(c => c.value)).toContain("Switchback Systems Pty Ltd");
    expect(result.map(c => c.value)).not.toContain(
      "documents. Switchback Systems Pty Ltd"
    );
  });

  // Regression: an "Organisation complexity"-style sentence listing several
  // name variants in a row let the old 80-char cap run the lazy match all
  // the way from the sentence's own leading words (or an earlier variant
  // in the list) to the LAST "Pty Ltd" it could reach, rather than
  // stopping at the one genuine business-name mention closest to it.
  // Found against three real training documents (MIRAGE, CROSSWIND,
  // SWITCHBACK), each with this exact sentence shape.
  it("doesn't swallow a sentence's own leading words or an earlier name variant into the business name", () => {
    const mentionedMidSentence = findCandidateBusinesses(
      "An invoice issued by Crosswind Consulting Pty Ltd referenced account CWA-1212."
    );
    expect(mentionedMidSentence.map(c => c.value)).toContain(
      "Crosswind Consulting Pty Ltd"
    );
    expect(mentionedMidSentence.map(c => c.value)).not.toContain(
      "An invoice issued by Crosswind Consulting Pty Ltd"
    );

    const listedAsVariant = findCandidateBusinesses(
      "Crosswind Alliance, Crosswind Consulting Pty Ltd, CWA Logistics and Crosswind Business Services appear in connected records."
    );
    expect(listedAsVariant.map(c => c.value)).toContain(
      "Crosswind Consulting Pty Ltd"
    );
    expect(listedAsVariant.map(c => c.value)).not.toContain(
      "Crosswind Alliance, Crosswind Consulting Pty Ltd"
    );
  });
});

describe("findCandidateEmails", () => {
  it("captures the obfuscated email verbatim via its label", () => {
    const result = findCandidateEmails(SUMMARY_TEXT);
    const match = result.find(c => c.value === "reximportsausATgmail.com");
    expect(match).toBeDefined();
    expect(match!.confidence).toBe("high");
  });

  // Regression: a multi-part domain (e.g. "riverfreight.com.au") already
  // caught by the labelled email pattern was ALSO matched by the bare-email
  // fallback, but truncated to "riverfreight.com" (the old domain pattern
  // only allowed one label+TLD), so it slipped past the seen-dedup check
  // and produced a spurious second "low confidence" entry for the exact
  // same address. Found while building fictional test documents.
  it("does not duplicate a labelled multi-part-domain email as a truncated bare match", () => {
    const result = findCandidateEmails(
      "Email: danny.okafor@riverfreight.com.au"
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      value: "danny.okafor@riverfreight.com.au",
      confidence: "high",
    });
  });

  it("still finds a bare multi-part-domain email with no label at all", () => {
    const result = findCandidateEmails(
      "contact danny.okafor@riverfreight.com.au for details"
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      value: "danny.okafor@riverfreight.com.au",
      confidence: "low",
    });
  });

  // Regression: a PDF import can land "Email: <address>" and the very next
  // fact on the SAME reading-order line, with no real line break at all —
  // the old ".+?...$" pattern had no "\n" for "$" to anchor against, so it
  // ran all the way to the end of the whole paragraph instead of stopping
  // at the email. Found against a real training document (SEASTAR): a
  // labelled "email" whose value swallowed an entire following sentence
  // about a different person's own vehicle and location.
  it("stops the labelled value at the email itself, not at the end of an unbroken paragraph", () => {
    const result = findCandidateEmails(
      "Email: yuki.tanaka@example.com 13 August 2026: MORETTI attended 18 Rule Street, NORTH FREMANTLE WA 6159 in 1BLM92 (WA) 2020 white BMW 330i sedan."
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      value: "yuki.tanaka@example.com",
      confidence: "high",
    });
  });
});

describe("findCandidatePhones", () => {
  it("finds both the labelled number and the irregular one, as distinct entries", () => {
    const result = findCandidatePhones(SUMMARY_TEXT);
    const labelled = result.find(c => c.value === "0451307189");
    expect(labelled).toBeDefined();
    expect(labelled!.confidence).toBe("high");

    const irregular = result.find(c => c.value.includes("451307354"));
    expect(irregular).toBeDefined();
    expect(irregular!.confidence).toBe("low");
  });
});

describe("scanFreeText", () => {
  it("combines all four detectors", () => {
    const result = scanFreeText(SUMMARY_TEXT);
    const types = new Set(result.map(c => c.type));
    expect(types).toEqual(new Set(["person", "business", "email", "phone"]));
  });
});
