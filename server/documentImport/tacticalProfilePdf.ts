// Reads a "Tactical Profile" that arrived as a PDF.
//
// The Word version of this template is a set of tables, which
// tacticalProfileCards.ts reads card by card (a TARGET card per target, an
// ASSOCIATE card per associate, each saying who it belongs to). A PDF carries
// the same cards as a flat run of text paragraphs, so the generic PDF path saw
// one pile of text: the first target's name, every address and vehicle in the
// document in one list, and a pool of look-alike "names". This module finds the
// cards in that run of paragraphs and rebuilds the SAME table shapes the Word
// reader sees, so the one existing card reader and mapper (tacticalProfileCards
// → mapTacticalProfile) handle both formats — there is no second set of rules
// for what a card means, only this recognition of where each card starts.
//
// Fully deterministic, no AI (CLAUDE.md Golden Rule). It only fires on the
// template's own signature — an "Associate of Target" paragraph, or a "Target"
// paragraph followed by a person's name and a TELCO line — so any other PDF is
// left to the generic reader exactly as before.
import { matchWholeLinePersonName } from "./freeTextEntityScan";
import { normaliseTacticalDob } from "./tacticalProfileCards";
import type { DocumentTable } from "./documentReadResult";

// Page furniture repeated on every page (classification banner, FOI footer).
const FURNITURE_RES = [
  /^(PROTECTED|OFFICIAL|SENSITIVE|UNCLASSIFIED)$/i,
  /^(PROTECTED|OFFICIAL|SENSITIVE)\b.*\bUpdated\b/i,
  /^FREEDOM OF INFORMATION\b/i,
  /^Page \d+ of \d+$/i,
];

const POSTCODE_RE = /\b(?:WA|VIC|NSW|QLD|SA|TAS|NT|ACT)\s+\d{4}\b/;
const REGO_START_RE =
  /(?=\b[A-Z0-9]{3,8}\s*\((?:WA|VIC|NSW|QLD|SA|TAS|NT|ACT)\))/;
