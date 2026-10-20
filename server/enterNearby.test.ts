import { describe, expect, it } from "vitest";
import { enterNearbyOffers } from "@shared/enterNearby";
import { samePlace } from "@shared/targetPosition";
import { scanWalkEvents } from "@shared/walkEventPatterns";

const CENTRE = { lat: -32.2815, lng: 115.7358 };
const WOOLIES = { lat: -32.2823, lng: 115.7371 }; // about 150 m away
const FAR_HOUSE = { lat: -32.3, lng: 115.8 };

const at = (place: string) =>
  samePlace(place, "Rockingham Centre") ? CENTRE : null;
const base = {
  walkIns: [{ names: "ROCHA", location: "Rockingham Centre", rowId: 2 }],
  clicked: WOOLIES,
  clickedAddress: "Woolworths Rockingham",
  same: samePlace,
  positionOf: at,
};

describe("enterNearbyOffers", () => {
  it("offers the shop clicked while he is inside the centre", () => {
    const o = enterNearbyOffers(base);
    expect(o).toHaveLength(1);
    expect(o[0].names).toBe("ROCHA");
    expect(o[0].clickedLabel).toBe("Woolworths Rockingham, Rockingham Centre");
    expect(o[0].metres).toBeLessThan(400);
  });

  it("offers nothing for a click on the place he is already inside", () => {
    expect(
      enterNearbyOffers({ ...base, clickedAddress: "Rockingham Centre" })
    ).toEqual([]);
  });

  it("offers nothing when the click is far from where he is", () => {
    expect(enterNearbyOffers({ ...base, clicked: FAR_HOUSE })).toEqual([]);
  });

  it("offers nothing when the click or his place has no position", () => {
    expect(enterNearbyOffers({ ...base, clicked: null })).toEqual([]);
    expect(enterNearbyOffers({ ...base, positionOf: () => null })).toEqual([]);
  });

  it("offers nothing from a place on the exclude list (his own home)", () => {
    expect(
      enterNearbyOffers({
        ...base,
        exclude: p => samePlace(p, "Rockingham Centre"),
      })
    ).toEqual([]);
  });

  it("goes from the centre, not the shop he is already in", () => {
    const o = enterNearbyOffers({
      ...base,
      walkIns: [
        { names: "ROCHA", location: "Rockingham Centre", rowId: 2 },
        {
          names: "ROCHA",
          location: "Woolworths Rockingham, Rockingham Centre",
          rowId: 3,
        },
      ],
      clickedAddress: "Kmart Rockingham",
    });
    expect(o).toHaveLength(1);
    expect(o[0].clickedLabel).toBe("Kmart Rockingham, Rockingham Centre");
  });

  it("offers nothing for the shop he is already inside", () => {
    expect(
      enterNearbyOffers({
        ...base,
        walkIns: [
          { names: "ROCHA", location: "Rockingham Centre", rowId: 2 },
          {
            names: "ROCHA",
            location: "Woolworths Rockingham, Rockingham Centre",
            rowId: 3,
          },
        ],
      })
    ).toEqual([]);
  });

  it("does not repeat the centre when the clicked label already names it", () => {
    const o = enterNearbyOffers({
      ...base,
      clickedAddress: "Woolworths Rockingham Centre",
    });
    expect(o[0].clickedLabel).toBe("Woolworths Rockingham Centre");
  });
});

describe("the sentence it writes, read back by the logger", () => {
  it("keeps him inside the centre as well as the shop, with the shop newest", () => {
    const r = scanWalkEvents([
      {
        id: 1,
        sheetId: 1,
        observation:
          "ROCHA exited the vehicle, entered Rockingham Centre and continued out of sight.",
      },
      {
        id: 2,
        sheetId: 1,
        observation:
          "ROCHA entered Woolworths Rockingham, Rockingham Centre and continued out of sight.",
      },
    ]);
    expect(r.walkIns.map(w => w.location)).toContain("Rockingham Centre");
    expect(r.placements[0]).toMatchObject({
      name: "ROCHA",
      inside: true,
      at: "Woolworths Rockingham, Rockingham Centre",
    });
    // the centre's own cards still find him there
    expect(
      samePlace(
        "Rockingham Centre",
        r.walkIns.find(w => w.rowId === 2)!.location
      )
    ).toBe(true);
  });
});
