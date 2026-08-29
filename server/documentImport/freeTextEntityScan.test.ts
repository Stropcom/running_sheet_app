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
