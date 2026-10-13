import { createContext, useContext, useMemo, type ReactNode } from "react";

/**
 * "Which profiles am I already in?" — a profile page, plus any profiles opened
 * in place inside it. A link to a profile you are already looking at is no
 * use (an associate opened inside Navarro's profile doesn't need a link back
 * to Navarro), so profile sections drop those links.
 *
 * Kept in its own module so the profile components and ProfileDropdown can
 * share it without importing each other.
 */
export type HereKind =
  | "target"
  | "associate"
  | "vehicle"
  | "location"
  | "operation";

const HereContext = createContext<readonly string[]>([]);

/** Same person/vehicle/place however the label happens to be cased or spaced. */
export function hereKey(kind: HereKind, ref: number | string): string {
  return `${kind}:${String(ref).trim().toLowerCase()}`;
}

/** The profiles already open around this one, plus this one. */
export function useHere(kind: HereKind, ref: number | string) {
  const parent = useContext(HereContext);
  const key = hereKey(kind, ref);
  return useMemo(() => [...parent, key], [parent, key]);
}

/** The profiles open around this point in the tree (not counting a row's own target). */
export function useHereAbove() {
  return useContext(HereContext);
}

export function isHere(
  here: readonly string[],
  kind: HereKind,
  ref: number | string
): boolean {
  return here.includes(hereKey(kind, ref));
}

export function HereProvider({
  value,
  children,
}: {
  value: readonly string[];
  children: ReactNode;
}) {
  return <HereContext.Provider value={value}>{children}</HereContext.Provider>;
}
