import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { mapDocumentToTargetProfile } from "./targetProfileFieldMap";
import { tacticalTablesFromPdf } from "./tacticalProfilePdf";
import { readTacticalProfile } from "./tacticalProfileCards";
import { dropRepeatedPhotos } from "./imageDedupe";
import { matchWholeLinePersonName } from "./freeTextEntityScan";
import type { ExtractedDocumentImage } from "./documentReadResult";

// An invented profile laid out the way the agency's PDF text layer comes out:
// page furniture between pages, a target's vehicle wrapped over paragraphs, a
// telco value printed away from its label, "STATUSACTIVE" glued, associates
// listed by owner, two targets (one with a hyphenated given name).
const FURNITURE = [
  "PROTECTED Updated - 01/01/2026 9:00 AM",
  "OFFICIAL",
  "FREEDOM OF INFORMATION - This document may contain information which is exempt matter.",
];
const PARAGRAPHS = [
  ...FURNITURE,
  "SU Tactical Profile",
  "HARBOUR SERIOUS AND ORGANISED CRIME 99Z001 01/JAN/2026",
  "Casey ORMOND",
  "IO Pat HALE 0400000000",
  "Sup Robin FLYNN",
  "TARGETS (Hyperlinks to PHOTOBOARD)",
  "Rhea Marie CALLOWAY",
  "Jean-Pierre Luc VASSEUR",
  "Target’s and Associate’s Vehicles Rhea Marie CALLOWAY – 1RMC11 (WA) 2022 red Mazda CX-5 wagon. Linked – 1LNK22 (WA) 2020 white Holden Colorado utility. Jean-Pierre Luc VASSEUR – 1JPV33 (WA) 2021 grey Toyota Camry sedan. Driver & Owner Details",
  ...FURNITURE,
  "Other Vehicles Sighted (Not Target or Associate’s) Owner Details and Sighted at",
  // ── first target
  "Target",
  "Rhea Marie CALLOWAY",
  "Age 38 Years DOB 02/03/1988",
  "Description\nFemale | 165 cm | slim build",
  "TELCO 0400 111 222 PD PD-HBR-1 LBS LBS-HBR-1 EBM EBM-HBR-1",
  "INTERCEPT Training only STATUSACTIVE MOB MOB-HBR-1",
  "Target Background",
  "IDENTITY / DOCUMENT NOTES",
  "Also recorded as Rhea Calloway.",
  "ACTIVITY SUMMARY",
  "Coordinates deliveries.",
  "WA MDL: Active – 12345678",
  ...FURNITURE,
  "Home Address",
  "10 Example Street, TESTVILLE WA 6000.",
  "Other Frequented",
  "Unit 2/5 Sample Road, TESTVILLE WA 6000.",
  "Registered\nVehicles",
  "1RMC11",
  "(WA) 2022",
  "red Mazda\nCX-5 wagon.",
  "Registered Vehicles Linked Vehicles",
  "1RMD12 (WA) 2020 blue Kia Rio hatch.",
  "Linked Vehicles",
  "1LNK22 (WA) 2020 white Holden Colorado utility.",
  "SOCIAL MEDIA",
  "social.example/rhea",
  ...FURNITURE,
  // ── second target (hyphenated given name, telco values printed apart)
  "Target",
  "Jean-Pierre Luc VASSEUR",
  "Age 41 Years DOB 09/09/1984",
  "Description Male | 180 cm | solid build",
  "TELCO 0400 333 444 PD LBS LBS-HBR-2 EBM EBM-HBR-2",
  "PD-HBR-2",
  "INTERCEPT Training only STATUS MOB MOB-HBR-2",
  "ACTIVE",
  "Target Background",
  "IDENTITY / DOCUMENT NOTES",
  "Manages the depot.",
  "WA MDL: Active – 87654321",
  "Home Address",
  "3 Demo Way, SAMPLETON WA 6001.",
  "Other Frequented",
  "4 Trial Court, SAMPLETON WA 6001.",
  "Registered Vehicles 1JPV33 (WA) 2021 grey Toyota Camry sedan. Linked Vehicles 1JPL44 (WA) 2019 black Ford Ranger utility.",
  // ── associates
  "Odette June MARLOWE",
  "7 Alpha Street, ONETOWN WA 6002.",
  "Years",
  "Associate of Target",
  "Rhea Marie CALLOWAY",
  "Warnings (Relevant) Nil Alerts Nil Linked Ops HARBOUR – Associate 1 WA MDL: Active – 111",
  "Registered Vehicles 1ODT55 (WA) 2018 green Subaru Forester wagon. Linked Vehicles 1RMC11 (WA) 2022 red Mazda CX-5 wagon.",
  "TELCO",
  "0400 555 666 PD - PD-H-9 LBS - LBS-H-9 EBM - EBM-H-9",
  "OTHER INFO",
  "Fictional courier; email odette@x.example.",
  "SOCIAL",
  "MEDIA",
  "social.example/odette",
  ...FURNITURE,
  "Bram Anton QUILL DOB: 12/12/1990 | 35 Years",
  "8 Beta Street, TWOTOWN WA 6003.",
  "Years",
  "Associate of Target",
  "Jean-Pierre Luc VASSEUR",
  "Warnings (Relevant) Nil Alerts Nil Linked Ops HARBOUR – Associate 2 WA MDL: Active – 222 Registered Vehicles 1BQ66 (WA) 2017 white Toyota Hilux utility. Linked Vehicles 1JPV33 (WA) 2021 grey Toyota Camry sedan.",
  "TELCO",
  "0400 777 888 PD - PD-H-8 LBS - LBS-H-8 EBM - EBM-H-8",
  "OTHER INFO",
  "Fictional clerk.",
  "SOCIAL MEDIA",
  "social.example/bram",
  "Teagan Rose McLEOD",
  "9 Gamma Street, THREETOWN WA 6004.",
  "Years",
  "Associate of Target",
  "Rhea Marie CALLOWAY",
  "Warnings (Relevant) Nil Alerts Nil Linked Ops HARBOUR – Associate 3 WA MDL: Active – 333 Registered Vehicles 1TRM77 (WA) 2023 grey Ford Ranger utility. Linked Vehicles 1RMC11 (WA) 2022 red Mazda CX-5 wagon.",
  "TELCO",
  "0400 999 000 PD - PD-H-7 LBS - LBS-H-7 EBM - EBM-H-7",
  "OTHER INFO",
  "Fictional contact.",
  "SOCIAL MEDIA",
  "social.example/teagan",
  "AOI 1: 10 Example Street, TESTVILLE WA 6000.",
  "Linked target: Rhea Marie CALLOWAY",
];
// The DOB the text layer lists apart from the card, for the associate whose name
// line carries none.
const PDF_TABLES = [
  { rows: [["DOB", "15/05/1991 | 35 Years"]] },
  { rows: [["DOB", "20/08/1997 | 29 Years"]] },
];

