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
    // Whole words only: removing "TAN" from "Stan TAN" must leave "Stan",
    // not "S" (which would then match "Susan TAN" and every other S-name).
    rest = rest.replace(
      new RegExp(`(?<![A-Za-z])${escapeRe(surname)}(?![A-Za-z])`, "ig"),
      " "
    );
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

/**
 * Regex flags for finding a person's surname alias as a bare word in text.
 *
 * Surnames are written in capitals on a running sheet ("PARK departed"), and
 * many surnames are also ordinary words — PARK (a car park), HILL, ROSE, TAN,
 * BANKS. Matching an all-caps alias case-insensitively credited the person
 * with every row that merely said "car park", then listed everyone else in
 * that row as their associate. So an all-caps alias only matches when it is
 * written in capitals; anything else keeps the old case-insensitive match.
 * The cost is under-reporting a surname typed in lower case, never a link
 * nobody wrote.
 */
export function aliasSearchFlags(term: string): "g" | "gi" {
  const hasUpper = /[A-Z]/.test(term);
  const hasLower = /[a-z]/.test(term);
  return hasUpper && !hasLower ? "g" : "gi";
}

/**
 * True when a mention names a DIFFERENT registered person who shares the
 * target's surname alias, and not the target themselves.
 *
 * "Hana PARK" is fuzzy-compatible with the target "Soo-Min Hana PARK" (the
 * given name is part of the target's), but if "Hana PARK" is itself a
 * registered person (an associate or another target) with exactly those given
 * names, the mention is that person. It must not be credited to the target.
 *
 * @param otherRegisteredNames full names of every other registered person
 *        who uses the same alias (not the target being matched)
 */
export function mentionIsOtherRegisteredPerson(
  mentionName: string,
  alias: string,
  targetName: string,
  otherRegisteredNames: readonly string[]
): boolean {
  const mention = givenNameWords(mentionName, alias).map(w => w.toUpperCase());
  if (mention.length === 0) return false; // a bare alias is nobody in particular
  const sameWords = (names: string[]) =>
    names.length === mention.length &&
    names.every(w => mention.includes(w.toUpperCase()));
  if (sameWords(givenNameWords(targetName, alias))) return false;
  return otherRegisteredNames.some(n => sameWords(givenNameWords(n, alias)));
}

/**
 * Which registered person a mention is, when a surname alias is shared.
 *
 * Several registered people (targets and associates) can use the same surname
 * alias ("Grace TAN (TAN)", "Greg TAN (TAN)"). Resolving "TAN" by whichever
 * was loaded first or last credits one of them with the other's sightings.
 * The rule, erring towards missing a mention:
 *
 *  - only one person uses the alias: the mention is them when their given
 *    names don't contradict (the long-standing rule);
 *  - more than one: a bare alias is nobody in particular, and a mention with
 *    given names is a person only when exactly ONE registered person with the
 *    alias fits it (so "G TAN", which fits both Grace and Greg, is nobody).
 *
 * @param candidateNames the registered names this lookup could return (the
 *        target names that carry the alias)
 * @param allRegisteredNames every registered person (targets and associates)
 *        who uses the alias
 * @returns the one candidate the mention is, or undefined
 */
export function pickRegisteredForAlias(
  mentionName: string,
  alias: string,
  candidateNames: readonly string[],
  allRegisteredNames: readonly string[]
): string | undefined {
  const distinct = (names: readonly string[]) => {
    const seen = new Map<string, string>();
    for (const n of names) {
      const k = plainName(n).toUpperCase();
      if (!seen.has(k)) seen.set(k, n);
    }
    return Array.from(seen.values());
  };
  const all = distinct([...allRegisteredNames, ...candidateNames]);
  const fits = (n: string) => aliasMentionCompatible(mentionName, alias, n);
  if (all.length <= 1) {
    const only = distinct(candidateNames)[0];
    return only && fits(only) ? only : undefined;
  }
  // Shared alias: a bare mention is nobody in particular.
  if (givenNameWords(mentionName, alias).length === 0) return undefined;
  const fitting = all.filter(fits);
  if (fitting.length !== 1) return undefined;
  return distinct(candidateNames).find(
    c => plainName(c).toUpperCase() === plainName(fitting[0]).toUpperCase()
  );
}

/** Capitalised words that open a sentence without being a given name. */
const NOT_A_GIVEN_NAME = new Set(
  (
    "Then Later Also Next Now Meanwhile After Before Once When While Soon " +
    "Shortly Suddenly Again Still However Eventually Observed Seen Sighted " +
    "Noted Subject Target Male Female The And But With Without Both Another " +
    "Mr Mrs Ms Miss Mx Dr Sir Madam Cafe Hotel Street Road Park Hill"
  )
    .split(" ")
    .map(w => w.toUpperCase())
);

/**
 * True when a bare surname alias ("TAN") is written straight after a
 * capitalised word that is a DIFFERENT given name from the registered
 * person's — "Lawrence TAN departed" is Lawrence TAN, not the registered
 * "Grace Olivia TAN". `before` is the text up to the alias.
 *
 * This holds at the start of a sentence too: "Lawrence TAN left." at the head
 * of a row used to count as the registered Grace, because the check only ran
 * mid-sentence. A capitalised word that is plainly not a name ("Then TAN
 * left") is skipped, so that still counts as the registered person.
 */
export function bareAliasFollowsOtherGivenName(
  before: string,
  alias: string,
  registeredName: string
): boolean {
  const prev = before.match(
    /(?:^|[\s(])([A-Z][a-z]{2,}(?:[-'][A-Za-z]+)?)\s+$/
  );
  if (!prev) return false;
  if (NOT_A_GIVEN_NAME.has(prev[1].toUpperCase())) return false;
  return !aliasMentionCompatible(`${prev[1]} ${alias}`, alias, registeredName);
}
