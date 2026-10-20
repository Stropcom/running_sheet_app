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
    expect(o[0].inside).toBe("Rockingham Centre");
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

  it("makes one offer per person, from the place he last went into", () => {
    const o = enterNearbyOffers({
      ...base,
      walkIns: [
        { names: "ROCHA", location: "Rockingham Centre", rowId: 2 },
        { names: "ROCHA", location: "JB Hi-Fi Rockingham City", rowId: 3 },
      ],
      positionOf: p =>
        samePlace(p, "JB Hi-Fi Rockingham City") ? CENTRE : null,
      clickedAddress: "Kmart Rockingham",
    });
    expect(o).toHaveLength(1);
    expect(o[0].inside).toBe("JB Hi-Fi Rockingham City");
  });

  it("offers nothing for the shop he is already inside", () => {
    expect(
      enterNearbyOffers({
        ...base,
        walkIns: [
          { names: "ROCHA", location: "Rockingham Centre", rowId: 2 },
          { names: "ROCHA", location: "Woolworths Rockingham", rowId: 3 },
        ],
        clickedAddress: "Woolworths Rockingham",
      })
    ).toEqual([]);
  });
});

describe("the sentence it writes, read back by the logger", () => {
  const FULL =
    "ROCHA entered JB Hi-Fi Rockingham City, 1 Council Avenue, ROCKINGHAM WA (JB Hi-Fi Rockingham City) and continued out of sight.";

  it("puts him in the shop and leaves him logged inside the centre", () => {
    const r = scanWalkEvents([
      {
        id: 1,
        sheetId: 1,
        observation:
          "ROCHA exited the vehicle, entered Rockingham Centre and continued out of sight.",
      },
      { id: 2, sheetId: 1, observation: FULL },
    ]);
    expect(r.walkIns.map(w => w.location)).toEqual(
      expect.arrayContaining(["JB Hi-Fi Rockingham City", "Rockingham Centre"])
    );
    expect(r.placements[0]).toMatchObject({
      name: "ROCHA",
      inside: true,
      at: "JB Hi-Fi Rockingham City",
    });
  });
});
