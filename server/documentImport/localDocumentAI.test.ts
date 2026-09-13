import { describe, it, expect } from "vitest";
import { buildCleanupPrompt, parseModelReply } from "./localDocumentAI";

// buildCleanupPrompt/parseModelReply are the two pure pieces of
// localDocumentAI.ts — no model, no I/O — so they're the part that can
// actually be verified in this sandbox (which can't fetch the real model
// weights to test the rest end to end — see that file's header).

describe("buildCleanupPrompt", () => {
  it("asks for a clean address, with an explicit unknown escape hatch", () => {
    const prompt = buildCleanupPrompt("address", "12 Smith St Perth");
    expect(prompt).toContain("street address");
    expect(prompt).toContain("unknown");
    expect(prompt).toContain("12 Smith St Perth");
  });

  it("asks for a clean vehicle description in the expected shape", () => {
    const prompt = buildCleanupPrompt("vehicle", "white corolla 1abc123");
    expect(prompt).toContain("REGISTRATION colour make model");
    expect(prompt).toContain("white corolla 1abc123");
  });
});

describe("parseModelReply", () => {
  it("passes through a real, usable reply unchanged", () => {
    expect(parseModelReply("12 Smith Street, Perth WA")).toBe(
      "12 Smith Street, Perth WA"
    );
  });

  it("treats an empty reply as no suggestion", () => {
    expect(parseModelReply("")).toBeNull();
    expect(parseModelReply("   ")).toBeNull();
  });

  it("treats 'unknown' (any case) as no suggestion", () => {
    expect(parseModelReply("unknown")).toBeNull();
    expect(parseModelReply("Unknown")).toBeNull();
    expect(parseModelReply("UNKNOWN.")).toBeNull();
  });

  it("treats other refusal markers as no suggestion", () => {
    expect(parseModelReply("n/a")).toBeNull();
    expect(parseModelReply("none")).toBeNull();
    expect(parseModelReply("not applicable")).toBeNull();
    expect(parseModelReply("unclear")).toBeNull();
  });

  it("trims surrounding whitespace from a real reply", () => {
    expect(parseModelReply("  1ABC123 white Toyota Corolla sedan  ")).toBe(
      "1ABC123 white Toyota Corolla sedan"
    );
  });

  it("does not false-positive on a real reply that merely contains a marker word", () => {
    // "None" as a whole reply means "no suggestion" — but a real address
    // that happens to mention "unclear" partway through should not be
    // treated the same as a refusal.
    expect(parseModelReply("12 Smith Street (house number unclear)")).toBe(
      "12 Smith Street (house number unclear)"
    );
  });
});
