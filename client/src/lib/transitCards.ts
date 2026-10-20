// Target Logger cards and chips for buses and trains. Shared by the running
// sheet's panel (SheetDetail.tsx) and the RS Quick Entry card
// (IntelligenceMapping.tsx) so the two read the same. The rules for what a row
// means live in shared/transitPatterns.ts and shared/walkEventPatterns.ts;
// this only turns who-is-where into cards and chips.
import type {
  ContinuityAction,
  ContinuityCardData,
} from "@/components/ContinuityCards";
import { surnameTokens } from "@shared/walkEventPatterns";
import { transitMode } from "@shared/transitPatterns";
import { transitKindOfPlace, type TransitKind } from "@shared/transitPlace";

const KIND_WORD: Record<TransitKind, string> = { bus: "bus", train: "train" };

/** "Boarded bus" / "Boarded train" for someone logged at a bus stop or a
 * train station — nothing for any other place. `names` is already written the
 * way the sentence should (surnames shortened once a person has been named). */
export function transitBoardActions(opts: {
  keyBase: string;
  names: string;
  place: string;
}): ContinuityAction[] {
  const kind = transitKindOfPlace(opts.place);
  if (!kind) return [];
  const word = KIND_WORD[kind];
  return [
    {
      key: `brd-${opts.keyBase}`,
      label: `Boarded ${word}`,
      text: `${opts.names} boarded a ${word} at ${opts.place}.`,
    },
  ];
}

interface PlacementLike {
  name: string;
  rowId: number;
  at?: string;
  transit?: string;
}

/** One card per bus / train that people are aboard — "On a bus", "On a
 * train" — shown wherever the sheet is, until a row says they got off. Where
 * it is can't be told from the row, so it is where they boarded (the stop or
 * station), or else where they were last logged. */
export function onTransitCards(opts: {
  placements: readonly PlacementLike[];
  sinceText?: (rowId: number) => string;
  /** Short surnames once a person has been named in the entry. */
  shorten: (names: string) => string;
  /** When the entry was opened from a click on a stop or station: its full
   * address, so "Alighted" can say where. */
  hereAddress?: string;
}): ContinuityCardData[] {
  const since = opts.sinceText ?? (() => "");
  const byTransit = new Map<string, PlacementLike[]>();
  for (const p of opts.placements) {
    if (!p.transit) continue;
    const k = p.transit.toLowerCase();
    byTransit.set(k, [...(byTransit.get(k) ?? []), p]);
  }
  const cards: ContinuityCardData[] = [];
  byTransit.forEach((ps, tk) => {
    const transit = ps[0].transit ?? tk;
    const names = ps.map(p => p.name);
    const at = ps.find(p => p.at)?.at;
    const rowId = Math.max(...ps.map(p => p.rowId));
    const mode = transitMode(transit);
    const where = at
      ? `${transitKindOfPlace(at) ? "Boarded at" : "Last seen at"} ${at}${since(rowId)}`
      : `Position not logged${since(rowId)}`;
    const who = opts.shorten(names.join(" and "));
    cards.push({
      key: `trn-${tk}`,
      title: names.join(" and "),
      pill: `On a ${mode}`,
      attn: true,
      who: `${names.join(", ")} on ${transit}`,
      state: where,
      actions: [
        {
          key: `trn-off-${tk}`,
          label: opts.hereAddress ? "Alighted here" : "Alighted",
          text: `${who} alighted from ${transit} at ${opts.hereAddress ?? "[location]"}.`,
        },
        {
          key: `trn-walk-${tk}`,
          label: "Alighted, walked on",
          text: `${who} alighted from ${transit} and walked [route] towards [location].`,
        },
      ],
      latestRowId: rowId,
      holds: names.flatMap(n => surnameTokens(n)),
      people: names,
      locus: { headline: `On ${transit}`, sub: where },
    });
  });
  return cards;
}

/** Wording for a card that follows someone getting off a bus or train. */
export function alightedWording(h: {
  fromTransit?: string;
  from: string;
}): { left: string } | null {
  if (!h.fromTransit) return null;
  return {
    left: `Got off ${h.fromTransit}${h.from ? ` at ${h.from}` : ""}`,
  };
}
