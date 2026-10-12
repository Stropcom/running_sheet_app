/**
 * Extra addresses on a target / associate registry record are stored as a JSON
 * array of {label?, full, short, …}. The optional label ("Work", "Girlfriend's",
 * "Safehouse") is typed in the Target Registry; these helpers are the one place
 * the profile pages and exports read it back, so the label always travels with
 * its address.
 */
export type ExtraAddress = {
  /** What the officer typed, trimmed; "" when there is none. */
  label: string;
  /** The address text; "" when the entry is empty. */
  value: string;
};

/** Every entry, in stored order (empty entries are kept so positions line up
 * with "Address 2, 3…" numbering). */
export function parseExtraAddresses(
  json: string | null | undefined
): ExtraAddress[] {
  if (!json) return [];
  try {
    const list: Array<{ label?: string; full?: string; short?: string }> =
      JSON.parse(json);
    return list.map(x => ({
      label: (x.label ?? "").trim(),
      value: x.full?.trim() || x.short?.trim() || "",
    }));
  } catch {
    return [];
  }
}

/** The heading for an extra address: its label, else "Address N". */
export function extraAddressHeading(label: string, number: number): string {
  return label || `Address ${number}`;
}

/** An address with its label in front — "Work — 12 Smith Street…" — or just
 * the address when there is no label. */
export function withAddressLabel(label: string, value: string): string {
  return label ? `${label} — ${value}` : value;
}
