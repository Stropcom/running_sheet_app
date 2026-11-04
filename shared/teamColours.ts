/**
 * Team colours: one source. A team's colour is the one set in User Management
 * → Teams (`teams.colour`); every screen that draws a team in its colour (the
 * CTO Weekly Tasking and its PDF, the Team Duty Roster sections, and the map
 * pins) reads it from there, so changing it in User Management changes it
 * everywhere. Screens that only know a team by NAME (the CTO roster and the
 * tasking rows are "Team 1", "Team 2", "PTT", "Capability") look it up by
 * name within the Command. A team with no match or no colour keeps the colour
 * it always had, so nothing goes grey. Pure and tested
 * (server/teamColours.test.ts).
 */

export interface NamedTeamColour {
  name: string;
  colour: string | null;
}

/** What the four standing teams were drawn in before colours were editable;
 * used only when User Management has no colour for that team name. */
export const DEFAULT_TEAM_COLOURS: Record<string, string> = {
  "team 1": "#ec4899",
  "team 2": "#1976d2",
  ptt: "#f9a825",
  capability: "#7c3aed",
  oic: "#374151",
};

/** A team with no colour anywhere (the map's "no team" grey). */
export const FALLBACK_TEAM_COLOUR = "#6b7280";

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHexColour = (v: unknown): v is string =>
  typeof v === "string" && HEX.test(v);

const norm = (s: string) => s.trim().toLowerCase();

/** The colour for a team name: User Management's colour for the team of that
 * name, else the standing default for that name, else grey. */
export function teamColourFor(
  teams: readonly NamedTeamColour[],
  name: string
): string {
  const key = norm(name);
  const hit = teams.find(t => norm(t.name) === key && isHexColour(t.colour));
  if (hit) return hit.colour as string;
  return DEFAULT_TEAM_COLOURS[key] ?? FALLBACK_TEAM_COLOUR;
}

function rgb(hex: string): [number, number, number] {
  const h = (isHexColour(hex) ? hex : FALLBACK_TEAM_COLOUR).slice(1);
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}
const toHex = (c: [number, number, number]) =>
  "#" + c.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");

/** The colour mixed toward white (`amount` 0 to 1). */
export const tintOf = (hex: string, amount: number) =>
  toHex(rgb(hex).map(v => v + (255 - v) * amount) as [number, number, number]);

/** The colour mixed toward black (`amount` 0 to 1). */
export const shadeOf = (hex: string, amount: number) =>
  toHex(rgb(hex).map(v => v * (1 - amount)) as [number, number, number]);

/** The even mix of two colours. */
export function mixHex(a: string, b: string): string {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(
    [0, 1, 2].map(i => (x[i] + y[i]) / 2) as [number, number, number]
  );
}

/** Black or white, whichever reads on the colour. */
export function readableOn(hex: string): "#ffffff" | "#0f172a" {
  const [r, g, b] = rgb(hex).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.35 ? "#0f172a" : "#ffffff";
}

/** The pale fill, strong border and dark text a team panel is drawn with. */
export function teamShades(hex: string): {
  bg: string;
  border: string;
  text: string;
} {
  const colour = isHexColour(hex) ? hex : FALLBACK_TEAM_COLOUR;
  return {
    bg: tintOf(colour, 0.86),
    border: colour,
    text: shadeOf(colour, 0.55),
  };
}

/** A left-to-right split of two team colours, for the day Team 1 and Team 2
 * work as one: a strong swatch and a pale band. */
export function blendGradients(
  a: string,
  b: string
): { swatch: string; band: string } {
  return {
    swatch: `linear-gradient(90deg, ${a} 0 50%, ${b} 50% 100%)`,
    band: `linear-gradient(90deg, ${tintOf(a, 0.86)} 0 50%, ${tintOf(b, 0.86)} 50% 100%)`,
  };
}
