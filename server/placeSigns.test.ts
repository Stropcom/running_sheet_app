import { describe, expect, it } from "vitest";
import {
  PLACE_SIGN_ICONS,
  placeSignFor,
  placeSignFromTypes,
  placeSignOfName,
  signIconOf,
} from "@shared/placeSigns";
import {
  MARKER_COLOURS,
  MARKER_ICON_GROUPS,
  MARKER_ICON_LABELS,
  getMarkerSvg,
} from "@/lib/markerSvgs";
import { markerKind } from "@shared/flagMarker";

describe("place signs by how the place is written", () => {
  it("tags the name, not the street part of the label", () => {
    expect(
      placeSignOfName(
        "Commonwealth Bank East Victoria Park Branch, Shop 19 The Park Centre, 789 Albany Highway, EAST VICTORIA PARK"
      )
    ).toBe("place_bank");
    expect(
      placeSignOfName("NAB Victoria Park WA Expert Centre, 789 Albany Highway")
    ).toBe("place_bank");
    expect(placeSignOfName("Bicton Tavern, 1 Point Walter Road, BICTON")).toBe(
      "place_pub"
    );
    expect(placeSignOfName("Fitness First Perth, 250 Hay Street")).toBe(
      "place_gym"
    );
    expect(placeSignOfName("Australia Post Fremantle, 1 High Street")).toBe(
      "place_post_office"
    );
    expect(placeSignOfName("Rockingham Shopping Centre, Council Avenue")).toBe(
      "place_shopping_centre"
    );
    expect(placeSignOfName("Commonwealth Bank ATM")).toBe("place_bank");
  });

  it("a motel, resort or known hotel brand is accommodation", () => {
    expect(placeSignOfName("Cottesloe Beach Motel, 1 Marine Parade")).toBe(
      "place_hotel"
    );
    expect(placeSignOfName("Ibis Styles Hotel Perth")).toBe("place_hotel");
  });

  it("a bare 'Hotel' is left to Google's type, never guessed", () => {
    expect(placeSignOfName("Esplanade Hotel, Marine Terrace")).toBeNull();
    expect(placeSignOfName("Post Office Hotel, High Street")).toBeNull();
  });

  it("a name that starts with a number is still a name", () => {
    expect(
      placeSignOfName("8 Knots Tavern, 110 Riverside Road, EAST FREMANTLE")
    ).toBe("place_pub");
    expect(placeSignOfName("12 Bank St, PERTH")).toBeNull();
  });

  it("never tags a street address or a street named after a place", () => {
    expect(placeSignOfName("27 Olding Way, FREMANTLE")).toBeNull();
    expect(placeSignOfName("Bank Street, PERTH")).toBeNull();
    expect(placeSignOfName("Hay Street Mall")).toBeNull();
    expect(placeSignOfName("123 Bank Road")).toBeNull();
    expect(
      placeSignOfName("Shop 19 The Park Centre, 789 Albany Highway")
    ).toBeNull();
    expect(placeSignOfName("")).toBeNull();
  });

  it("ordinary words don't tag", () => {
    expect(placeSignOfName("Blood Bank")).toBeNull();
    expect(placeSignOfName("Salad Bar")).toBeNull();
    expect(placeSignOfName("Masonic Lodge")).toBeNull();
    expect(placeSignOfName("Medical Centre")).toBeNull();
    expect(placeSignOfName("Riverbank Park")).toBeNull();
  });
});

