// Cues of "new intelligence" in a running-sheet sentence: items carried,
// devices, money, meetings and exchanges, and behaviour — the things a target
// does or uses beyond simply going from A to B.
//
// TRIAL VERSION. This is a reviewed list of wording, nothing else: it matches
// the officers' own words, runs fully offline and gives the same answer every
// time (no AI, no guessing). It is NOT wired into any screen yet; the trial
// script (scripts/dev/intel-cue-trial.ts) runs it over real sheets so the list
// can be tuned before anything is built on it.
//
// Rules it keeps (this is an evidentiary record — err towards missing a cue):
//  - a cue must be in the sentence the officer wrote, and the sentence travels
//    with the cue so a supervisor can see exactly where it came from;
//  - a sentence that says it did NOT happen ("did not use his phone",
//    "no bags") gives no cue;
//  - quoted speech gives no cue;
//  - wording that is unsure ("appeared to", "possibly") still gives the cue
//    but marks it `doubtful`;
//  - a place that merely has the word in its name ("phone box", "post box")
//    is not the thing.

export type CueCategory =
  | "items"
  | "devices"
  | "money"
  | "meetings"
  | "behaviour";

export interface IntelCue {
  category: CueCategory;
  /** Short heading, e.g. "Brown suitcase", "ATM withdrawal". */
  heading: string;
  /** What repeats are counted by: the item itself without its colour or size
   * ("suitcase" for a brown, black or blue suitcase), else the heading. A
   * repeated item or action can be the target's MO. */
  group: string;
  /** The whole sentence the cue came from, exactly as written. */
  sentence: string;
  /** The words in the sentence that triggered it. */
  matched: string;
  /** The sentence is unsure about it ("appeared to", "possibly"). */
  doubtful: boolean;
  /** "firm": the sentence says it happened. "low": a bare mention or a visit
   * with nothing said about what was done. */
  strength: "firm" | "low";
}

export const CUE_CATEGORY_LABELS: Record<CueCategory, string> = {
  items: "Items carried",
  devices: "Devices",
  money: "Money",
  meetings: "Meetings and exchanges",
  behaviour: "Behaviour",
};

// ─── Sentences ───────────────────────────────────────────────────────────────

/** A row's text as separate sentences (rows often hold several events). */
export function splitCueSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9("“])/)
    .map(s => s.trim())
    .filter(Boolean);
}