describe("a Tactical Profile PDF is read card by card", () => {
  const tables = tacticalTablesFromPdf(PARAGRAPHS, PDF_TABLES)!;

  it("recognises the template and builds the cards the Word reader would see", () => {
    expect(tables).not.toBeNull();
    const profile = readTacticalProfile(tables)!;
    expect(
      profile.cards.map(
        c => `${c.kind}:${c.name}${c.ownerName ? ` of ${c.ownerName}` : ""}`
      )
    ).toEqual([
      "target:Rhea Marie CALLOWAY",
      "target:Jean-Pierre Luc VASSEUR",
      "associate:Odette June MARLOWE of Rhea Marie CALLOWAY",
      "associate:Bram Anton QUILL of Jean-Pierre Luc VASSEUR",
      // A surname with a lower-case prefix (Mc / Mac) is a surname too.
      "associate:Teagan Rose McLEOD of Rhea Marie CALLOWAY",
    ]);
  });

  it("keeps each target's own addresses and vehicles apart", () => {
    const m = mapDocumentToTargetProfile({
      tables: PDF_TABLES,
      paragraphs: PARAGRAPHS,
      images: [],
    });
    const [rhea, jp] = [m, ...(m.additionalTargets ?? [])];
    expect(`${rhea.name?.firstNames} ${rhea.name?.surname}`).toBe(
      "Rhea Marie CALLOWAY"
    );
    expect(rhea.name?.bornDate).toBe("02/03/1988");
    expect(rhea.addresses.map(a => a.houseNo)).toEqual(["10", "5"]);
    // Her own four (one wrapped over three paragraphs) plus her linked one.
    expect(rhea.vehicles.map(v => v.registration).sort()).toEqual([
      "1LNK22",
      "1RMC11",
      "1RMD12",
    ]);
    expect(`${jp.name?.firstNames} ${jp.name?.surname}`).toBe(
      "Jean-Pierre Luc VASSEUR"
    );
    expect(jp.addresses.map(a => a.houseNo)).toEqual(["3", "4"]);
    expect(jp.vehicles.map(v => v.registration).sort()).toEqual([
      "1JPL44",
      "1JPV33",
    ]);
    expect(m.mdlStatus).toBe("active");
  });

  it("attributes every associate to the target they belong to, with their own details", () => {
    const m = mapDocumentToTargetProfile({
      tables: PDF_TABLES,
      paragraphs: PARAGRAPHS,
      images: [],
    });
    expect(
      m.associateBlocks.map(a => [
        `${a.firstNames} ${a.surname}`,
        a.ownerTargetName,
        a.address?.houseNo,
        a.vehicle?.registration,
        a.bornDate,
      ])
    ).toEqual([
      [
        "Odette June MARLOWE",
        "Rhea Marie CALLOWAY",
        "7",
        "1ODT55",
        "15/05/1991",
      ],
      [
        "Bram Anton QUILL",
        "Jean-Pierre Luc VASSEUR",
        "8",
        "1BQ66",
        "12/12/1990",
      ],
      [
        "Teagan Rose McLEOD",
        "Rhea Marie CALLOWAY",
        "9",
        "1TRM77",
        "20/08/1997",
      ],
    ]);
    // No pile of look-alike "people" for the review screen.
    expect(m.candidateEntities.filter(c => c.type === "person")).toEqual([]);
  });

  it("hands a telco value printed away from its label back to it", () => {
    const m = mapDocumentToTargetProfile({
      tables: PDF_TABLES,
      paragraphs: PARAGRAPHS,
      images: [],
    });
    const jp = (m.additionalTargets ?? [])[0];
    const telco = jp.unmappedFields.find(u => u.label === "Telco & intercept");
    expect(telco?.value).toContain("PD-HBR-2");
    expect(telco?.value).toContain("ACTIVE");
  });

  it("leaves a PDF that isn't a Tactical Profile alone", () => {
    expect(
      tacticalTablesFromPdf(["Some other document", "NAME John SMITH"], [])
    ).toBeNull();
    // A stray "Target" heading without the template's TELCO line is not a card.
    expect(
      tacticalTablesFromPdf(["Target", "John SMITH", "Notes"], [])
    ).toBeNull();
  });
});

