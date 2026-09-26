import { describe, it, expect } from "vitest";
import {
  buildExtractPrompt,
  buildVerifyPrompt,
  parseModelReply,
} from "./localDocumentAI";

// buildExtractPrompt/buildVerifyPrompt/parseModelReply are the pure pieces
// of localDocumentAI.ts — no model, no I/O — so they're the part that can
// actually be verified in this sandbox (which can't fetch the real model
// weights to test the rest end to end — see that file's header).

describe("buildExtractPrompt", () => {
  it("asks for a clean address, with an explicit unknown escape hatch and no invented details", () => {
    const messages = buildExtractPrompt("address", "", "12 Smith St Perth");
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("address");
    expect(messages[0].content).toContain("unknown");
    expect(messages[0].content.toLowerCase()).toContain("invent");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain("12 Smith St Perth");
  });

  it("asks for a clean vehicle description in the expected shape", () => {
    const messages = buildExtractPrompt("vehicle", "", "white corolla 1abc123");
    expect(messages[0].content).toContain("REGISTRATION colour make model");
    expect(messages[1].content).toContain("white corolla 1abc123");
  });

  it("passes the sub-label through as context when present", () => {
    const messages = buildExtractPrompt(
      "address",
      "Frequent Location",
      "12 Smith St Perth"
    );
    expect(messages[1].content).toContain("Frequent Location");
  });

  it("omits the context sentence entirely when there's no label", () => {
    const messages = buildExtractPrompt("address", "", "12 Smith St Perth");
    expect(messages[1].content).toBe("Text: 12 Smith St Perth");
  });
});

describe("buildVerifyPrompt", () => {
  it("includes the rules' own existing reading for the model to confirm or correct", () => {
    const messages = buildVerifyPrompt(
      "address",
      "Current Address",
      "12 Smith St, Perth",
      "12 Smith Street, PERTH WA"
    );
    expect(messages[1].content).toContain("Current Address");
    expect(messages[1].content).toContain("12 Smith St, Perth");
    expect(messages[1].content).toContain("12 Smith Street, PERTH WA");
  });

  it("still forbids inventing details, via the same system prompt as the extract task", () => {
    const extractMsgs = buildExtractPrompt("vehicle", "", "white corolla");
    const verifyMsgs = buildVerifyPrompt(
      "vehicle",
      "",
      "white corolla",
      "white Toyota Corolla"
    );
    expect(verifyMsgs[0].content).toBe(extractMsgs[0].content);
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