function quotedSpans(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /["“”][^"“”]{1,300}["“”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push([m.index, m.index + m[0].length]);
  return out;
}

const NEGATION =
  /\b(?:did\s+not|didn['’]t|does\s+not|doesn['’]t|do\s+not|not|no|never|without|nil|unable\s+to|could\s+not|couldn['’]t|cannot|can['’]t|wasn['’]t|was\s+not|were\s+not|weren['’]t|nothing)\b/i;

const DOUBT =
  /\b(?:appeared\s+to|appears\s+to|appearing\s+to|possibly|possible|believed|suspected|seemed|seems|might|may\s+have|could\s+have|unclear|not\s+clear|what\s+appeared|looked\s+like|thought\s+to\s+be|unconfirmed)\b/i;

function negatedBefore(s: string, index: number): boolean {
  // The words just before the cue, within the same clause.
  const before = s
    .slice(Math.max(0, index - 40), index)
    .split(/[,;]/)
    .pop()!;
  return NEGATION.test(before);
}

function doubtfulAround(s: string, start: number, end: number): boolean {
  return (
    DOUBT.test(s.slice(Math.max(0, start - 40), start)) ||
    DOUBT.test(s.slice(end, end + 25))
  );
}

// ─── Wording ─────────────────────────────────────────────────────────────────

const STOP = new Set(
  (
    "a an the his her their its one two three some several and or of from to in into on onto with " +
    "carrying carried holding held retrieved retrieving removed took taken taking collected placed " +
    "put pulled lifted loaded unloaded handed passed opened dropped left had has was were is by " +
    "then also while as at near outside inside their them him he she they it that this"
  ).split(" ")
);

/** "retrieved the brown suitcase" → ["brown"] : up to three words before the
 * noun, stopping at a function or verb word. */
function leadingWords(sentence: string, nounIndex: number): string[] {
  const words = sentence
    .slice(Math.max(0, nounIndex - 40), nounIndex)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = words.length - 1; i >= 0 && out.length < 3; i--) {
    const w = words[i].replace(/[^A-Za-z-]/g, "");
    if (!w || STOP.has(w.toLowerCase())) break;
    out.unshift(w.toLowerCase());
  }
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Things that are carried. "case" and "bin" are left out on purpose ("in
// case", "court case").
const ITEM_NOUN =
  "(?:suitcases?|bags?|handbags?|backpacks?|back\\s+packs?|rucksacks?|duff?le\\s+bags?|gym\\s+bags?|sports\\s+bags?|shopping\\s+bags?|plastic\\s+bags?|garbage\\s+bags?|luggage|briefcases?|satchels?|parcels?|packages?|envelopes?|cartons?|crates?|eskies|esky|boxes|box|items?|objects?|something|totes?|pouch(?:es)?|folders?|documents?|papers|notebooks?|diary|ledger|clipboard|laptop\\s+bag)";
const ITEM_NOUN_RE = new RegExp("\\b" + ITEM_NOUN + "\\b", "gi");
const ITEM_VERB =
  /\b(?:carry(?:ing)?|carried|hold(?:ing)?|held|retriev\w+|remov\w+|took|taken|taking|collect\w+|picked\s+up|place|places|placed|placing|put|putting|pulled|lifted|lifting|loaded|loading|unloaded|unloading|wheel\w+|dragg?\w+|handed|passed|swapp?\w+|exchang\w+|dropped|discard\w+|dispos\w+|dumped|threw|wearing|carries|produced|emptied)\b/i;
const NOT_AN_ITEM_BOX =
  /\b(?:post|phone|letter|mail|call|ticket|fuse|junction|horse|witness|jury|black|sound|money|gearbox|ballot)\s*$/i;

// ─── Items ───────────────────────────────────────────────────────────────────

function itemCues(
  s: string
): Omit<IntelCue, "sentence" | "doubtful" | "group">[] {
  const out: Omit<IntelCue, "sentence" | "doubtful" | "group">[] = [];
  ITEM_NOUN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ITEM_NOUN_RE.exec(s))) {
    const noun = m[0];
    const before = s.slice(0, m.index);
    if (/^box(es)?$/i.test(noun) && NOT_AN_ITEM_BOX.test(before)) continue;
    if (negatedBefore(s, m.index)) continue;
    const clause = before.split(/[;]/).pop()!;
    const hasVerb = ITEM_VERB.test(clause.slice(-70));
    const inVehicle =
      /\b(?:in|into|from|out\s+of|on)\s+the\s+(?:boot|back\s+seat|rear\s+seat|tray|rear)\b/i.test(
        s.slice(m.index, m.index + 50)
      );
    if (!hasVerb && !inVehicle) continue;
    const lead = leadingWords(s, m.index);
    out.push({
      category: "items",
      heading: cap([...lead, noun.toLowerCase()].join(" ")),
      matched: [...lead, noun].join(" "),
      strength: hasVerb ? "firm" : "low",
    });
  }
  return out;
}

// ─── Devices ─────────────────────────────────────────────────────────────────

const DEVICE_NOUN =
  "(?:mobile\\s+phones?|mobile|cell\\s*phones?|smart\\s*phones?|iphones?|phones?|burner|tablet|ipad|laptop|camera|binoculars|two[- ]way\\s+radio|radio|earpiece|headset|earphones|headphones|dash\\s*cam|gps|tracker|drone|sim\\s+card|usb|hard\\s+drive|thumb\\s+drive)";
const DEVICE_RE = new RegExp("\\b" + DEVICE_NOUN + "\\b", "gi");
const DEVICE_USE =
  /\b(?:us(?:ing|ed|es?)|on|answer\w+|made|making|receiv\w+|talk\w+|spoke|speaking|text\w+|typ\w+|check\w+|look\w+\s+at|hold\w+|held|took\s+out|produc\w+|pulled\s+out|retriev\w+|charg\w+|dial+ed|dial+ing|scroll\w+|film\w+|photograph\w+|record\w+|swap\w+|second|another|different|new|spare|additional|carry\w+)\b/i;
const NOT_A_DEVICE_PLACE =
  /\b(?:phone|mobile)\s+(?:box|booth|case|shop|store|repair|tower|shop|accessories)\b/i;
const CALL_WORDING =
  /\b(?:on\s+(?:a|the)\s+(?:phone\s+)?call|phone\s+call|video\s+call|text\s+messages?|texting|voice\s+(?:message|note)s?|whatsapp|facetime|messaging\s+app|signal\s+app|snapchat)\b/gi;

