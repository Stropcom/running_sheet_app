import type { ContinuityCardData } from "@/components/ContinuityCards";
import type { TargetPosition } from "@shared/targetPosition";

/** Where he was last seen, in words: "inside Rockingham Centre",
 * "in 1ROC85 · Rockingham Centre". Empty when the sheet never said. */
export function lastSeenWording(pos: TargetPosition | null): string {
  if (!pos) return "";
  if (pos.state === "inside" && pos.place) return `inside ${pos.place}`;
  return pos.place ? `${pos.label} · ${pos.place}` : pos.label;
}

/**
 * The one card the Target Logger shows once the surveillance has ended — every
 * member of the team has ceased (shared/surveillanceState.ts). It replaces the
 * live cards, has no movement chips, and one chip to start again.
 */
export function endedContinuityCard(input: {
  who: string;
  time: string | null;
  position: TargetPosition | null;
}): ContinuityCardData {
  const at = input.time ? ` ${input.time}` : "";
  const seen = lastSeenWording(input.position);
  const state = seen ? `Last seen ${seen}` : "Last known position not logged";
  return {
    key: "surveillance-ended",
    title: input.who,
    pill: "Ceased",
    ended: true,
    who: `Surveillance ceased${at}`,
    state,
    actions: [
      {
        key: "surveillance-commence",
        label: "Surveillance commenced",
        text: "Surveillance commenced at [location].",
      },
    ],
    latestRowId: Number.MAX_SAFE_INTEGER,
    isTarget: true,
    people: input.position?.people.length ? input.position.people : [input.who],
    locus: {
      headline: `Surveillance ceased${at}`,
      sub: state,
    },
  };
}