describe("names with a hyphenated given name or a Mc / Mac surname", () => {
  it("are read as people", () => {
    for (const n of [
      "Amadou Jean-Baptiste TRAORE",
      "Jean-Pierre Luc VASSEUR",
      "Mary-Anne COOPER",
      "Anne-marie SMITH",
      "Hye Jin PARK",
      "Teagan Rose McLEOD",
      "Fiona MacDONALD",
      "Liam O'BRIEN",
    ]) {
      expect(matchWholeLinePersonName(n), n).not.toBeNull();
    }
    expect(matchWholeLinePersonName("Teagan Rose McLEOD")).toEqual({
      firstNames: "Teagan Rose",
      surname: "McLEOD",
    });
    expect(matchWholeLinePersonName("Amadou Jean-Baptiste TRAORE")).toEqual({
      firstNames: "Amadou Jean-Baptiste",
      surname: "TRAORE",
    });
  });
});

describe("the same photograph shown twice", () => {
  const photo = async (seed: number, name?: string) => {
    const raw = Buffer.alloc(120 * 150 * 3);
    for (let i = 0; i < raw.length; i++)
      raw[i] = Math.floor(
        128 + 100 * Math.sin(i * (0.0007 + seed * 0.0013) + seed * 1.7)
      );
    const png = await sharp(raw, {
      raw: { width: 120, height: 150, channels: 3 },
    })
      .png()
      .toBuffer();
    return {
      dataBase64: png.toString("base64"),
      mimeType: "image/png" as const,
      width: 120,
      height: 150,
      ...(name ? { captionName: name } : {}),
    } satisfies ExtractedDocumentImage;
  };

  it("keeps one copy — the captioned one — and never drops a different photo", async () => {
    const a = await photo(1, "Rhea Marie CALLOWAY");
    const b = await photo(2, "Odette June MARLOWE");
    const aAgain = await photo(1); // no caption
    const bAgain = await photo(2);
    const out = await dropRepeatedPhotos([a, b, aAgain, bAgain]);
    expect(out.map(i => i.captionName)).toEqual([
      "Rhea Marie CALLOWAY",
      "Odette June MARLOWE",
    ]);
    // Uncaptioned first, captioned later: the caption wins.
    const out2 = await dropRepeatedPhotos([await photo(1), a]);
    expect(out2).toHaveLength(1);
    expect(out2[0].captionName).toBe("Rhea Marie CALLOWAY");
  });

  it("leaves a list of different photos untouched", async () => {
    const imgs = [await photo(1), await photo(2), await photo(3)];
    expect(await dropRepeatedPhotos(imgs)).toHaveLength(3);
    expect(await dropRepeatedPhotos([])).toEqual([]);
  });
});