function deviceCues(
  s: string
): Omit<IntelCue, "sentence" | "doubtful" | "group">[] {
  const out: Omit<IntelCue, "sentence" | "doubtful" | "group">[] = [];
  if (NOT_A_DEVICE_PLACE.test(s)) {
    // "phone box" is a place; remove it so the word is not read as a device.
    s = s.replace(new RegExp(NOT_A_DEVICE_PLACE.source, "gi"), " ");
  }
  const pay = s.match(
    /\b(?:us(?:ing|ed)|on)\s+(?:a\s+|the\s+)?(?:pay\s*phone|public\s+(?:tele)?phone|phone\s+box|phone\s+booth)\b/i
  );
  if (pay && !negatedBefore(s, pay.index ?? 0))
    out.push({
      category: "devices",
      heading: "Public phone",
      matched: pay[0],
      strength: "firm",
    });
  DEVICE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DEVICE_RE.exec(s))) {
    if (negatedBefore(s, m.index)) continue;
    const window = s.slice(Math.max(0, m.index - 45), m.index + 30);
    if (!DEVICE_USE.test(window)) continue;
    const lead = leadingWords(s, m.index);
    const ordinal = lead.filter(w =>
      /^(second|another|different|new|spare|additional|burner|older)$/.test(w)
    );
    const base = /^(mobile|cell|smart|iphone|phone|burner)/i.test(m[0])
      ? "mobile phone"
      : m[0].toLowerCase();
    const isPhone = base === "mobile phone";
    out.push({
      category: "devices",
      heading: cap(
        ordinal.length
          ? [...ordinal, base].join(" ")
          : isPhone
            ? "Mobile phone"
            : base
      ),
      matched: m[0],
      strength: "firm",
    });
  }
  // A bare "phone" inside "phone call" / "pay phone" is that wording, not a
  // second cue for the device.
  const wordingSpans: Array<[number, number]> = [];
  {
    const spanRe = new RegExp(CALL_WORDING.source, "gi");
    let w: RegExpExecArray | null;
    while ((w = spanRe.exec(s)))
      wordingSpans.push([w.index, w.index + w[0].length]);
    if (pay)
      wordingSpans.push([pay.index ?? 0, (pay.index ?? 0) + pay[0].length]);
  }
  for (let i = out.length - 1; i >= 0; i--) {
    const c0 = out[i];
    if (c0.heading !== "Mobile phone") continue;
    const at = s.indexOf(c0.matched);
    if (
      /^phone$/i.test(c0.matched) &&
      wordingSpans.some(([a, b]) => at >= a - 12 && at < b)
    )
      out.splice(i, 1);
  }
  CALL_WORDING.lastIndex = 0;
  let c: RegExpExecArray | null;
  while ((c = CALL_WORDING.exec(s))) {
    if (negatedBefore(s, c.index)) continue;
    out.push({
      category: "devices",
      heading: /text|messag|whatsapp|signal|snapchat/i.test(c[0])
        ? "Messaging"
        : "Phone call",
      matched: c[0],
      strength: "firm",
    });
  }
  return out;
}

// ─── Money ───────────────────────────────────────────────────────────────────

const MONEY_RULES: Array<{
  re: RegExp;
  heading: string;
  strength: "firm" | "low";
}> = [
  {
    re: /\b(?:withdr(?:ew|aw|awing|awal)|took\s+out)\b[^;]{0,40}?(?:\b(?:cash|money|funds|notes)\b|\$\s?\d)/i,
    heading: "Cash withdrawal",
    strength: "firm",
  },
  {
    re: /\bdeposit(?:ed|ing)?\b[^;]{0,40}?(?:\b(?:cash|money|cheque|check|funds|notes)\b|\$\s?\d)/i,
    heading: "Deposit",
    strength: "firm",
  },
  {
    re: /\bcount(?:ed|ing)\s+(?:the\s+|a\s+|some\s+)?(?:cash|money|notes|bundle)/i,
    heading: "Counted cash",
    strength: "firm",
  },
  {
    re: /\b(?:roll|wad|bundle|stack)\s+of\s+(?:cash|notes|money)\b/i,
    heading: "Cash on hand",
    strength: "firm",
  },
  {
    re: /\b(?:handed|passed|gave|received|exchanged)\b[^;]{0,40}?(?:\b(?:cash|money|notes)\b|\$\s?\d)/i,
    heading: "Cash handed over",
    strength: "firm",
  },
  {
    re: /\b(?:paid|payment)\b[^.]{0,20}?\b(?:in\s+cash|with\s+cash|cash)\b|\bcash\s+payment\b/i,
    heading: "Cash payment",
    strength: "firm",
  },
  {
    re: /\bwestern\s+union|moneygram|money\s+transfer|remittance|wire\s+transfer|currency\s+exchange|foreign\s+exchange\b/i,
    heading: "Money transfer / exchange",
    strength: "firm",
  },
  {
    re: /\b(?:us(?:ed|ing)|inserted|swip\w+)\s+(?:a\s+|his\s+|her\s+|the\s+)?(?:bank|credit|debit|gift)?\s*card\b/i,
    heading: "Card use",
    strength: "low",
  },
];
const ATM_ACTION =
  /\b(?:withdr\w+|deposit\w*|us(?:ed|ing)|inserted|entered\s+(?:a\s+)?pin|transaction|checked\s+(?:his\s+|her\s+)?balance|card|cash|money)\b/i;

