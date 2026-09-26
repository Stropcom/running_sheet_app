import { describe, it, expect } from "vitest";
import {
  reflowNarrativeText,
  groupNarrativeIntoSections,
} from "@/lib/textFormat";

describe("groupNarrativeIntoSections", () => {
  it("puts paragraphs with no heading at all under a single null-heading section", () => {
    const text = "First paragraph.\n\nSecond paragraph.";
    const sections = groupNarrativeIntoSections(text);
    expect(sections).toEqual([
      { heading: null, paragraphs: ["First paragraph.", "Second paragraph."] },
    ]);
  });

  it("starts a new section at each real heading line, never folding it into the next sentence", () => {
    // Regression: reflowNarrativeText's own fold-until-sentence-end rule
    // would glue a bare heading like "SUMMARY" (no terminal punctuation)
    // straight onto the very next paragraph with just a space, erasing it
    // as a heading entirely — this is the real bug that motivated
    // groupNarrativeIntoSections existing as a separate function.
    const text = [
      "SUMMARY",
      "Associates: Nadia Farah QURESHI 20 Jasmine Loop, WILLETTON WA 6155.",
      "COMMUNICATIONS",
      "Mobile: 0491 570 168",
    ].join("\n\n");

    const sections = groupNarrativeIntoSections(text);
    expect(sections).toEqual([
      {
        heading: "SUMMARY",
        paragraphs: [
          "Associates: Nadia Farah QURESHI 20 Jasmine Loop, WILLETTON WA 6155.",
        ],
      },
      {
        heading: "COMMUNICATIONS",
        paragraphs: ["Mobile: 0491 570 168"],
      },
    ]);
  });

  it("keeps paragraphs before the first heading in their own null-heading section", () => {
    const text = [
      "Haris Imran BAIG is recorded as an import liaison.",
      "SUMMARY",
      "Departed the address at 0749 hours.",
    ].join("\n\n");

    const sections = groupNarrativeIntoSections(text);
    expect(sections).toEqual([
      {
        heading: null,
        paragraphs: ["Haris Imran BAIG is recorded as an import liaison."],
      },
      {
        heading: "SUMMARY",
        paragraphs: ["Departed the address at 0749 hours."],
      },
    ]);
  });

  it("still folds a paragraph break that doesn't end a sentence into the next line, same as reflowNarrativeText, when neither line is a heading", () => {
    const text = [
      "The subject was last seen",
      "entering the premises at 0900 hours.",
    ].join("\n\n");

    const sections = groupNarrativeIntoSections(text);
    expect(sections).toEqual([
      {
        heading: null,
        paragraphs: [
          "The subject was last seen entering the premises at 0900 hours.",
        ],
      },
    ]);
  });

  it("still emits a trailing heading with nothing under it as its own empty-paragraph section (left for the caller to filter, e.g. ImportedDocumentCard)", () => {
    const text = ["SUMMARY", "Some content.", "COMMUNICATIONS"].join("\n\n");
    const sections = groupNarrativeIntoSections(text);
    expect(sections).toEqual([
      { heading: "SUMMARY", paragraphs: ["Some content."] },
      { heading: "COMMUNICATIONS", paragraphs: [] },
    ]);
  });

  it("returns an empty array for empty text", () => {
    expect(groupNarrativeIntoSections("")).toEqual([]);
  });

  // Regression (Operation TIDELINE): a PDF's own text layout can glue a
  // whole run of sentences that share one visual line/cell into a single
  // space-joined paragraph with no line breaks at all — the same document
  // re-exported as a .docx keeps each sentence as its own Word paragraph
  // instead. Left unsplit, the two file formats' own paragraph shapes
  // never lined up for the diff's exact-text match, so re-importing the
  // "same" document in the other format showed nearly every line as
  // "added" even though not one sentence had actually changed. Every
  // sentence below must land as its own paragraph regardless of which
  // format supplied it, keeping its own terminating punctuation.
  it("splits a single paragraph containing several complete sentences into one paragraph per sentence", () => {
    const text =
      "Associates: Dominic Paul RUSSO 27 Garden Street, EAST PERTH WA 6004. 1DPR27 (WA) 2022 red Alfa Romeo Stelvio wagon. On 21 August 2026, Priya Elise NAIR attended the office.";
    const sections = groupNarrativeIntoSections(text);
    expect(sections).toEqual([
      {
        heading: null,
        paragraphs: [
          "Associates: Dominic Paul RUSSO 27 Garden Street, EAST PERTH WA 6004.",
          "1DPR27 (WA) 2022 red Alfa Romeo Stelvio wagon.",
          "On 21 August 2026, Priya Elise NAIR attended the office.",
        ],
      },
    ]);
  });

  it("leaves a 'Label: value' line with no sentence-ending punctuation as a single paragraph", () => {
    const text = "Mobile: 0491 570 151";
    const sections = groupNarrativeIntoSections(text);
    expect(sections).toEqual([
      { heading: null, paragraphs: ["Mobile: 0491 570 151"] },
    ]);
  });

  // Regression (Operation SWITCHBACK): a bare single-letter initial
  // ("Marcus L. CHANG") looks exactly like a sentence-ending period
  // followed by a capitalised word — the sentence-splitting fix above
  // used to cut it in half ("Marcus L." + "CHANG are known variants."),
  // corrupting a real training document that deliberately uses this shape
  // as one of its own near-identical name variants.
  it("doesn't split a sentence at a bare single-letter initial", () => {
    const text =
      "Mark Lee CHANG and Marcus L. CHANG are known variants. Markus Leigh CHAN and Marcus Li CHEN are separate persons.";
    const sections = groupNarrativeIntoSections(text);
    expect(sections).toEqual([
      {
        heading: null,
        paragraphs: [
          "Mark Lee CHANG and Marcus L. CHANG are known variants.",
          "Markus Leigh CHAN and Marcus Li CHEN are separate persons.",
        ],
      },
    ]);
  });
});

describe("reflowNarrativeText (unchanged behaviour, regression guard)", () => {
  it("still folds an un-terminated paragraph break into the next line, headings and all — the exact behaviour groupNarrativeIntoSections exists to avoid for display", () => {
    const text = ["SUMMARY", "Some content."].join("\n\n");
    expect(reflowNarrativeText(text)).toBe("SUMMARY Some content.");
  });
});
