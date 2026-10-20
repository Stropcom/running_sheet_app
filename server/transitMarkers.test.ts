import { describe, expect, it } from "vitest";
import {
  MARKER_COLOURS,
  MARKER_ICON_GROUPS,
  MARKER_ICON_LABELS,
  getMarkerSvg,
  type MarkerIcon,
} from "@/lib/markerSvgs";
import { markerKind } from "@shared/flagMarker";

const SIGNS: MarkerIcon[] = ["bus_stop", "train_station"];
const VEHICLES: MarkerIcon[] = ["bus", "train", "taxi", "rideshare"];
const NEW_ICONS: MarkerIcon[] = [...SIGNS, ...VEHICLES];

describe("public transport and hire markers (Surveillance set)", () => {
  it("are offered in the picker, in one group", () => {
    const group = MARKER_ICON_GROUPS.find(
      g => g.label === "Public Transport & Hire"
    );
    expect(group?.icons).toEqual(NEW_ICONS);
  });

  it("have a label", () => {
    expect(MARKER_ICON_LABELS.bus).toBe("Bus");
    expect(MARKER_ICON_LABELS.train).toBe("Train");
    expect(MARKER_ICON_LABELS.taxi).toBe("Taxi");
    expect(MARKER_ICON_LABELS.rideshare).toBe("Rideshare (Uber)");
    expect(MARKER_ICON_LABELS.bus_stop).toBe("Bus Stop Sign");
    expect(MARKER_ICON_LABELS.train_station).toBe("Train Station Sign");
  });

  it("draw in every swatch colour, and the colour is used", () => {
    for (const icon of NEW_ICONS) {
      for (const [name, hex] of Object.entries(MARKER_COLOURS)) {
        const svg = getMarkerSvg(icon, name as keyof typeof MARKER_COLOURS);
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg.endsWith("</svg>")).toBe(true);
        expect(svg).toContain(hex);
      }
    }
  });

  it("taxi and rideshare are the sedan with something on the roof", () => {
    expect(getMarkerSvg("taxi", "blue")).toContain("TAXI");
    expect(getMarkerSvg("rideshare", "blue")).not.toContain("TAXI");
    expect(getMarkerSvg("rideshare", "blue")).toContain("<circle");
  });

  it("count as vehicle markers for the target flag", () => {
    for (const icon of VEHICLES) expect(markerKind(icon)).toBe("vehicle");
  });

  it("the signs count as place markers, so the flag goes on the stop", () => {
    for (const icon of SIGNS) expect(markerKind(icon)).toBe("place");
  });
});