describe("cafe, restaurant, fast food and airport signs", () => {
  it("by wording", () => {
    expect(placeSignOfName("Highway Cafe, 12 Hay Street, PERTH")).toBe(
      "place_cafe"
    );
    expect(placeSignOfName("Caf\u00e9 Rosso, 3 Beaufort Street")).toBe(
      "place_cafe"
    );
    expect(placeSignOfName("Crooked Spire Coffee & Art House, Midland")).toBe(
      "place_cafe"
    );
    expect(placeSignOfName("Mama's Italian Restaurant, 4 High Street")).toBe(
      "place_restaurant"
    );
    expect(placeSignOfName("The Boatshed Grill")).toBe("place_restaurant");
    expect(placeSignOfName("McDonald's Fremantle, 1 High Street")).toBe(
      "place_fast_food"
    );
    expect(placeSignOfName("Hungry Jack\u2019s Cannington")).toBe(
      "place_fast_food"
    );
    expect(placeSignOfName("Fish & Chips on the Beach")).toBe(
      "place_fast_food"
    );
    expect(placeSignOfName("Perth Airport, Airport Drive")).toBe(
      "place_airport"
    );
    expect(placeSignOfName("Perth International Terminal")).toBe(
      "place_airport"
    );
  });

  it("an airport's hotel, car park or station is not the airport", () => {
    expect(placeSignOfName("Perth Airport Hotel")).toBeNull();
    expect(placeSignOfName("Airport Car Park, Perth")).toBeNull();
    expect(placeSignOfName("Perth Airport Central Station")).toBeNull();
    expect(placeSignOfName("Airport Motel")).toBe("place_hotel");
    expect(placeSignOfName("Airport Road, REDCLIFFE")).toBeNull();
    expect(placeSignOfName("Airport Cafe, Perth")).toBe("place_cafe");
  });

  it("a numbered terminal is an airport terminal only when its locality says airport", () => {
    for (const n of ["1", "2", "3", "4"])
      expect(
        placeSignOfName(`Terminal ${n}, Perth Airport WA 6105, Australia`),
        n
      ).toBe("place_airport");
    expect(placeSignOfName("Terminal 3 Domestic, Perth Airport WA 6105")).toBe(
      "place_airport"
    );
    expect(placeSignOfName("Terminal 2, Brisbane Airport QLD 4008")).toBe(
      "place_airport"
    );
    // the finished wording, with its own bracket short form
    expect(placeSignOfName("Terminal 4, PERTH AIRPORT WA (Terminal 4)")).toBe(
      "place_airport"
    );
    // never guessed
    expect(placeSignOfName("Terminal 1")).toBeNull();
    expect(placeSignOfName("Terminal 1, Fremantle Port WA 6160")).toBeNull();
    expect(placeSignOfName("Terminal 2, Perth Bus Station WA 6000")).toBeNull();
    // a street named for the airport is not the airport
    expect(placeSignOfName("Terminal 4, Airport Drive, Redcliffe")).toBeNull();
    expect(
      placeSignOfName("Terminal 4 Car Park, Perth Airport WA 6105")
    ).toBeNull();
  });

  it("supermarkets: by name and by Google's type", () => {
    for (const label of [
      "Woolworths Karrinyup, Karrinyup Shopping Centre Dr",
      "Coles Victoria Park, 1 Albany Hwy",
      "ALDI Cannington",
      "IGA Fremantle",
      "Foodland Rockingham",
      "Harris Farm Markets Cottesloe",
      "Spudshed Joondalup",
      "Mt Lawley Supermarket, Beaufort Street",
    ])
      expect(placeSignOfName(label), label).toBe("place_supermarket");
    expect(placeSignFromTypes(["supermarket", "grocery_store", "food"])).toBe(
      "place_supermarket"
    );
    expect(placeSignFromTypes(["grocery_store", "food"])).toBe(
      "place_supermarket"
    );
  });

  it("a chain's petrol station, liquor store or head office is not a supermarket; a town or street is not a shop", () => {
    for (const label of [
      "Coles Express, 5 Albany Hwy",
      "Woolworths Petrol Cannington",
      "BWS Cannington",
      "Dan Murphy's Belmont",
      "Woolworths Distribution Centre, Perth Airport",
      "Coles Bay",
      "Coles Road, BELMONT",
      "Woolworths Pharmacy Karrinyup",
    ])
      expect(placeSignOfName(label), label).not.toBe("place_supermarket");
    // a supermarket the officer reaches through a mall tap stays the mall
    expect(placeSignFromTypes(["shopping_mall", "supermarket"])).toBe(
      "place_shopping_centre"
    );
    // a petrol station that Google also calls a grocery store
    expect(
      placeSignFromTypes(["gas_station", "grocery_store"], "Coles Express")
    ).toBeNull();
    // Karrinyup Shopping Centre is the centre, not the supermarket in it
    expect(placeSignOfName("Karrinyup Shopping Centre, Karrinyup")).toBe(
      "place_shopping_centre"
    );
  });

  it("a pub with a grill stays a pub; a street stays a street", () => {
    expect(placeSignOfName("Bicton Tavern & Grill")).toBe("place_pub");
    expect(placeSignOfName("Burger Street, PERTH")).toBeNull();
    expect(placeSignOfName("Subway Station")).toBeNull();
  });

  it("by Google's type", () => {
    expect(placeSignFromTypes(["airport", "point_of_interest"])).toBe(
      "place_airport"
    );
    expect(placeSignFromTypes(["cafe", "food"])).toBe("place_cafe");
    expect(placeSignFromTypes(["restaurant", "food"])).toBe("place_restaurant");
    expect(placeSignFromTypes(["fast_food_restaurant", "restaurant"])).toBe(
      "place_fast_food"
    );
    expect(placeSignFromTypes(["meal_takeaway", "food"])).toBe(
      "place_fast_food"
    );
    // A pub with a restaurant, a hotel with one, stay what they are.
    expect(placeSignFromTypes(["bar", "restaurant"])).toBe("place_pub");
    expect(placeSignFromTypes(["lodging", "restaurant"])).toBe("place_hotel");
  });

  it("both cafe and restaurant: a cafe only when the name says so", () => {
    expect(placeSignFromTypes(["cafe", "restaurant"], "Lucky Bay Cafe")).toBe(
      "place_cafe"
    );
    expect(placeSignFromTypes(["cafe", "restaurant"], "Lucky Bay")).toBe(
      "place_restaurant"
    );
    expect(
      placeSignFromTypes(["restaurant", "cafe"], "Roasted Coffee House")
    ).toBe("place_cafe");
  });
});

