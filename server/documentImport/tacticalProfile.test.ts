import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { readDocxTables } from "./docxTableReader";
import { mapDocumentToTargetProfile } from "./targetProfileFieldMap";
import {
  mapMdlStatus,
  mapBail,
  normaliseTacticalDob,
} from "./tacticalProfileCards";
import type { DocumentReadResult } from "./documentReadResult";

// A real agency "Tactical Profile" (SU template, dummy data): a .docx that was
// converted from PDF, so its section captions are floating text boxes and its
// people are repeated CARD tables rather than a NAME/VEHICLES table. Five
// target cards (only the first filled in), four associate cards (two named),
// plus template furniture — icon-bar banners and a colour legend — that used
// to be offered as "photos".
const FIXTURE = join(
  __dirname,
  "__fixtures__/target-profile-tactical-haddad.docx"
);

describe("Tactical Profile format", () => {
  it("reads the target, addresses, vehicles, status and associates", async () => {
    const read = await readDocxTables(readFileSync(FIXTURE));
    const mapped = mapDocumentToTargetProfile(read);

    expect(mapped.name).toMatchObject({
      firstNames: "Leila Samira",
      surname: "HADDAD",
      bornDate: "14/04/1988",
    });

    // Home Address first (it becomes the primary address), the rest labelled.
    expect(mapped.addresses.map(a => a.label)).toEqual([
      "Home Address",
      "Postal Address",
      "Office Address",
      "Warehouse",
    ]);
    expect(mapped.addresses[0]).toMatchObject({
      unitNo: "7",
      houseNo: "31",
      streetName: "Marine",
      suburb: "COTTESLOE",
    });

    expect(mapped.vehicles.map(v => v.registration)).toEqual([
      "1TDM414",
      "1TMD414",
      "TFG414",
    ]);

    expect(mapped.mdlStatus).toBe("active");
    expect(mapped.bailStatus).toBe("no");

    expect(
      mapped.associateBlocks.map(a => `${a.firstNames} ${a.surname}`)
    ).toEqual(["Karim Elias NAJJAR", "Sophia Marie D'ANGELO"]);
    expect(mapped.associateBlocks[0]).toMatchObject({
      bornDate: "03/11/1981",
      address: { houseNo: "16", streetName: "Olive", suburb: "SUBIACO" },
      vehicle: { registration: "1KEN45" },
    });
    expect(mapped.associateBlocks[1].bornDate).toBe("29/08/1985");

    // Wording with no field of its own is shown, not dropped.
    const labels = mapped.unmappedFields.map(f => f.label);
    expect(labels).toContain("Operation");
    expect(labels).toContain("Sophia Marie D'ANGELO");
    expect(
      mapped.unmappedFields.find(f => f.label === "Sophia Marie D'ANGELO")
        ?.value
    ).toContain("Lebanese Passport RL4628107");

    // Only one target card is filled in this document.
    expect(mapped.additionalTargets).toEqual([]);
    // The narrative is the target's background, without the card boilerplate.
    expect(mapped.freeText).toContain("OBSERVATION LOG");
    expect(mapped.freeText).not.toContain("Click here for full TRF");
  });

  it("offers only real photos, once each, captioned by their owner", async () => {
    const read = await readDocxTables(readFileSync(FIXTURE));
    // 3 portraits (the template reuses two of them in the associate cards);
    // the icon-bar banners, legend and sidebar graphics are dropped.
    expect(read.images).toHaveLength(3);
    expect(read.images.map(i => i.captionName)).toEqual([
      undefined,
      "Karim Elias NAJJAR",
      "Sophia Marie D'ANGELO",
    ]);
  });
});

describe("Tactical Profile — several targets in one document", () => {
  const card = (name: string, dob: string, home: string) => [
    {
      rows: [
        ["", "Target", name, ""],
        ["", "Age", "", "Years", "DOB", dob, ""],
        ["", "TELCO", "PD", "LBS", "EBM"],
      ],
    },
    {
      rows: [
        ["ADDRESSES ADDRESSES", `Home Address\n${home}\n\nOther Frequented`],
        ["BAIL BAIL", "None"],
        ["SOCIAL MEDIA SOCIAL MEDIA", ""],
      ],
    },
  ];
  const read: DocumentReadResult = {
    tables: [
      ...card(
        "Leila Samira HADDAD",
        "14/04/1988",
        "7/31 Marine Parade, COTTESLOE WA 6011."
      ),
      ...card(
        "Omar Jabril KHOURY",
        "02/FEB/1990",
        "9 Wharf Road, FREMANTLE WA 6160."
      ),
      {
        rows: [
          ["Karim Elias NAJJAR", "16 Olive Street, SUBIACO WA 6008.", ""],
          ["", "Associate of Target", ""],
        ],
      },
    ],
    paragraphs: [],
    images: [],
  };

  it("returns every filled target, the first as primary", () => {
    const mapped = mapDocumentToTargetProfile(read);
    expect(mapped.name?.surname).toBe("HADDAD");
    expect(mapped.additionalTargets).toHaveLength(1);
    const second = mapped.additionalTargets![0];
    expect(second.name).toMatchObject({
      firstNames: "Omar Jabril",
      surname: "KHOURY",
      bornDate: "02/02/1990",
    });
    expect(second.addresses[0]).toMatchObject({
      houseNo: "9",
      streetName: "Wharf",
      suburb: "FREMANTLE",
    });
    // The document doesn't say whose associate Karim is — filed under the first.
    expect(mapped.associateBlocks.map(a => a.surname)).toEqual(["NAJJAR"]);
  });
});

