// When does editing a row take its signatures away?
//
// A row that is only part-signed can still be edited, but once its words or
// time change, what the officers signed is no longer what the row says — so
// their signatures are removed (the server does it; the screen warns first).
// Saving the same text again changes nothing and keeps them. One rule, used by
// the server and by the screen so they always agree.

export type RowEditFields = {
  time?: string | null;
  timeMinutes?: number | null;
  dayOffset?: number | null;
  rowDate?: string | null;
  observation?: string | null;
};

/** True when `edit` really changes something the row holds. Fields the edit
 * leaves out (undefined) are not changes. */
export function rowEditChangesContent(
  row: RowEditFields,
  edit: RowEditFields
): boolean {
  const text = (v: string | null | undefined) => v ?? "";
  if (
    edit.observation !== undefined &&
    text(edit.observation) !== text(row.observation)
  )
    return true;
  if (edit.time !== undefined && text(edit.time) !== text(row.time))
    return true;
  if (edit.rowDate !== undefined && text(edit.rowDate) !== text(row.rowDate))
    return true;
  if (edit.timeMinutes !== undefined && edit.timeMinutes !== row.timeMinutes)
    return true;
  if (edit.dayOffset !== undefined && edit.dayOffset !== row.dayOffset)
    return true;
  return false;
}

/** The warning shown before such an edit is saved. */
export function signatureRemovalWarning(signedBy: string[]): string {
  const who = signedBy.length > 0 ? ` (${signedBy.join(", ")})` : "";
  return `This row has already been signed${who}. Changing it will remove those signatures, and everyone will need to sign it again. Save the change?`;
}
