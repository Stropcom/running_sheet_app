import { describe, expect, it } from "vitest";
import { profileLinkFor } from "@shared/profileLink";

describe("profileLinkFor — what a chip in a profile's list opens", () => {
  it("a registered target opens the Target profile by its id (the bug: it was looked up by name as an associate)", () => {
    expect(
      profileLinkFor({
        id: "person::rowan mark quillan, born 1 may 1990 (quillan)",
        label: "Rowan Mark QUILLAN, born 1 May 1990 (QUILLAN)",
        type: "target",
        targetId: 87,
      })
    ).toEqual({ kind: "target", refId: 87 });
  });
  it("still understands the old target::<id> form", () => {
    expect(
      profileLinkFor({ id: "target::12", label: "X", type: "target" })
    ).toEqual({ kind: "target", refId: 12 });
  });
  it("a target with no id falls back to the name, never to a bad number", () => {
    expect(
      profileLinkFor({
        id: "target::Some Name",
        label: "Some Name",
        type: "target",
      })
    ).toEqual({ kind: "associate", refId: "Some Name" });
  });
  it("vehicles, places and other people open their own profiles by label", () => {
    expect(
      profileLinkFor({ id: "v", label: "1ABC123", type: "vehicle" })
    ).toEqual({ kind: "vehicle", refId: "1ABC123" });
    expect(
      profileLinkFor({ id: "a", label: "7 Probe Street", type: "address" })
    ).toEqual({ kind: "location", refId: "7 Probe Street" });
    expect(
      profileLinkFor({ id: "b", label: "Cafe One", type: "business" })
    ).toEqual({ kind: "location", refId: "Cafe One" });
    expect(
      profileLinkFor({ id: "p", label: "Jo BLOGGS", type: "person" })
    ).toEqual({ kind: "associate", refId: "Jo BLOGGS" });
  });
});
