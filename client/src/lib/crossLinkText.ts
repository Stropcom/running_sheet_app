/**
 * Wording for a cross-operation link between a target and another operation.
 * A link always says exactly WHAT is shared, not just that something is:
 * the registration number for a vehicle, the address in full for an address,
 * the person's name for an associate (see SharedEntityCrossLink in
 * server/db.ts).
 */
export type CrossLinkVia = "vehicle" | "address" | "associate";

/** Short chip text: "shared vehicle 1TDM414", "shared associate Tomas Ivo VARGA". */
export function sharedLinkChipText(via: CrossLinkVia, value: string): string {
  return `shared ${via} ${value}`.trim();
}

/** "registration 1TDM414" / "14 Willow Quay, EAST FREMANTLE WA" / "Tomas Ivo VARGA". */
export function sharedLinkSubject(via: CrossLinkVia, value: string): string {
  if (via === "vehicle") return `registration ${value}`;
  return value;
}

/** A full sentence for tooltips and exports. */
export function sharedLinkSentence(via: CrossLinkVia, value: string): string {
  switch (via) {
    case "vehicle":
      return `shares a registered vehicle — registration ${value}`;
    case "address":
      return `shares a registered address — ${value}`;
    case "associate":
      return `has an associate in common — ${value}`;
  }
}

/** Several links to the same operation, one per line, for a tooltip. */
export function sharedLinksTooltip(
  links: Array<{ via: CrossLinkVia; sharedValue: string }>
): string {
  return `Not formally linked — ${links
    .map(l => sharedLinkSentence(l.via, l.sharedValue))
    .join("; ")}`;
}