function moneyCues(
  s: string
): Omit<IntelCue, "sentence" | "doubtful" | "group">[] {
  const out: Omit<IntelCue, "sentence" | "doubtful" | "group">[] = [];
  for (const r of MONEY_RULES) {
    const m = r.re.exec(s);
    if (m && !negatedBefore(s, m.index))
      out.push({
        category: "money",
        heading: r.heading,
        matched: m[0],
        strength: r.strength,
      });
  }
  const atm = /\bATMs?\b/.exec(s);
  if (atm && !negatedBefore(s, atm.index)) {
    // "arrived at Westpac ATM (Westpac ATM)" names a place; only a sentence
    // that says what was done at it is an action.
    const withBracket = /\(\s*[^)]*\bATM\b[^)]*\)/.test(s);
    const done = ATM_ACTION.test(s.replace(/\([^)]*\)/g, " "));
    if (done)
      out.push({
        category: "money",
        heading: /deposit/i.test(s)
          ? "ATM deposit"
          : /withdr|took\s+out/i.test(s)
            ? "ATM withdrawal"
            : "ATM use",
        matched: atm[0],
        strength: "firm",
      });
    else if (
      /\b(?:walked|approached|attended|stopped|went|entered|queued)\b/i.test(
        s
      ) &&
      !(withBracket && /\bat\b[^.]*\(/.test(s))
    )
      out.push({
        category: "money",
        heading: "ATM visited",
        matched: atm[0],
        strength: "low",
      });
  }
  // "walked to the ATM and withdrew cash" is one cue, not two.
  let kept = out;
  if (kept.some(c => c.heading === "ATM withdrawal"))
    kept = kept.filter(c => c.heading !== "Cash withdrawal");
  if (kept.some(c => c.heading === "ATM deposit"))
    kept = kept.filter(c => c.heading !== "Deposit");
  return kept;
}

// ─── Meetings and exchanges ──────────────────────────────────────────────────

const PERSON_WORD =
  "(?:U[MFCP]\\d+|unidentified|unknown|male|female|man|woman|person|youth|driver|[A-Z]{3,}(?:\\s+[A-Z]{3,})?)";
const MEET_RULES: Array<{
  re: RegExp;
  heading: string;
  strength: "firm" | "low";
}> = [
  {
    re: new RegExp(
      "\\b(?:handed|passed|gave|received|exchanged|swapped|delivered|dropped\\s+off)\\b[^.]{0,60}?\\b(?:to|from|with)\\s+(?:an?\\s+|the\\s+)?(?:\\w+\\s+){0,2}?" +
        PERSON_WORD,
      ""
    ),
    heading: "Hand-over / exchange",
    strength: "firm",
  },
  {
    re: /\b(?:shook\s+hands?|handshake|embraced|hugged)\b/i,
    heading: "Greeting (handshake / embrace)",
    strength: "firm",
  },
  {
    re: /\bexchanged\s+(?:items?|bags?|phones?|packages?|words)\b/i,
    heading: "Hand-over / exchange",
    strength: "firm",
  },
  {
    re: /\b(?:brief|short|quick)\s+(?:meeting|conversation|exchange|chat)\b/i,
    heading: "Brief meeting",
    strength: "firm",
  },
  {
    re: /\b(?:met\s+with|met\b|meeting\s+with|spoke\s+(?:with|to)|talk(?:ed|ing)\s+(?:with|to)|in\s+conversation\s+with|conversed\s+with|greeted|approached\s+by|joined\s+by)\b/i,
    heading: "Met / spoke with",
    strength: "low",
  },
];

function meetingCues(
  s: string
): Omit<IntelCue, "sentence" | "doubtful" | "group">[] {
  const out: Omit<IntelCue, "sentence" | "doubtful" | "group">[] = [];
  for (const r of MEET_RULES) {
    const m = r.re.exec(s);
    if (m && !negatedBefore(s, m.index))
      out.push({
        category: "meetings",
        heading: r.heading,
        matched: m[0],
        strength: r.strength,
      });
  }
  // One heading per sentence: an exchange is the stronger reading of a meeting.
  const hasFirm = out.some(c => c.strength === "firm");
  return hasFirm ? out.filter(c => c.strength === "firm") : out;
}

