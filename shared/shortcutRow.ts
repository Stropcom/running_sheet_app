// ─── Shortcuts that start their own row ─────────────────────────────────────
// Some shortcut chips (TP "on the phone", TEXT "texting") are a whole
// observation about the target, not a phrase to drop into a sentence. On the
// Shortcuts page an admin marks them "Own row": one tap then adds a new row
// with the current time and the target's SURNAME at the start —
//
//   SANTOS had a mobile phone to his ear and appeared to be in conversation on
//   the phone.
//
// Pure rules (no screen, no database), so the main sheet, RS Quick Entry and
// the server all read them the same way. The expansion itself is NEVER
// changed — chips and shortcuts are written exactly as the Shortcuts page has
// them; the surname is put in front of it, nothing else. Write the expansion
// so it follows a name ("had a mobile phone to his ear …").

/** What the subject rule needs from a Target record. */
export interface ShortcutRowTarget {
  /** "person" (the default), "vehicle" or "location". */
  targetType?: string | null;
  /** The target's TGT short form — the word the team writes for them. */
  tgt?: string | null;
  /** The target's surname (stored upper case). */
  surname?: string | null;
}

/**
 * The word that opens the row: the person target's TGT short form (the same
 * word the TGT chip writes, so Intelligence reads the row as being about
 * them), else their surname — upper case. Null when the sheet has no person
 * target (a vehicle or location target, or none): there is no name to put
 * first, and none is ever guessed.
 */
export function shortcutRowSubject(
  target: ShortcutRowTarget | null | undefined
): string | null {
  if (!target) return null;
  if (target.targetType && target.targetType !== "person") return null;
  const word = (target.tgt ?? "").trim() || (target.surname ?? "").trim();
  if (!word) return null;
  return word.toUpperCase();
}

/**
 * The text of the new row: the subject, a space, then the expansion exactly as
 * saved. An expansion that already starts with that name is left as it is (no
 * "SANTOS SANTOS …"). Null when there is no subject or no expansion.
 */
export function shortcutRowText(
  subject: string | null | undefined,
  expansion: string | null | undefined
): string | null {
  const s = (subject ?? "").trim();
  const e = (expansion ?? "").trim();
  if (!s || !e) return null;
  const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^${escaped}(?![A-Za-z0-9])`, "i").test(e)) return e;
  return `${s} ${e}`;
}