describe("place signs by Google's type", () => {
  it("maps the six types", () => {
    expect(placeSignFromTypes(["bank", "finance"])).toBe("place_bank");
    expect(placeSignFromTypes(["atm"])).toBe("place_bank");
    expect(placeSignFromTypes(["post_office"])).toBe("place_post_office");
    expect(placeSignFromTypes(["bar", "restaurant"])).toBe("place_pub");
    expect(placeSignFromTypes(["lodging"])).toBe("place_hotel");
    expect(placeSignFromTypes(["gym", "health"])).toBe("place_gym");
    expect(placeSignFromTypes(["shopping_mall"])).toBe("place_shopping_centre");
    expect(placeSignFromTypes(["book_store"])).toBeNull();
    expect(placeSignFromTypes(undefined)).toBeNull();
  });

  it("lodging settles a hotel, a bar settles a pub", () => {
    expect(placeSignFromTypes(["lodging"], "Esplanade Hotel")).toBe(
      "place_hotel"
    );
    expect(placeSignFromTypes(["bar"], "Esplanade Hotel")).toBe("place_pub");
  });

  it("both types: a pub unless the name says accommodation", () => {
    expect(placeSignFromTypes(["lodging", "bar"], "Esplanade Hotel")).toBe(
      "place_pub"
    );
    expect(placeSignFromTypes(["lodging", "bar"], "Ibis Styles Hotel")).toBe(
      "place_hotel"
    );
    expect(placeSignFromTypes(["lodging", "bar"], "Beach Motel")).toBe(
      "place_hotel"
    );
  });

  it("types first, then the wording", () => {
    expect(placeSignFor("Bicton Tavern", [])).toBe("place_pub");
    expect(placeSignFor("Esplanade Hotel", ["bar"])).toBe("place_pub");
    expect(placeSignFor("Esplanade Hotel", [])).toBeNull();
  });

  it("the default pin: transit signs first, then place signs", () => {
    expect(signIconOf("Bus Stop Grange Drive After Gascoyne Way")).toBe(
      "bus_stop"
    );
    expect(signIconOf("Bicton Tavern, 1 Point Walter Road")).toBe("place_pub");
    expect(signIconOf("27 Olding Way")).toBeNull();
  });
});

describe("the place sign markers", () => {
  it("are offered in the picker, in one group", () => {
    const group = MARKER_ICON_GROUPS.find(g => g.label === "Places");
    expect(group?.icons).toEqual(PLACE_SIGN_ICONS);
  });

  it("have labels and draw in every swatch colour", () => {
    for (const icon of PLACE_SIGN_ICONS) {
      expect(MARKER_ICON_LABELS[icon]).toMatch(/Sign$/);
      for (const [name, hex] of Object.entries(MARKER_COLOURS)) {
        const svg = getMarkerSvg(icon, name as keyof typeof MARKER_COLOURS);
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg.endsWith("</svg>")).toBe(true);
        expect(svg).toContain(hex);
      }
    }
  });

  it("count as place markers for the target flag", () => {
    for (const icon of PLACE_SIGN_ICONS) expect(markerKind(icon)).toBe("place");
  });
});