// ─── Behaviour ───────────────────────────────────────────────────────────────

const BEHAVIOUR_RULES: Array<{ re: RegExp; heading: string }> = [
  {
    re: /\b(?:u[- ]?turn|doubled\s+back|turned\s+around\s+(?:suddenly|abruptly)|circled\s+the\s+block|drove\s+around\s+the\s+block|did\s+a\s+lap|went\s+around\s+the\s+block|walked\s+in\s+a\s+circle)\b/i,
    heading: "Doubled back / circled",
  },
  {
    re: /\b(?:looked|looking|glanced|glancing|checked|checking)\s+(?:over\s+(?:his|her|their)\s+shoulder|behind|back|around|(?:in\s+)?(?:the\s+|his\s+|her\s+)?(?:rear[- ]?view\s+)?mirrors?|up\s+and\s+down\s+the\s+street)/i,
    heading: "Checking surroundings",
  },
  {
    re: /\b(?:scanned|scanning)\s+the\s+(?:street|area|surrounds|car\s+park)\b|\b(?:counter|anti)[- ]?surveillance\b|\bsurveillance\s+aware\b/i,
    heading: "Possible counter-surveillance",
  },
  {
    re: /\b(?:stopped|slowed|braked)\s+suddenly\b|\bsped\s+up\b|\bran\s+a\s+red\s+light\b|\baccelerated\s+(?:hard|suddenly|rapidly)\b/i,
    heading: "Sudden change of speed",
  },
  {
    re: /\b(?:changed|swapped|switched)\s+(?:(?:his|her|their|the|a)\s+)?(?:vehicles?|cars?|clothes|clothing|jackets?|shirts?|hats?|tops?)\b|\bput\s+on\s+(?:a\s+)?(?:hat|cap|hoodie|jacket|mask|sunglasses|disguise)\b|\bcovered\s+(?:his|her|their)\s+face\b/i,
    heading: "Changed vehicle / appearance",
  },
  {
    re: /\b(?:opened|open)\s+the\s+(?:boot|bonnet|tailgate)\b/i,
    heading: "Opened boot / bonnet",
  },
];

function behaviourCues(
  s: string
): Omit<IntelCue, "sentence" | "doubtful" | "group">[] {
  const out: Omit<IntelCue, "sentence" | "doubtful" | "group">[] = [];
  for (const r of BEHAVIOUR_RULES) {
    const m = r.re.exec(s);
    if (m && !negatedBefore(s, m.index))
      out.push({
        category: "behaviour",
        heading: r.heading,
        matched: m[0],
        strength: "firm",
      });
  }
  return out;
}

// ─── Public ──────────────────────────────────────────────────────────────────

/** The word repeats are counted under: "brown suitcase" and "blue suitcases"
 * are both "suitcase". */
function cueGroup(c: {
  category: CueCategory;
  heading: string;
  matched: string;
}) {
  if (c.category !== "items") return c.heading.toLowerCase();
  const noun = c.matched.trim().split(/\s+/).pop()!.toLowerCase();
  if (/^(luggage|something|papers)$/.test(noun)) return noun;
  if (/^(boxes)$/.test(noun)) return "box";
  if (/^(eskies)$/.test(noun)) return "esky";
  return noun.replace(/s$/, "");
}

/** Every cue in a row's text, one sentence at a time. */
export function findIntelCues(text: string | null | undefined): IntelCue[] {
  if (!text) return [];
  const out: IntelCue[] = [];
  for (const sentence of splitCueSentences(text)) {
    const quotes = quotedSpans(sentence);
    const found = [
      ...itemCues(sentence),
      ...deviceCues(sentence),
      ...moneyCues(sentence),
      ...meetingCues(sentence),
      ...behaviourCues(sentence),
    ];
    for (const c of found) {
      const at = sentence.toLowerCase().indexOf(c.matched.toLowerCase());
      if (at >= 0 && quotes.some(([a, b]) => at >= a && at < b)) continue;
      out.push({
        ...c,
        group: cueGroup(c),
        sentence,
        doubtful:
          at >= 0 ? doubtfulAround(sentence, at, at + c.matched.length) : false,
      });
    }
  }
  // The same heading from the same sentence is one cue.
  const seen = new Set<string>();
  return out.filter(c => {
    const k = `${c.category}|${c.heading}|${c.sentence}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
