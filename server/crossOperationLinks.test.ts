import { describe, expect, it } from "vitest";
import {
  targetVehicleRegos,
  targetAddressCores,
  targetAddressDisplays,
} from "./db";
import {
  sharedLinkChipText,
  sharedLinkSentence,
  sharedLinksTooltip,
} from "../client/src/lib/crossLinkText";

describe("cross-operation links state exactly what is shared", () => {
  it("never mistakes a model name for a registration", () => {
    // The structured fields are trusted: NX350h is the MODEL here.
    const regos = targetVehicleRegos({
      vehRegistration: "1TDM414",
      vehModel: "NX350h",
      v1f: "Lexus NX350h",
      v1: "Lexus NX350h",
      extraVehicles: JSON.stringify([
        {
          registration: "1TMD414",
          model: "Kluger",
          full: "white Toyota Kluger",
        },
      ]),
    });
    expect(Array.from(regos).sort()).toEqual(["1TDM414", "1TMD414"]);
    expect(regos.has("NX350H")).toBe(false);
  });

  it("still reads a registration out of free text when nothing is structured", () => {
    const regos = targetVehicleRegos({
      v1f: "1TDM414 (WA) 2023 white Lexus NX350h wagon.",
    });
    expect(regos.has("1TDM414")).toBe(true);
  });

  it("shows a shared address in full, without the bracket short-code", () => {
    const t = {
      hbf: "14 Willow Quay, EAST FREMANTLE WA (14 Willow Quay)",
      extraAddresses: JSON.stringify([
        { full: "Unit 3/90 Regent Street, WEST PERTH WA 6005." },
      ]),
    };
    const displays = targetAddressDisplays(t);
    const cores = Array.from(targetAddressCores(t));
    const shown = cores.map(c => displays.get(c));
    expect(shown).toContain("14 Willow Quay, EAST FREMANTLE WA");
    expect(shown).toContain("Unit 3/90 Regent Street, WEST PERTH WA 6005");
  });

  it("words each kind of link with the thing itself", () => {
    expect(sharedLinkChipText("vehicle", "1TDM414")).toBe(
      "shared vehicle 1TDM414"
    );
    expect(sharedLinkSentence("vehicle", "1TDM414")).toBe(
      "shares a registered vehicle — registration 1TDM414"
    );
    expect(
      sharedLinkSentence("address", "14 Willow Quay, EAST FREMANTLE WA")
    ).toBe("shares a registered address — 14 Willow Quay, EAST FREMANTLE WA");
    expect(sharedLinkSentence("associate", "Tomas Ivo VARGA")).toBe(
      "has an associate in common — Tomas Ivo VARGA"
    );
    expect(
      sharedLinksTooltip([
        { via: "vehicle", sharedValue: "1TDM414" },
        { via: "associate", sharedValue: "Tomas Ivo VARGA" },
      ])
    ).toBe(
      "Not formally linked — shares a registered vehicle — registration 1TDM414; has an associate in common — Tomas Ivo VARGA"
    );
  });
});
