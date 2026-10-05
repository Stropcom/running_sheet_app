// Deterministic check used before a person mention is folded into a
// registered Target / Associate by their bracket alias (e.g. "(TAN)").
//
// The bracket alias is only a SURNAME. Matching on it alone merged any new
// "Lawrence TAN (TAN)" into the registered "Grace Olivia TAN (TAN)" — two
// different people who simply share a surname. A mention may only be
// redirected to the registered person when their given names don't
// contradict each other: a bare alias ("TAN", "(TAN)") always matches, an
// initial matches a name starting with it ("G TAN" ~ "Grace"), a shortened
// name matches its longer form ("Greg" ~ "Gregory"), and anything else
// ("Lawrence" vs "Grace Olivia") is a different person.

const TITLES = new Set(["MR", "MRS", "MS", "MISS", "MX", "DR", "SIR", "MADAM"]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "Grace Olivia TAN, born 1 May 1990 (TAN)" → "Grace Olivia TAN". */
function plainName(name: string): string {
  return name
    .split(/,\s*born\b/i)[0]
    .replace(/\s*\([^()]*\)\s*$/, "")
    .trim();
}

/** The given-name words of `fullName` once the surname alias is removed. */
export function givenNameWords(fullName: string, alias: string): string[] {
  // "P.HILL"-style aliases: the surname is the part after the initials.
  const surname = alias.trim().replace(/^(?:[A-Za-z]\.)+/, "");
  let rest = plainName(fullName);
  if (surname) {
    rest = rest.replace(new RegExp(escapeRe(surname), "ig"), " ");
  }
  return rest
    .split(/[\s]+/)
    .map(w => w.replace(/[.,]/g, "").trim())
    .filter(w => w && !TITLES.has(w.toUpperCase()));
}

function wordsCompatible(a: string, b: string): boolean {
  const A = a.toUpperCase();
  const B = b.toUpperCase();
  if (A === B) return true;
  // An initial stands for any name beginning with it.
  if (A.length === 1) return B.startsWith(A);
  if (B.length === 1) return A.startsWith(B);
  // A shortened form of the same name (Greg / Gregory, Matt / Matthew).
  const shorter = A.length <= B.length ? A : B;
  const longer = A.length <= B.length ? B : A;
  return shorter.length >= 3 && longer.startsWith(shorter);
}

/**
 * True when a mention may be treated as the registered person.
 *
 * @param mentionName the person as written in the observation ("Lawrence TAN")
 * @param alias       the bracket surname that matched ("TAN")
 * @param registeredName the registered record's full name
 */
export function aliasMentionCompatible(
  mentionName: string,
  alias: string,
  registeredName: string
): boolean {
  const mention = givenNameWords(mentionName, alias);
  if (mention.length === 0) return true; // the bare alias on its own
  const registered = givenNameWords(registeredName, alias);
  if (registered.length === 0) return true; // nothing on file to contradict
  return mention.every(m => registered.some(r => wordsCompatible(m, r)));
}
