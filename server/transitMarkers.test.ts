import { describe, expect, it } from "vitest";
import {
  MARKER_COLOURS,
  MARKER_ICON_GROUPS,
  MARKER_ICON_LABELS,
  getMarkerSvg,
  type MarkerIcon,
} from "@/lib/markerSvgs";
import { markerKind } from "@shared/flagMarker";

const NEW_ICONS: MarkerIcon[] = ["bus", "train", "taxi", "rideshare"];

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
    for (const icon of NEW_ICONS) expect(markerKind(icon)).toBe("vehicle");
  });
});
