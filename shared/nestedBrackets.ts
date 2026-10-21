// A place whose own name carries a bracket — "NAB Victoria Park WA Expert
// Centre (Tellerless)" — breaks the bracket convention when its short form is
// written the usual way: "… WA (NAB Victoria Park WA Expert Centre
// (Tellerless))". A bracket can't hold a bracket, so the reader took the inner
// "(Tellerless)" as the place's short form and never saw the real one: no
// location was registered, no pin, and the Target Logger said "Inside
// Tellerless". This flattens the name for reading — "(…(Y))" becomes "(… Y)"
// and every other "(Y)" that only repeats that inner word becomes plain text —
// without changing what is stored. Deterministic, nothing else is touched.

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The name as written, with a bracket inside a bracket folded into the words. */
export function flattenNestedBrackets(text: string): string {
  if (!text || text.indexOf("(") === -1) return text;
  const inners: string[] = [];
  let out = text.replace(
    /\(([^()]*?)\s*\(([^()]+)\)\s*\)/g,
    (_m, outer: string, inner: string) => {
      inners.push(inner.trim());
      return `(${outer.trim()} ${inner.trim()})`;
    }
  );
  if (inners.length === 0) return text;
  for (const inner of inners) {
    out = out.replace(
      new RegExp(`[ \\t]*\\(${escapeRe(inner)}\\)`, "g"),
      ` ${inner}`
    );
  }
  return out;
}

/** A place name for writing into an observation: its own brackets become words
 * ("Expert Centre (Tellerless)" → "Expert Centre Tellerless"). */
export function placeNameWithoutBrackets(name: string): string {
  return (name ?? "")
    .replace(/\s*\(([^()]*)\)/g, " $1")
    .replace(/\s+/g, " ")
    .trim();
}