const BARE_REGO_RE = /^(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{3,8}$/;
const END_OF_CARDS_RE =
  /^(AOI\s*\d+\b|Operational Background\b|ADDRESS ASSESSMENT\b|Date\s+Version\b)/i;

const flat = (s: string) =>
  s
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "1MIR84 (WA) 2023 black Audi Q5 wagon. 1TDM414 (WA) …" → one vehicle per line. */
function vehicleLines(text: string): string {
  return flat(text)
    .split(REGO_START_RE)
    .map(s => s.trim())
    .filter(Boolean)
    .join("\n");
}

/** A name paragraph, with the DOB some cards print beside it. */
function readNameParagraph(p: string): { name: string; dob: string } | null {
  const m = flat(p).match(/^(.*?)(?:\s+DOB\s*:?\s*(\S+)(?:\s*\|.*)?)?$/i);
  const name = m?.[1]?.trim() ?? "";
  if (!name || !matchWholeLinePersonName(name)) return null;
  return { name, dob: m?.[2] ? normaliseTacticalDob(m[2]) : "" };
}

const looksLikeAddress = (p: string) => POSTCODE_RE.test(p);

interface Located {
  kind: "target" | "associate";
  /** First paragraph of the card. */
  start: number;
  /** The "Associate of Target" paragraph (associates only). */
  anchor?: number;
}

/** The paragraphs with page furniture removed. */
function cleanParagraphs(paragraphs: string[]): string[] {
  return paragraphs
    .map(p => p.trim())
    .filter(p => p && !FURNITURE_RES.some(re => re.test(p)));
}

function locateCards(P: string[]): Located[] {
  const found: Located[] = [];
  for (let i = 0; i < P.length; i++) {
    if (
      P[i] === "Target" &&
      i + 1 < P.length &&
      matchWholeLinePersonName(P[i + 1])
    ) {
      found.push({ kind: "target", start: i });
    }
  }
  let lowest = 0;
  for (let j = 0; j < P.length; j++) {
    if (!/^Associate of Target\b/i.test(P[j])) continue;
    // The card's name paragraph is the nearest one above its anchor, past the
    // previous card's owner line.
    let nameIdx = -1;
    for (let k = j - 1; k >= lowest; k--) {
      if (readNameParagraph(P[k])) {
        nameIdx = k;
        break;
      }
    }
    if (nameIdx === -1) continue;
    found.push({ kind: "associate", start: nameIdx, anchor: j });
    lowest = j + 1;
  }
  return found.sort((a, b) => a.start - b.start);
}

// ── Target card ──────────────────────────────────────────────────────────────

const TELCO_LABELS = [
  "TELCO",
  "PD",
  "LBS",
  "EBM",
  "INTERCEPT",
  "STATUS",
  "MOB",
];

/** "TELCO 0478 316 905 PD PD-AUR-A-104 … STATUSACTIVE MOB MOB-…" → label → value.
 * A value the PDF printed away from its label ("PD" … "PD-AUR-C-104" later) is
 * handed back to the label it names. */
function readTelcoHeader(text: string): Map<string, string> {
  const re =
    /\b(TELCO|PD|LBS|EBM|INTERCEPT|STATUS|MOB)(?=\s|$|ACTIVE|INACTIVE)/g;
  const found: Array<{ label: string; at: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    found.push({ label: m[1], at: m.index, end: m.index + m[0].length });
  }
  const values = new Map<string, string>();
  found.forEach((f, i) => {
    const next = found[i + 1]?.at ?? text.length;
    values.set(f.label, text.slice(f.end, next).trim());
  });
  // Hand stray values back to the label they name.
  for (const label of TELCO_LABELS) {
    if (values.get(label) !== "") continue;
    for (const [other, v] of Array.from(values.entries())) {
      if (other === label) continue;
      const tokens = v.split(/\s+/);
      const hit = tokens.findIndex(t =>
        label === "STATUS"
          ? /^(ACTIVE|INACTIVE|CLOSED|SUSPENDED)$/i.test(t)
          : new RegExp(`^${label}-`).test(t)
      );
      if (hit !== -1) {
        values.set(label, tokens[hit]);
        tokens.splice(hit, 1);
        values.set(other, tokens.join(" "));
        break;
      }
    }
  }
  return values;
}

/** Vehicles for a card: "Registered Vehicles" / "Linked Vehicles" modes as the
 * labels go by; a vehicle the PDF wrapped over several paragraphs is rejoined. */
function readVehicleParagraphs(paragraphs: string[]): {
  registered: string;
  linked: string;
} {
  const buf = { registered: "", linked: "" };
  let mode: "registered" | "linked" = "registered";
  const LABEL_ONLY =
    /^(Registered\s+Vehicles?)(\s+Linked\s+Vehicles?)?$|^(Linked\s+Vehicles?)$/i;
  for (const raw of paragraphs) {
    const p = flat(raw);
    if (/^(BAIL|SOCIAL MEDIA|INTEL|LIFESTYLE|ADDRESS ASSESSMENT)$/i.test(p))
      break;
    const label = p.match(LABEL_ONLY);
    if (label) {
      // "Registered Vehicles Linked Vehicles" is two column headings side by
      // side: what follows under it is the first column's.
      mode = label[3] ? "linked" : "registered";
      continue;
    }
    // "Registered Vehicles 1TRA81 … Linked Vehicles 1AJT52 …" in one paragraph.
    if (/\b(Registered|Linked)\s+Vehicles?\b/i.test(p)) {
      const parts = p.split(/\b(Registered|Linked)\s+Vehicles?\b/i);
      for (let i = 1; i < parts.length; i += 2) {
        const m = /^linked$/i.test(parts[i]) ? "linked" : "registered";
        buf[m] += ` ${parts[i + 1] ?? ""}`;
        mode = m;
      }
      continue;
    }
    // A vehicle starts at a registration (bare, or with its "(WA)"), and one the
    // PDF wrapped over several paragraphs carries on until its full stop.
    const continuing =
      buf[mode].trim() !== "" && !/\.\s*$/.test(buf[mode].trim());
    if (REGO_START_RE.test(p) || BARE_REGO_RE.test(p) || continuing)
      buf[mode] += ` ${p}`;
  }
  return {
    registered: vehicleLines(buf.registered),
    linked: vehicleLines(buf.linked),
  };
}

function targetTables(R: string[]): DocumentTable[] {
  const name = R[1];
  const body = R.slice(2);
  const idx = (re: RegExp, from = 0) => {
    for (let i = from; i < body.length; i++)
      if (re.test(flat(body[i]))) return i;
    return -1;
  };

  const dobHit = body.map(flat).find(p => /\bDOB\b/i.test(p));
  const dobM = dobHit?.match(/\bDOB\b\s*:?\s*(\S+)/i);
  const ageM = dobHit?.match(/\bAge\b\s*(\d+)/i);
  const dob = dobM ? normaliseTacticalDob(dobM[1]) : "";

  const descIdx = idx(/^Description\b/i);
  const description =
    descIdx === -1 ? "" : flat(body[descIdx]).replace(/^Description\s*/i, "");

  const bgIdx = idx(/^Target Background\b/i);
  const headerEnd = bgIdx === -1 ? body.length : bgIdx;
  const telco = readTelcoHeader(
    body
      .slice(descIdx === -1 ? 0 : descIdx + 1, headerEnd)
      .map(flat)
      .join(" ")
  );
  const telcoCell = (label: string) => {
    const v = (telco.get(label) ?? "").trim();
    return v ? `${label}\n${v}` : label;
  };

  // Background runs up to the "WA MDL: …" line that closes the template's
  // cell; that line goes in a cell of its own so it is read as the licence
  // answer whether or not the Warnings / Alerts lines sit above it.
  const mdlIdx = idx(/^WA\s*MDL\b/i, bgIdx === -1 ? 0 : bgIdx);
  const homeIdx = idx(/^Home Address$/i, bgIdx === -1 ? 0 : bgIdx);
  const bgEnd =
    mdlIdx !== -1
      ? mdlIdx + 1
      : homeIdx !== -1
        ? homeIdx
        : bgIdx === -1
          ? 0
          : body.length;
  const background =
    bgIdx === -1
      ? ""
      : body
          .slice(bgIdx, mdlIdx !== -1 ? mdlIdx : bgEnd)
          .map(p => p.trim())
          .join("\n\n");
  const mdlCell = mdlIdx !== -1 ? flat(body[mdlIdx]) : "";

  // Addresses follow the background: "Home Address", its value(s), "Other
  // Frequented", its value(s) — a value is every address-shaped paragraph.
  const rest = body.slice(bgEnd);
  const homeAt = rest.findIndex(p => /^Home Address$/i.test(flat(p)));
  const readAddresses = (from: number): { lines: string[]; next: number } => {
    const lines: string[] = [];
    let i = from;
    while (i < rest.length && looksLikeAddress(rest[i])) {
      lines.push(flat(rest[i]));
      i++;
    }
    return { lines, next: i };
  };
  let home: string[] = [];
  let other: string[] = [];
  let afterAddr = 0;
  if (homeAt !== -1) {
    const h = readAddresses(homeAt + 1);
    home = h.lines;
    afterAddr = h.next;
    if (rest[afterAddr] && /^Other Frequented$/i.test(flat(rest[afterAddr]))) {
      const o = readAddresses(afterAddr + 1);
      other = o.lines;
      afterAddr = o.next;
    }
  }
  const vehicles = readVehicleParagraphs(rest.slice(afterAddr));

  const addressCell = [
    home.length ? `Home Address\n${home.join("\n")}` : "",
    other.length ? `Other Frequented\n${other.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const card: DocumentTable = {
    rows: [
      ["", "Target", name, ""],
      ["", "Age", ageM?.[1] ?? "", "Years", "DOB", dob, ""],
      ["", "Description", description, ""],
      [
        "",
        telcoCell("TELCO"),
        telcoCell("PD"),
        telcoCell("LBS"),
        telcoCell("EBM"),
        "",
      ],
      ["", telcoCell("INTERCEPT"), telcoCell("STATUS"), telcoCell("MOB"), ""],
      ["", background],
      ["", mdlCell],
    ],
  };
  const details: DocumentTable = {
    rows: [
      ["ADDRESSES ADDRESSES", addressCell],
      [
        "",
        vehicles.registered
          ? `Registered Vehicles\n${vehicles.registered}`
          : "",
        "",
        vehicles.linked ? `Linked Vehicles\n${vehicles.linked}` : "",
      ],
    ],
  };
  return [card, details];
}

// ── Associate card ───────────────────────────────────────────────────────────

const ASSOCIATE_TOKEN_RE =
  /(?:^|\s)(Warnings \(Relevant\)|Alerts|Linked Ops|WA MDL:?|Registered Vehicles|Linked Vehicles|TELCO|OTHER INFO|SOCIAL MEDIA)(?=\s|$)/gi;

function associateTables(
  R: string[],
  loc: Located,
  P: string[],
  dobFromBox: string
): DocumentTable[] {
  const nameInfo = readNameParagraph(P[loc.start])!;
  const anchor = (loc.anchor ?? loc.start) - loc.start;
  const address = R.slice(1, anchor).map(flat).find(looksLikeAddress) ?? "";
  const ownerInline = flat(R[anchor]).replace(/^Associate of Target\s*/i, "");
  const ownerIsInline =
    !!ownerInline && !!matchWholeLinePersonName(ownerInline);
  const nextPara = flat(R[anchor + 1] ?? "");
  const ownerIsNext = !ownerIsInline && !!matchWholeLinePersonName(nextPara);
  const owner = ownerIsInline ? ownerInline : ownerIsNext ? nextPara : "";
  const afterOwner = R.slice(anchor + 1 + (ownerIsNext ? 1 : 0));
  const text = flat(afterOwner.join(" "));

  const sections = new Map<string, string>();
  const marks: Array<{ key: string; end: number; at: number }> = [];
  ASSOCIATE_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ASSOCIATE_TOKEN_RE.exec(text)) !== null) {
    marks.push({
      key: m[1].toUpperCase().replace(/:$/, ""),
      at: m.index,
      end: m.index + m[0].length,
    });
  }
  marks.forEach((mk, i) => {
    const next = marks[i + 1]?.at ?? text.length;
    sections.set(mk.key, text.slice(mk.end, next).trim());
  });

  const dob = nameInfo.dob || dobFromBox;
  const nameCell = dob ? `${nameInfo.name}\nDOB: ${dob}` : nameInfo.name;

  const telcoText = sections.get("TELCO") ?? "";
  const telcoCells: string[] = [];
  if (telcoText) {
    const lab = telcoText.search(/\b(PD|LBS|EBM|MOB)\s*-/);
    const phone = (lab === -1 ? telcoText : telcoText.slice(0, lab)).trim();
    telcoCells.push("TELCO", phone);
    if (lab !== -1) {
      const re = /\b(PD|LBS|EBM|MOB)\s*-\s*(\S+)/g;
      let t: RegExpExecArray | null;
      while ((t = re.exec(telcoText.slice(lab))) !== null)
        telcoCells.push(`${t[1]} - ${t[2]}`);
    }
  }

  const card: DocumentTable = {
    rows: [
      [nameCell, address, ""],
      ["", `Associate of Target\n${owner}`, ""],
    ],
  };
  const labelled = (label: string, key: string, asLines = false) => {
    const v = sections.get(key);
    if (v === undefined) return "";
    return `${label}\n${asLines ? vehicleLines(v) : v}`;
  };
  const mdl = sections.get("WA MDL");
  const details: DocumentTable = {
    rows: [
      [
        labelled("Warnings (Relevant)", "WARNINGS (RELEVANT)"),
        labelled("Alerts", "ALERTS"),
        labelled("Linked Ops", "LINKED OPS"),
        mdl !== undefined ? `WA MDL: ${mdl}` : "",
      ],
      [
        labelled("Registered Vehicles", "REGISTERED VEHICLES", true),
        labelled("Linked Vehicles", "LINKED VEHICLES", true),
      ],
      telcoCells,
      [
        labelled("OTHER INFO", "OTHER INFO"),
        // Always present, so the details table is recognised as part of the
        // card even when the associate has no vehicles.
        `SOCIAL MEDIA\n${sections.get("SOCIAL MEDIA") ?? ""}`,
      ],
    ],
  };
  return [card, details];
}

// ── Whole document ───────────────────────────────────────────────────────────

/**
 * The tables a Tactical Profile PDF would have been as a Word document, or null
 * when the PDF isn't one. `paragraphs` and `pdfTables` are what
 * pdfTextReader.readPdfText produced.
 */
export function tacticalTablesFromPdf(
  paragraphs: string[],
  pdfTables: DocumentTable[]
): DocumentTable[] | null {
  const P = cleanParagraphs(paragraphs);
  const located = locateCards(P);
  if (located.length === 0) return null;
  const targets = located.filter(c => c.kind === "target");
  if (targets.length === 0) return null;
  // A "Target" card must carry the template's TELCO line, an associate card
  // its "Associate of Target" anchor — a stray "Target" heading isn't enough.
  const hasTelco = (c: Located, end: number) =>
    P.slice(c.start, end).some(p => /^TELCO\b/i.test(p));

  const firstStart = located[0].start;
  const endMarker = P.findIndex(
    (p, i) => i > firstStart && END_OF_CARDS_RE.test(p)
  );

  // DOBs printed in a separate box (the PDF text layer lists them apart from
  // the card) are matched to the associates that don't carry one inline, in
  // document order — only when the counts agree.
  const boxDobs = pdfTables
    .flatMap(t => t.rows)
    .filter(r => /^DOB$/i.test(r[0]?.trim() ?? ""))
    .map(r => normaliseTacticalDob(r[1] ?? ""))
    .filter(Boolean);
  const associates = located.filter(c => c.kind === "associate");
  const needDob = associates.filter(c => !readNameParagraph(P[c.start])!.dob);
  const useBoxDobs = boxDobs.length > 0 && boxDobs.length === needDob.length;

  const tables: DocumentTable[] = [];

  // Operation header (classification, operation, IO, supervisor).
  const head: string[][] = [];
  for (let i = 0; i < firstStart; i++) {
    const p = P[i];
    if (/^(SU )?Tactical Profile$/i.test(p)) continue;
    const io = p.match(/^(IO|Sup)\s+(.+)$/);
    if (io) head.push([io[1], io[2]]);
    else if (/^[A-Z0-9][A-Z0-9 /-]+\s+\d{2}\/[A-Z]{3}\/\d{4}$/i.test(flat(p)))
      head.unshift([flat(p)]);
    else if (head.length && matchWholeLinePersonName(p)) head.push([p]);
    if (/^TARGETS\b/i.test(p)) break;
  }
  if (head.length) tables.push({ rows: head });

  let boxIdx = 0;
  let cardsBuilt = 0;
  located.forEach((c, n) => {
    const next = located[n + 1]?.start ?? P.length;
    const end = Math.min(
      next,
      endMarker !== -1 && endMarker > c.start ? endMarker : P.length
    );
    const R = P.slice(c.start, end);
    if (c.kind === "target") {
      if (!hasTelco(c, end)) return;
      cardsBuilt++;
      tables.push(...targetTables(R));
    } else {
      const inline = readNameParagraph(P[c.start])!.dob;
      const box = !inline && useBoxDobs ? (boxDobs[boxIdx++] ?? "") : "";
      cardsBuilt++;
      tables.push(...associateTables(R, c, P, box));
    }
  });
  if (cardsBuilt === 0) return null;

  // "Target's and Associate's Vehicles": one list for the whole document.
  const listAt = P.findIndex(p =>
    /^Target.s and Associate.s Vehicles\b/i.test(p)
  );
  if (listAt !== -1) {
    const stop = P.findIndex(
      (p, i) =>
        i > listAt &&
        /^(Other Vehicles Sighted|VEHICLES OF INTEREST)\b/i.test(p)
    );
    const nextCard = located.find(c => c.start > listAt)?.start ?? P.length;
    const region = P.slice(
      listAt,
      stop === -1 ? nextCard : Math.min(stop, nextCard)
    );
    const names = targets
      .map(t => P[t.start + 1])
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const splitter = new RegExp(
      `(?=(?:Linked|${names.join("|")})\\s+[–-]\\s+)`
    );
    const joined = flat(region.join(" "))
      .replace(/^Target.s and Associate.s Vehicles\s*/i, "")
      .replace(/\s*Driver & Owner Details\s*/gi, " ");
    const lines = joined
      .split(splitter)
      .map(s => s.trim())
      .filter(Boolean);
    if (lines.length)
      tables.push({
        rows: [
          ["Target’s and Associate’s Vehicles", "Driver & Owner Details"],
          ...lines.map(l => [l, ""]),
        ],
      });
  }
  return tables;
}