describe("licence and bail wording", () => {
  it("maps MDL as the officer decided", () => {
    expect(mapMdlStatus("Active")).toBe("active");
    expect(mapMdlStatus("Expired FEB/2026")).toBe("none");
    expect(mapMdlStatus("Never Held / Learners Revoked")).toBe("none");
    expect(mapMdlStatus("Revoked")).toBe("none");
    expect(mapMdlStatus("Learners")).toBe("none");
    expect(mapMdlStatus("Nil")).toBe("none");
    expect(mapMdlStatus("Cancelled")).toBe("suspended");
    expect(mapMdlStatus("Suspended")).toBe("suspended");
    expect(mapMdlStatus("WA DL 7421908")).toBe("");
    expect(mapMdlStatus("")).toBe("");
  });

  it("maps bail and leaves unclear wording blank", () => {
    expect(mapBail("None").bailStatus).toBe("no");
    expect(mapBail("Yes").bailStatus).toBe("yes");
    expect(mapBail("Yes – curfew 8pm to 6am")).toMatchObject({
      bailStatus: "yes",
      bailConditions: "yes",
      bailConditionsText: "curfew 8pm to 6am",
    });
    expect(mapBail("Pending hearing").bailStatus).toBe("");
  });

  it("reads the date shapes this template uses", () => {
    expect(normaliseTacticalDob("14/04/1988")).toBe("14/04/1988");
    expect(normaliseTacticalDob("18/MAR/1988")).toBe("18/03/1988");
    expect(normaliseTacticalDob(": 03/11/1981")).toBe("03/11/1981");
    expect(normaliseTacticalDob("Years")).toBe("");
  });
});

// A larger fictional profile (Operation KESTREL): FIVE targets, TWENTY-FIVE
// associates, thirty portraits in photoboard grids. Each associate card names
// the target it belongs to and leads with "Name\nDOB: dd/mm/yyyy | NN Years".
const KESTREL_FIXTURE = join(
  __dirname,
  "__fixtures__/target-profile-tactical-kestrel.docx"
);

describe("Tactical Profile — five targets, twenty-five associates (KESTREL)", () => {
  it("returns every target with its own address, vehicles and status", async () => {
    const mapped = mapDocumentToTargetProfile(
      await readDocxTables(readFileSync(KESTREL_FIXTURE))
    );
    const all = [mapped, ...(mapped.additionalTargets ?? [])];
    expect(all.map(t => t.name!.surname)).toEqual([
      "KOVACS",
      "FERRARO",
      "RAHMAN",
      "VELASQUEZ",
      "THORNTON",
    ]);
    expect(all[0].addresses[0]).toMatchObject({
      houseNo: "14",
      streetName: "Willow",
      streetType: "Quay",
    });
    expect(all[2].addresses[0]).toMatchObject({
      streetName: "Seabreeze",
      streetType: "Walk",
    });
    // Marcus FERRARO's card has no vehicle rows; the document's vehicle list
    // supplies his.
    expect(all[1].vehicles.map(v => v.registration)).toEqual([
      "1FER83",
      "1ROS44",
    ]);
    // No target swallows the associate cards' vehicles any more.
    expect(all[4].vehicles.map(v => v.registration)).toEqual([
      "1THO37",
      "1CLA31",
    ]);
    expect(all.every(t => t.mdlStatus === "active")).toBe(true);
  });

  it("files each associate under the target its card names", async () => {
    const mapped = mapDocumentToTargetProfile(
      await readDocxTables(readFileSync(KESTREL_FIXTURE))
    );
    expect(mapped.associateBlocks).toHaveLength(25);
    const ownerCounts: Record<string, number> = {};
    for (const a of mapped.associateBlocks) {
      ownerCounts[a.ownerTargetName ?? ""] =
        (ownerCounts[a.ownerTargetName ?? ""] ?? 0) + 1;
    }
    expect(ownerCounts).toEqual({
      "Nadia Elise KOVACS": 5,
      "Marcus Leon FERRARO": 5,
      "Amira Noor RAHMAN": 5,
      "Nathaniel Cole VELASQUEZ": 5,
      "Evelyn Mae THORNTON": 5,
    });
    expect(mapped.associateBlocks[0]).toMatchObject({
      firstNames: "Tomas Ivo",
      surname: "VARGA",
      bornDate: "02/01/1978",
      address: { houseNo: "11", streetName: "Harbour", streetType: "Rise" },
    });
  });

  it("captions each photoboard portrait with the person beside it", async () => {
    const read = await readDocxTables(readFileSync(KESTREL_FIXTURE));
    const captions = read.images.map(i => i.captionName);
    // Thirty portraits, one per person, none left uncaptioned or given the
    // grid's first name.
    expect(new Set(captions).size).toBeGreaterThanOrEqual(30);
    expect(captions.slice(0, 5)).toEqual([
      "Nadia Elise KOVACS",
      "Marcus Leon FERRARO",
      "Amira Noor RAHMAN",
      "Nathaniel Cole VELASQUEZ",
      "Evelyn Mae THORNTON",
    ]);
    expect(captions).toContain("Declan Hugh MORRIS");
  });
});
